import * as THREE from "three";

/**
 * Primitives shared by the replay 3D renderer and its venue builders: quality
 * and environment style shapes, theme colour resolution, angle helpers, sector
 * sampling, and the rounded block geometry used for built venue forms.
 *
 * This module exists so `renderer3dEnvironment.ts` and `renderer3d.ts` can both
 * depend on these without importing each other. Keep it free of dependencies
 * beyond Three.js.
 */

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface QualityConfig {
  dprCap: number;
  antialias: boolean;
  laneSegments: number;
  /** Plane segments per side (1 = flat, no displacement). */
  groundSegments: number;
  displacement: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Number of wake segments trailing each boat (0 = no wake). */
  wake: number;
  /** Buoy lines marking the lane edges (one InstancedMesh, static). */
  buoys: boolean;
  buoysPerRing: number;
  buoyRings: number;
  /** Catch spray droplets on the live lane (one InstancedMesh draw). */
  spray: boolean;
  sprayParticles: number;
  sprayPerCatch: number;
  /** Density of optional venue dressing. The authored skyline remains at every tier. */
  environmentDetail: 0 | 1 | 2 | 3;
  /** Procedural athlete body resolution: limb rings, caps, and hands. */
  bodySegments: number;
}

export const WORLD_UP = new THREE.Vector3(0, 1, 0);

export type ThemeName = "light" | "dark";

export type ThemeColor = (theme: ThemeName) => number;

export interface EnvironmentStyle {
  skyZenith: ThemeColor;
  skyHorizon: ThemeColor;
  skyNadir: ThemeColor;
  fog: ThemeColor;
  fogNear: number;
  fogFar: number;
  hemisphereSky: ThemeColor;
  hemisphereGround: ThemeColor;
  hemisphereIntensity: number;
  sun: ThemeColor;
  sunIntensity: number;
  fill: ThemeColor;
  fillIntensity: number;
  exposure: number;
  farSilhouette: ThemeColor;
  midSilhouette: ThemeColor;
  venueStructure: ThemeColor;
  venueAccent: ThemeColor;
  infield: ThemeColor;
  apron: ThemeColor;
  /**
   * Scene-level scalar on the image-based lighting built by
   * {@link makeSkyRadianceTexture}. Outdoor venues carry a full sky hemisphere
   * and take more; the enclosed velodrome takes less, because a roof is exactly
   * what stops ambient light arriving from above.
   */
  envIntensity: number;
  /**
   * Hemisphere intensity to use once IBL is on, replacing
   * {@link hemisphereIntensity}.
   *
   * The hemisphere light was tuned as the *only* ambient in the venue. The sky
   * radiance map now does that job, and more accurately, so leaving the
   * original value in place double-counts ambient and washes the venue out —
   * the RowErg basin loses its teal entirely. This is the rebalance, not a
   * dimmer: direct sun and fill are untouched, so contrast goes up while total
   * exposure stays where the art direction put it.
   */
  hemisphereIntensityIbl: number;
}

export interface EnvironmentSector {
  /** World-space course angle, using +Z as zero and increasing with travel. */
  readonly start: number;
  readonly span: number;
  /** Relative placement density inside this sector. */
  readonly weight?: number;
}

export const FULL_CIRCLE = Math.PI * 2;

export const degrees = (value: number): number => (value * Math.PI) / 180;

export function sectorSample(
  index: number,
  count: number,
  sectors: readonly EnvironmentSector[],
): { angle: number; sector: number; local: number } {
  const total = sectors.reduce((sum, sector) => sum + sector.span * (sector.weight ?? 1), 0);
  let cursor = ((index + 0.5) / Math.max(1, count)) * total;
  for (let sectorIndex = 0; sectorIndex < sectors.length; sectorIndex++) {
    const sector = sectors[sectorIndex];
    const weightedSpan = sector.span * (sector.weight ?? 1);
    if (cursor <= weightedSpan || sectorIndex === sectors.length - 1) {
      const local = clamp01(cursor / weightedSpan);
      return { angle: sector.start + sector.span * local, sector: sectorIndex, local };
    }
    cursor -= weightedSpan;
  }
  return { angle: sectors[0]?.start ?? 0, sector: 0, local: 0 };
}

export const themed =
  (light: number, dark: number): ThemeColor =>
  (theme) =>
    theme === "dark" ? dark : light;

const SKY_RADIANCE_WIDTH = 128;
const SKY_RADIANCE_HEIGHT = 64;
/** Tight solar disc, then the broad forward-scattered halo around it. */
const SUN_DISC_EXPONENT = 512;
const SUN_GLOW_EXPONENT = 12;
const SUN_GLOW_RADIANCE = 0.22;

function smoothstep(edge: number): number {
  const t = clamp01(edge);
  return t * t * (3 - 2 * t);
}

/**
 * Build the venue's image-based lighting as an equirectangular radiance map.
 *
 * Without this the scene has no `environment`, so every `MeshStandardMaterial`
 * and `MeshPhysicalMaterial` in the venue is lit by direct lights plus flat
 * hemisphere ambient only — metal reads dead, roughness variation does not
 * show, and the whole place flattens. The map is generated from the same
 * zenith/horizon/nadir/sun colours that already drive the sky dome, so the
 * lighting and the visible backdrop cannot drift apart, and it costs no
 * payload: no HDRI is downloaded, imported, or scanned.
 *
 * Half-float is deliberate. The solar disc carries radiance well above 1.0,
 * which is what produces a real specular response; 8-bit would clip it flat.
 * `rgba16float` is filterable on both WebGL2 and WebGPU, while `rgba32float`
 * needs an optional WebGPU feature and would fail on some adapters.
 *
 * Three prefilters this into a roughness-aware mip chain itself once it is
 * assigned to `scene.environment`, so no `PMREMGenerator` is constructed here —
 * which also avoids mixing the core and WebGPU builds' generators.
 */
export function makeSkyRadianceTexture(
  style: EnvironmentStyle,
  theme: ThemeName,
  sunDirection: THREE.Vector3,
  // Baked-in gain. Three r184's WebGPU path ignores envMapIntensity, so a
  // consumer that needs a weaker map cannot dial it at the material — the
  // texture itself is the only dial that works on both backends.
  intensity = 1,
): THREE.DataTexture {
  const zenith = new THREE.Color().setHex(style.skyZenith(theme), THREE.SRGBColorSpace);
  const horizon = new THREE.Color().setHex(style.skyHorizon(theme), THREE.SRGBColorSpace);
  const nadir = new THREE.Color().setHex(style.skyNadir(theme), THREE.SRGBColorSpace);
  const sun = new THREE.Color().setHex(style.sun(theme), THREE.SRGBColorSpace);
  const toSun = sunDirection.clone().normalize();
  // The disc tracks the key light, so a dimmer venue key gives a dimmer
  // highlight rather than a fake outdoor sun punched into an indoor roof.
  const discRadiance = style.sunIntensity * 2.4;

  const data = new Uint16Array(SKY_RADIANCE_WIDTH * SKY_RADIANCE_HEIGHT * 4);
  const sample = new THREE.Color();
  for (let y = 0; y < SKY_RADIANCE_HEIGHT; y++) {
    // Match Three's equirect convention: v maps to elevation through asin, so
    // row 0 looks straight down and the last row looks straight up. Getting
    // this inverted would light the venue from the ground.
    const elevation = ((y + 0.5) / SKY_RADIANCE_HEIGHT - 0.5) * Math.PI;
    const dy = Math.sin(elevation);
    const horizontal = Math.cos(elevation);
    for (let x = 0; x < SKY_RADIANCE_WIDTH; x++) {
      const azimuth = ((x + 0.5) / SKY_RADIANCE_WIDTH - 0.5) * FULL_CIRCLE;
      const dx = horizontal * Math.cos(azimuth);
      const dz = horizontal * Math.sin(azimuth);

      if (dy >= 0) sample.copy(horizon).lerp(zenith, smoothstep(dy));
      else sample.copy(horizon).lerp(nadir, smoothstep(-dy));

      const cosToSun = Math.max(0, dx * toSun.x + dy * toSun.y + dz * toSun.z);
      const lobe =
        Math.pow(cosToSun, SUN_DISC_EXPONENT) * discRadiance +
        Math.pow(cosToSun, SUN_GLOW_EXPONENT) * SUN_GLOW_RADIANCE;

      const offset = (y * SKY_RADIANCE_WIDTH + x) * 4;
      data[offset] = THREE.DataUtils.toHalfFloat((sample.r + sun.r * lobe) * intensity);
      data[offset + 1] = THREE.DataUtils.toHalfFloat((sample.g + sun.g * lobe) * intensity);
      data[offset + 2] = THREE.DataUtils.toHalfFloat((sample.b + sun.b * lobe) * intensity);
      data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    SKY_RADIANCE_WIDTH,
    SKY_RADIANCE_HEIGHT,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  texture.name = "environment:texture:sky-radiance";
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // The data is already linear working-space radiance, so no decode.
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Give an instanced scatter per-instance colour variation.
 *
 * The placement code already varies angle, radius, rotation, and scale, so the
 * *silhouettes* differ. What gave a tree line away as one repeated stamp was
 * that every instance shared a single material colour: real stands vary by
 * age, species, and how much sun each crown catches. `instanceColor` multiplies
 * the material colour, so this rides on top of the themed light/dark colour
 * instead of fighting it, and costs one buffer rather than a second material.
 *
 * Deterministic by index: the venue must rebuild identically, and the QA
 * captures must stay comparable frame to frame.
 */
export function scatterTint(
  mesh: THREE.InstancedMesh,
  count: number,
  seed: number,
  spread = 0.16,
  warmth = 0.07,
): void {
  const color = new THREE.Color();
  // Raw sin(i * seed) aliases badly at these counts — a 24-instance stand
  // collapsed to 10 distinct tones. The fract-of-scaled-sin hash spreads them.
  const hash = (n: number): number => {
    const v = Math.sin(n) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < count; i++) {
    const shade = hash((i + 1) * seed);
    const temperature = hash((i + 1) * seed + 17.31);
    const lift = 1 - spread + shade * spread * 2;
    const skew = (temperature - 0.5) * warmth;
    color.setRGB(lift + skew, lift, lift - skew);
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * A beveled architectural panel used for close-enough venue forms.  This keeps
 * a pavilion, light bank, or scoreboard from exposing hard CG cube corners in
 * the same large pixels as the athlete.
 */
export function roundedVenueBlockGeometry(
  width: number,
  height: number,
  depth: number,
  corner = Math.min(width, height) * 0.12,
): THREE.ExtrudeGeometry {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const radius = Math.min(corner, halfWidth * 0.45, halfHeight * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: Math.min(depth * 0.2, radius * 0.45),
    bevelSize: Math.min(depth * 0.16, radius * 0.38),
    bevelSegments: 3,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}
