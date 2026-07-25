import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import type { Sport } from "../types";
import type { RenderQuality } from "./replayRenderer";
import {
  clamp01,
  degrees,
  FULL_CIRCLE,
  roundedVenueBlockGeometry,
  sectorSample,
  themed,
  WORLD_UP,
  type EnvironmentSector,
  type EnvironmentStyle,
  type QualityConfig,
  type ThemeColor,
} from "./renderer3dVenueKit";

/**
 * Sport venue worlds for the 3D replay: the RowErg regatta basin, the SkiErg
 * Nordic stadium, and the BikeErg velodrome, together with the bundled CC0
 * surface-map binding and the procedural water and snow textures they share.
 *
 * Split out of `renderer3d.ts`, which had grown past 8,000 lines. The builders
 * reach their renderer only through `EnvironmentBuildContext`, so the renderer
 * remains the single owner of every geometry, material, and texture registry and
 * `destroy()` stays authoritative.
 */

interface EnvironmentPlacement {
  readonly angle: number;
  readonly radius: number;
  readonly name: string;
  readonly scale?: readonly [number, number, number];
}

interface HorizonComposition {
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly floor: number;
  readonly lobes: readonly {
    readonly center: number;
    readonly halfSpan: number;
    readonly height: number;
  }[];
}

/**
 * Authored regatta-basin zones. Scenery is placed by land use, not scattered
 * randomly around the loop: campus owns the dock and buildings, woodland owns
 * the continuous tree line, and the open vista keeps clear water sightlines.
 */
const ROW_CAMPUS_SECTOR: EnvironmentSector = {
  start: degrees(8),
  span: degrees(48),
  weight: 1,
};

const ROW_WOODLAND_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(-48), span: degrees(52), weight: 1.1 },
  { start: degrees(62), span: degrees(100), weight: 1.35 },
  { start: degrees(188), span: degrees(110), weight: 1.2 },
];

const ROW_VISTA_SECTOR: EnvironmentSector = {
  start: degrees(300),
  span: degrees(58),
  weight: 1,
};

/**
 * Nordic stadium bowl land uses: lodge campus, forested valley shoulders,
 * alpine massif backdrop, and an open snow vista for sightlines.
 */
const SKI_LODGE_SECTOR: EnvironmentSector = {
  start: degrees(-12),
  span: degrees(40),
  weight: 1,
};

const SKI_FOREST_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(-170), span: degrees(55), weight: 0.95 },
  { start: degrees(105), span: degrees(65), weight: 1.1 },
  { start: degrees(40), span: degrees(28), weight: 0.75 },
];

const SKI_ALPINE_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(-150), span: degrees(65), weight: 1.1 },
  { start: degrees(35), span: degrees(60), weight: 1 },
];

const SKI_PEAK_SECTORS: readonly EnvironmentSector[] = SKI_ALPINE_SECTORS;

const SKI_BERM_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(38), span: degrees(112), weight: 1 },
  { start: degrees(195), span: degrees(125), weight: 1.05 },
];

const SKI_OPEN_SECTOR: EnvironmentSector = {
  start: degrees(250),
  span: degrees(55),
  weight: 1,
};

/**
 * Dusk circuit land uses: grandstands, urban skyline, service apron, and an
 * open approach so the infield park remains the compositional centre.
 */
const BIKE_STAND_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(55), span: degrees(85), weight: 1.2 },
  { start: degrees(220), span: degrees(60), weight: 0.85 },
];

const BIKE_SERVICE_SECTOR: EnvironmentSector = {
  start: degrees(228),
  span: degrees(42),
  weight: 1,
};

const ROW_LANDMARKS: readonly EnvironmentPlacement[] = [
  {
    angle: degrees(17),
    radius: 72,
    name: "environment:rower:regatta-pavilion",
    scale: [0.9, 0.88, 0.86],
  },
  {
    angle: degrees(32),
    radius: 75,
    name: "environment:rower:boathouse",
    scale: [0.72, 0.74, 0.76],
  },
  {
    angle: degrees(43),
    radius: 70,
    name: "environment:rower:timing-tower",
    scale: [0.5, 1.26, 0.56],
  },
];

const SKI_LANDMARKS: readonly EnvironmentPlacement[] = [
  {
    angle: SKI_LODGE_SECTOR.start + SKI_LODGE_SECTOR.span * 0.45,
    radius: 59,
    name: "environment:skierg:timing-lodge",
    scale: [1.05, 1.12, 1],
  },
  {
    angle: SKI_LODGE_SECTOR.start + SKI_LODGE_SECTOR.span * 0.78,
    radius: 61,
    name: "environment:skierg:wax-hut",
    scale: [0.68, 0.76, 0.74],
  },
];

const BIKE_SERVICE_BUILDING: EnvironmentPlacement = {
  angle: BIKE_SERVICE_SECTOR.start + BIKE_SERVICE_SECTOR.span * 0.55,
  radius: 60,
  name: "environment:bike:service-building",
  scale: [0.82, 0.82, 1.05],
};

const BIKE_SCOREBOARD: EnvironmentPlacement = {
  angle: BIKE_STAND_SECTORS[0]!.start + BIKE_STAND_SECTORS[0]!.span * 0.48,
  radius: 58,
  name: "environment:bike:scoreboard",
};

// Floodlights only along the lodge edge — a real stadium lights the field,
// not the entire mountain ring.
const SKI_FLOODLIGHTS: readonly EnvironmentPlacement[] = [-8, 2, 12, 22, 32, -16, 38, 18].map(
  (angle, index) => ({
    angle: degrees(angle),
    radius: index < 4 ? 53 : 55.5,
    name: `environment:skierg:floodlight-${index + 1}`,
  }),
);

const HORIZON_COMPOSITIONS: Record<Sport, HorizonComposition> = {
  rower: {
    // A real river valley needs continuous high shoulders with a few open
    // water vistas, not a thin green ring barely above the fog plane.
    offsetX: -14,
    offsetZ: 9,
    floor: 0.28,
    lobes: [
      { center: degrees(18), halfSpan: degrees(78), height: 0.78 },
      { center: degrees(92), halfSpan: degrees(36), height: 0.42 },
      { center: degrees(210), halfSpan: degrees(68), height: 0.7 },
      { center: degrees(300), halfSpan: degrees(34), height: 0.38 },
    ],
  },
  skierg: {
    offsetX: 10,
    offsetZ: -15,
    floor: 0.2,
    lobes: [
      { center: degrees(-118), halfSpan: degrees(52), height: 0.92 },
      { center: degrees(65), halfSpan: degrees(49), height: 0.86 },
    ],
  },
  bike: {
    offsetX: -8,
    offsetZ: -10,
    floor: 0.48,
    lobes: [
      { center: degrees(98), halfSpan: degrees(68), height: 0.58 },
      { center: degrees(250), halfSpan: degrees(50), height: 0.42 },
    ],
  },
};

function angularDistance(a: number, b: number): number {
  const wrapped = (((a - b + Math.PI) % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
  return Math.abs(wrapped - Math.PI);
}

/**
 * Shared {@link SimplexNoise} singleton. One deterministic instance keeps
 * all organic geometry consistent within a session without re-seeding.
 */
const _simplexNoise = new SimplexNoise();

/**
 * Fractal Brownian Motion over 2D simplex noise.
 * Returns a value in [-1, 1] — a drop-in for the old multi-sine "noise"
 * that produced periodic, too-smooth terrain.
 */
function fbm2(x: number, y: number, octaves: number, lacunarity = 2.1, gain = 0.48): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * _simplexNoise.noise(x * frequency, y * frequency);
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / total;
}

/**
 * Fractal Brownian Motion over 3D simplex noise.
 * The third dimension lets ring index break up angular symmetry so
 * mountains read as asymmetric massifs instead of lathed cones.
 */
function fbm3(
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity = 2.1,
  gain = 0.48,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * _simplexNoise.noise3d(x * frequency, y * frequency, z * frequency);
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / total;
}

/**
 * Build one shared-vertex radial surface from an authored vertical profile.
 *
 * `LatheGeometry` gives every mountain the same circular contour, which can
 * still read as a large low-poly cone even at a high segment count.  This
 * variation is baked into the geometry, needs no texture or shader feature,
 * and remains safe for both WebGL and WebGPU.  Adjacent rings share vertices
 * so the normal field stays continuous instead of exposing triangle bands.
 */
function organicRadialSurfaceGeometry(
  profile: readonly THREE.Vector2[],
  radialSegments: number,
  _phase: number,
  name: string,
  irregularity = 1,
): THREE.BufferGeometry {
  const ringCount = profile.length;
  const maxRadius = Math.max(0.001, ...profile.map((point) => point.x));
  const vertexCount = ringCount * radialSegments + 2;
  const positions = new Float32Array(vertexCount * 3);
  // Cylindrical UVs so High/Ultra CC0 bark/leaf/terrain maps can dress pines,
  // shoreline hills, and alpine forms without a separate unwrap step.
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];
  let cursor = 0;
  let uvCursor = 0;
  const yMin = Math.min(...profile.map((point) => point.y));
  const yMax = Math.max(...profile.map((point) => point.y));
  const yRange = Math.max(0.001, yMax - yMin);

  for (let ring = 0; ring < ringCount; ring++) {
    const point = profile[ring];
    if (!point) continue;
    const radiusWeight = point.x / maxRadius;
    const v = (point.y - yMin) / yRange;
    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      // Fractal Brownian motion over 3D simplex noise. Projecting the
      // angle onto a circle gives seamless wrapping; ring index as the
      // third axis breaks rotational symmetry so terrain reads as an
      // asymmetric massif instead of a lathed cone.
      const nx = Math.cos(angle) * 1.8;
      const nz = Math.sin(angle) * 1.8;
      const ny = ring * 0.38;
      const radialNoise = fbm3(nx, ny, nz, 4) * 0.13;
      const radius = Math.max(
        0.012,
        point.x * (1 + radialNoise * irregularity * (0.3 + radiusWeight * 0.7)),
      );
      const verticalNoise =
        fbm3(nx + 5.7, ny + 3.1, nz + 2.4, 4) * 0.16 * radiusWeight * irregularity;
      positions[cursor++] = Math.cos(angle) * radius;
      positions[cursor++] = point.y + verticalNoise;
      positions[cursor++] = Math.sin(angle) * radius;
      uvs[uvCursor++] = segment / radialSegments;
      uvs[uvCursor++] = v;
    }
  }

  for (let ring = 0; ring < ringCount - 1; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + segment;
      const d = (ring + 1) * radialSegments + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Cap the tiny first/last rings.  They remain almost point-like in the
  // silhouette, but closed geometry prevents sky leaks through a near peak.
  const bottomCenter = ringCount * radialSegments;
  const topCenter = bottomCenter + 1;
  const bottom = profile[0];
  const top = profile.at(-1);
  positions.set([0, bottom?.y ?? 0, 0], bottomCenter * 3);
  positions.set([0, top?.y ?? 0, 0], topCenter * 3);
  uvs[bottomCenter * 2] = 0.5;
  uvs[bottomCenter * 2 + 1] = 0;
  uvs[topCenter * 2] = 0.5;
  uvs[topCenter * 2 + 1] = 1;
  const topRing = (ringCount - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    indices.push(bottomCenter, next, segment);
    indices.push(topCenter, topRing + segment, topRing + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = name;
  geometry.userData.organicRadialSurface = true;
  return geometry;
}

/**
 * A single tapered evergreen volume with varied bough tiers and a real needle
 * tip.  Keeping the crown inside this shared contour avoids the old floating
 * sphere that made the distant forest read as a row of green balls.
 */
function sculptedPineGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(0.035, -2.12),
      new THREE.Vector2(0.3, -2.06),
      new THREE.Vector2(0.78, -1.84),
      new THREE.Vector2(1.13, -1.55),
      new THREE.Vector2(0.99, -1.28),
      new THREE.Vector2(1.3, -0.94),
      new THREE.Vector2(1.08, -0.62),
      new THREE.Vector2(1.16, -0.28),
      new THREE.Vector2(0.9, 0.04),
      new THREE.Vector2(0.96, 0.35),
      new THREE.Vector2(0.72, 0.71),
      new THREE.Vector2(0.56, 1.08),
      new THREE.Vector2(0.39, 1.46),
      new THREE.Vector2(0.23, 1.78),
      new THREE.Vector2(0.11, 2.06),
      new THREE.Vector2(0.018, 2.34),
    ],
    40,
    0.91,
    "environment:evergreen-canopy",
    0.82,
  );
}

/** A broad, asymmetric alpine massif rather than a rotational volcano. */
function alpinePeakGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(0.025, -10),
      new THREE.Vector2(3.3, -9.96),
      new THREE.Vector2(5.85, -9.72),
      new THREE.Vector2(7.6, -9.28),
      new THREE.Vector2(7.52, -8.22),
      new THREE.Vector2(7.25, -6.72),
      new THREE.Vector2(6.88, -5.18),
      new THREE.Vector2(6.4, -3.82),
      new THREE.Vector2(5.88, -2.42),
      new THREE.Vector2(5.35, -1.12),
      new THREE.Vector2(4.86, 0.18),
      new THREE.Vector2(4.4, 1.52),
      new THREE.Vector2(3.72, 2.92),
      new THREE.Vector2(3.05, 4.32),
      new THREE.Vector2(2.3, 5.76),
      new THREE.Vector2(1.52, 7.26),
      new THREE.Vector2(0.9, 8.4),
      new THREE.Vector2(0.48, 9.16),
      new THREE.Vector2(0.018, 10),
    ],
    64,
    0.43,
    "environment:alpine-massif",
    1,
  );
}

/** Snow mantle follows the massif's uneven shoulders instead of a smooth cone. */
function alpineSnowcapGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(3.72, 3.56),
      new THREE.Vector2(3.28, 4.16),
      new THREE.Vector2(2.92, 4.9),
      new THREE.Vector2(2.57, 5.68),
      new THREE.Vector2(2.2, 6.5),
      new THREE.Vector2(1.8, 7.28),
      new THREE.Vector2(1.15, 8.35),
      new THREE.Vector2(0.6, 9.17),
      new THREE.Vector2(0.018, 10.08),
    ],
    64,
    0.43,
    "environment:alpine-snow-mantle",
    0.92,
  );
}

/** Low, elongated foreground terrain adds a parallax layer beneath the massif. */
function alpineFoothillGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(0.025, -2.5),
      new THREE.Vector2(0.96, -2.4),
      new THREE.Vector2(2.08, -2.05),
      new THREE.Vector2(2.86, -1.48),
      new THREE.Vector2(3.14, -0.72),
      new THREE.Vector2(2.9, 0.14),
      new THREE.Vector2(2.34, 1.02),
      new THREE.Vector2(1.64, 1.86),
      new THREE.Vector2(0.92, 2.68),
      new THREE.Vector2(0.36, 3.36),
      new THREE.Vector2(0.018, 3.72),
    ],
    48,
    1.37,
    "environment:alpine-foothill",
    0.88,
  );
}

/** A low, wind-shaped snow drift with a planted base rather than a sphere. */
function snowDriftGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(0.035, 0),
      new THREE.Vector2(0.42, 0.015),
      new THREE.Vector2(0.76, 0.06),
      new THREE.Vector2(1.02, 0.16),
      new THREE.Vector2(1.08, 0.3),
      new THREE.Vector2(0.94, 0.5),
      new THREE.Vector2(0.7, 0.68),
      new THREE.Vector2(0.43, 0.82),
      new THREE.Vector2(0.18, 0.9),
      new THREE.Vector2(0.025, 0.94),
    ],
    32,
    0.48,
    "environment:snow-drift",
    0.28,
  );
}

/** Everything the venue builders need from the renderer that owns them. */
export interface EnvironmentBuildContext {
  readonly sport: Sport;
  readonly quality: RenderQuality;
  readonly cfg: QualityConfig;
  readonly environment: EnvironmentStyle;
  /** Renderer-owned registries. Appending here keeps `destroy()` authoritative. */
  readonly textures: THREE.Texture[];
  readonly environmentThemeMats: Array<{
    material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    color: ThemeColor;
  }>;
  mat<T extends THREE.Material>(m: T): T;
  track<T extends THREE.BufferGeometry>(g: T): T;
  trackInstanced<T extends THREE.InstancedMesh>(mesh: T): T;
  environmentStandardMat(
    name: string,
    color: ThemeColor,
    opts?: Omit<THREE.MeshStandardMaterialParameters, "color">,
  ): THREE.MeshStandardMaterial;
  environmentBasicMat(
    name: string,
    color: ThemeColor,
    opts?: Omit<THREE.MeshBasicMaterialParameters, "color">,
  ): THREE.MeshBasicMaterial;
  makeVerticalArc(
    name: string,
    radius: number,
    height: number,
    y: number,
    sector: EnvironmentSector,
    material: THREE.Material,
  ): THREE.Mesh;
}

export class EnvironmentBuilder {
  /** Procedural groomed-snow albedo, built once and reused across surfaces. */
  private snowSurfaceTexture: THREE.DataTexture | null = null;

  constructor(private readonly ctx: EnvironmentBuildContext) {}

  /**
   * Bind one bundled CC0 surface map to a material slot.
   *
   * Paths are assembled from directory and suffix conventions, so a rename or a
   * dropped file breaks a slot without breaking the build. On fetch or decode
   * failure the slot is cleared: an undecoded texture renders as flat black,
   * which wrecks the venue far worse than the authored solid colour it replaced.
   * `slot` also decides colour space — only the diffuse map is sRGB.
   */
  loadEnvironmentTexture(
    material: THREE.MeshStandardMaterial,
    slot: "map" | "roughnessMap" | "normalMap",
    path: string,
    repeat: [number, number],
  ): void {
    // A network error is asynchronous, but a data-URI or cache-layer failure can
    // report back before load() even returns. Track it either way so the broken
    // texture is never the value left in the slot.
    let failed = false;
    const onError = () => {
      failed = true;
      if (material[slot]?.userData.sourcePath === path) {
        material[slot] = null;
        material.needsUpdate = true;
      }
      // Each renderer requests each path once, so this is already one line per
      // broken map. A quality change rebuilds the renderer and re-reports, which
      // is what you want when diagnosing a bad deploy.
      console.warn(`[replay] environment surface map unavailable, using solid colour: ${path}`);
    };
    // This module is also imported during SSR, and the renderer unit harness
    // supplies only the DOM surface WebGL construction needs. Keep the material
    // contract inspectable in both cases without pretending an image can be
    // decoded outside a browser.
    const canDecode =
      typeof document !== "undefined" && typeof document.createElementNS === "function";
    const texture = canDecode
      ? new THREE.TextureLoader().load(path, undefined, undefined, onError)
      : new THREE.Texture();
    texture.name = `environment:texture:${path.split("/").at(-1) ?? path}`;
    texture.userData.sourcePath = path;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.anisotropy = this.ctx.quality === "ultra" ? 8 : 4;
    if (slot === "map") texture.colorSpace = THREE.SRGBColorSpace;
    // Registered for disposal even on failure — the Texture object exists either
    // way, and destroy() must stay the single owner of every texture we create.
    this.ctx.textures.push(texture);
    if (failed) return;
    material[slot] = texture;
    material.needsUpdate = true;
  }

  /**
   * Apply a provenance-recorded CC0 surface set at High (diffuse + roughness)
   * and Ultra (+ OpenGL normal). Low/Medium keep solid procedural colours so
   * the venue identity never depends on an image decode.
   */
  private applyEnvironmentSurfaceMaps(
    material: THREE.MeshStandardMaterial,
    basePath: string,
    repeat: [number, number],
    normalScale = 0.22,
  ): void {
    if (this.ctx.cfg.environmentDetail < 2) return;
    this.loadEnvironmentTexture(material, "map", `${basePath}-diffuse-512.jpg`, repeat);
    this.loadEnvironmentTexture(material, "roughnessMap", `${basePath}-roughness-512.jpg`, repeat);
    if (this.ctx.cfg.environmentDetail >= 3) {
      this.loadEnvironmentTexture(material, "normalMap", `${basePath}-normal-gl-512.jpg`, repeat);
      material.normalScale.set(normalScale, normalScale);
    }
  }

  /** Planar XZ UVs in world units so seamless surface maps tile on arc/terrain forms. */
  private ensurePlanarWorldUv(geometry: THREE.BufferGeometry, scale = 1): void {
    if (geometry.getAttribute("uv")) return;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    const uvs = new Float32Array(positions.count * 2);
    for (let index = 0; index < positions.count; index++) {
      uvs[index * 2] = positions.getX(index) * scale;
      uvs[index * 2 + 1] = positions.getZ(index) * scale;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }

  makeWaterNormalTexture(ultra: boolean): THREE.DataTexture {
    const size = ultra ? 128 : 64;
    const pixels = new Uint8Array(size * size * 4);
    const octaves = ultra ? 4 : 3;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Fractal Brownian motion over 2D simplex gives natural wave patterns
        // with crossing swells and capillary detail — no periodic sine artifacts.
        const u = x / size;
        const v = y / size;
        const scale = ultra ? 5.5 : 3.8;
        const nx = fbm2(u * scale, v * scale, octaves) * 0.7;
        const ny = fbm2(u * scale + 3.7, v * scale + 2.1, octaves) * 0.55;
        const capillary = ultra ? fbm2(u * 18.0, v * 18.0, 3) * 0.08 : 0;
        const offset = (y * size + x) * 4;
        pixels[offset] = Math.round(((nx + capillary) * 0.5 + 0.5) * 255);
        pixels[offset + 1] = Math.round(((ny - capillary * 0.6) * 0.5 + 0.5) * 255);
        pixels[offset + 2] = 255;
        pixels[offset + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.name = ultra
      ? "environment:texture:water-normal-ultra"
      : "environment:texture:water-normal-high";
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    texture.needsUpdate = true;
    this.ctx.textures.push(texture);
    return texture;
  }

  makeSnowSurfaceTexture(detail: number): THREE.DataTexture {
    if (this.snowSurfaceTexture) return this.snowSurfaceTexture;
    const size = detail >= 3 ? 128 : 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const fine =
          Math.sin((u * 17.1 + v * 4.3) * FULL_CIRCLE) * 0.5 +
          Math.sin((u * 31.7 - v * 13.2) * FULL_CIRCLE) * 0.3 +
          Math.sin((u * 71.3 + v * 57.1) * FULL_CIRCLE) * 0.2;
        const groom = Math.sin((v * 22.5 + u * 1.8) * FULL_CIRCLE) * 0.5 + 0.5;
        const packed = Math.max(0, fine * 0.5 + groom * 0.18);
        const value = Math.round(224 + fine * 11 - packed * 12);
        const offset = (y * size + x) * 4;
        pixels[offset] = Math.max(0, Math.min(255, value - 8));
        pixels[offset + 1] = Math.max(0, Math.min(255, value));
        pixels[offset + 2] = Math.max(0, Math.min(255, value + 8));
        pixels[offset + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.name =
      detail >= 3 ? "environment:texture:snow-groomed-ultra" : "environment:texture:snow-groomed";
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(detail >= 3 ? 18 : 12, detail >= 3 ? 18 : 12);
    texture.needsUpdate = true;
    this.snowSurfaceTexture = texture;
    this.ctx.textures.push(texture);
    return texture;
  }

  makeWaterSurfaceTexture(detail: number): THREE.DataTexture {
    const size = detail >= 3 ? 128 : 64;
    const pixels = new Uint8Array(size * size * 4);
    const scale = detail >= 3 ? 6.0 : 4.0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        // Fractal water sheen: broad swells + fine ripple, no periodic sine.
        const sheen = fbm2(u * scale, v * scale, 4) * 0.6;
        const highlight = Math.pow(
          Math.max(0, fbm2(u * 7.2 + 1.3, v * 7.2 + 0.7, 3) * 0.5 + 0.5),
          8,
        );
        const value = Math.max(0, Math.min(255, Math.round(212 + sheen * 38 + highlight * 22)));
        const offset = (y * size + x) * 4;
        // Slight cool-blue tint for deeper-looking water.
        pixels[offset] = Math.max(0, value - 14);
        pixels[offset + 1] = Math.max(0, value - 2);
        pixels[offset + 2] = Math.min(255, value + 5);
        pixels[offset + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.name =
      detail >= 3 ? "environment:texture:water-sheen-ultra" : "environment:texture:water-sheen";
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(detail >= 3 ? 8 : 6, detail >= 3 ? 8 : 6);
    texture.needsUpdate = true;
    this.ctx.textures.push(texture);
    return texture;
  }

  makeHorizonRing(
    name: string,
    radius: number,
    baseY: number,
    averageHeight: number,
    variation: number,
    segments: number,
    color: ThemeColor,
    _phase: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const positions = new Float32Array(segments * 18);
    const colors = new Float32Array(segments * 18);
    const composition = HORIZON_COMPOSITIONS[this.ctx.sport];
    let cursor = 0;
    // Aerial perspective: ridge tops lean into fog, bases keep body color so
    // the skyline is atmosphere rather than a cardboard cutout.
    const baseColor = new THREE.Color(color("light"));
    const hazeColor = new THREE.Color(this.ctx.environment.fog("light"));
    const envelopeAt = (angle: number): number => {
      let envelope = composition.floor;
      for (const lobe of composition.lobes) {
        const distance = angularDistance(angle, lobe.center);
        if (distance >= lobe.halfSpan) continue;
        const edge = 0.5 + Math.cos((distance / lobe.halfSpan) * Math.PI) * 0.5;
        envelope += edge * lobe.height;
      }
      return envelope;
    };
    const heightAt = (i: number): number => {
      const a = (i / segments) * Math.PI * 2;
      // Fractal Brownian motion reads as natural ridgeline shoulders;
      // abs() on a second octave-tuned sample adds ridge crests that
      // break the smooth CG silhouette at multiple scales.
      const nx = Math.cos(a) * 2.0;
      const nz = Math.sin(a) * 2.0;
      const broad = fbm2(nx, nz, 5) * 0.65;
      const ridge = Math.abs(fbm2(nx * 1.7 + 3.1, nz * 1.7 + 1.4, 4)) * 0.38;
      const envelope = envelopeAt(a);
      return averageHeight * envelope + variation * (broad + ridge) * (0.38 + envelope * 0.62);
    };
    const radiusAt = (i: number): number => {
      const a = (i / segments) * Math.PI * 2;
      return radius + fbm2(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 3) * 2.8;
    };
    const writeColor = (offset: number, heightFactor: number): void => {
      const sample = baseColor.clone().lerp(hazeColor, clamp01(0.18 + heightFactor * 0.72));
      colors[offset] = sample.r;
      colors[offset + 1] = sample.g;
      colors[offset + 2] = sample.b;
    };
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const r0 = radiusAt(i);
      const r1 = radiusAt(i + 1);
      const x0 = composition.offsetX + Math.sin(a0) * r0;
      const z0 = composition.offsetZ + Math.cos(a0) * r0;
      const x1 = composition.offsetX + Math.sin(a1) * r1;
      const z1 = composition.offsetZ + Math.cos(a1) * r1;
      const peak0 = Math.max(0.4, heightAt(i));
      const peak1 = Math.max(0.4, heightAt(i + 1));
      // Sink the base slightly below the water plane so the ridge meets the
      // world instead of hovering as a floating billboard.
      const foot = baseY - 1.4;
      const y0 = baseY + peak0;
      const y1 = baseY + peak1;
      const maxPeak = Math.max(peak0, peak1, 0.001);
      const quad = [x0, foot, z0, x1, y1, z1, x1, foot, z1, x0, foot, z0, x0, y0, z0, x1, y1, z1];
      positions.set(quad, cursor);
      writeColor(cursor, 0.05);
      writeColor(cursor + 3, peak1 / maxPeak);
      writeColor(cursor + 6, 0.05);
      writeColor(cursor + 9, 0.05);
      writeColor(cursor + 12, peak0 / maxPeak);
      writeColor(cursor + 15, peak1 / maxPeak);
      cursor += quad.length;
    }
    const geometry = this.ctx.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = this.ctx.environmentBasicMat(`${name}:material`, color, {
      side: THREE.DoubleSide,
      fog: true,
      vertexColors: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  private addInstancedPines(
    group: THREE.Group,
    count: number,
    radiusMin: number,
    radiusMax: number,
    sectors: readonly EnvironmentSector[],
  ): void {
    const canopyGeo = this.ctx.track(sculptedPineGeometry());
    const trunkGeo = this.ctx.track(new THREE.CylinderGeometry(0.11, 0.17, 1.38, 16));
    const pineColor =
      this.ctx.sport === "skierg" ? themed(0x335d51, 0x244d45) : themed(0x2d6548, 0x1c503c);
    // A single continuous canopy keeps the silhouette coniferous at replay
    // distance. The separate spherical crown still read as a row of green
    // balls above the SkiErg tree line against the bright snow.
    const canopyMat = this.ctx.environmentStandardMat(
      `environment:${this.ctx.sport}:pine-canopy-material`,
      pineColor,
      { fog: true, roughness: 0.82, metalness: 0.005 },
    );
    const trunkMat = this.ctx.environmentStandardMat(
      `environment:${this.ctx.sport}:pine-trunk-material`,
      themed(0x5a4635, 0x261f1b),
      { roughness: 0.96, metalness: 0 },
    );
    // High/Ultra woodland uses local CC0 bark and leaf litter so the tree
    // line is material, not only silhouette — shared by Row and Ski valleys.
    this.applyEnvironmentSurfaceMaps(
      canopyMat,
      "/replay-assets/environments/forest-leaves-04/forest-leaves-04",
      [2.4, 3.2],
      0.18,
    );
    this.applyEnvironmentSurfaceMaps(
      trunkMat,
      "/replay-assets/environments/bark-brown-01/bark-brown-01",
      [1.1, 2.4],
      0.55,
    );
    const canopies = this.ctx.trackInstanced(new THREE.InstancedMesh(canopyGeo, canopyMat, count));
    const trunks = this.ctx.trackInstanced(new THREE.InstancedMesh(trunkGeo, trunkMat, count));
    canopies.name = `environment:${this.ctx.sport}:pines`;
    trunks.name = `environment:${this.ctx.sport}:pine-trunks`;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    // Clump trees into irregular stands so the tree line never reads as a
    // perfectly spaced ring of ornaments around the arena.
    const clumpCount = Math.max(3, Math.round(count / 7));
    for (let i = 0; i < count; i++) {
      const clump = Math.floor((i / count) * clumpCount);
      const { angle: clumpAngle } = sectorSample(clump, clumpCount, sectors);
      const clumpJitter = (Math.sin(clump * 17.13) * 0.5 + Math.sin(i * 3.7) * 0.5) * degrees(9);
      const memberJitter = (Math.sin(i * 9.41) * 0.5 + 0.5) * degrees(4.5) * (i % 2 === 0 ? 1 : -1);
      const a = clumpAngle + clumpJitter + memberJitter;
      const depthBias = (i % 5) / 4;
      const radius =
        radiusMin +
        (radiusMax - radiusMin) * (0.12 + 0.78 * depthBias + 0.1 * Math.sin(i * 12.9898));
      // Heavy size variance: a few tall dominants, many mid, some short scrub.
      const sizeRoll = 0.5 + Math.sin(i * 7.31) * 0.5;
      const size =
        (sizeRoll < 0.18 ? 0.48 : sizeRoll > 0.86 ? 1.55 : 0.78 + sizeRoll * 0.55) *
        (this.ctx.sport === "rower" ? 1.08 : 1);
      // The canopy deliberately has asymmetric boughs, so rotate every
      // instance independently rather than exposing the same silhouette at
      // every point on the ridge.
      quaternion.setFromAxisAngle(WORLD_UP, (i * 2.399963229728653) % FULL_CIRCLE);
      position.set(Math.sin(a) * radius, 2.02 * size, Math.cos(a) * radius);
      scale.set(size * (0.92 + (i % 3) * 0.06), size * 1.04, size * (0.92 + (i % 4) * 0.05));
      matrix.compose(position, quaternion, scale);
      canopies.setMatrixAt(i, matrix);
      position.y = 0.55 * size;
      scale.set(size * 0.95, size, size * 0.95);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(i, matrix);
    }
    canopies.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    group.add(trunks, canopies);
  }

  private addAlpinePeaks(group: THREE.Group, count: number): void {
    // Keep the massif monumental without letting it consume the whole lens:
    // a visible sky band is essential to the valley read at replay height.
    const peakGeo = this.ctx.track(alpinePeakGeometry());
    const capGeo = this.ctx.track(alpineSnowcapGeometry());
    const peakMat = this.ctx.environmentStandardMat(
      "environment:skierg:mountain-material",
      themed(0x7897a8, 0x4f6a7a),
      { fog: true, roughness: 0.92, metalness: 0 },
    );
    const capMat = this.ctx.environmentStandardMat(
      "environment:skierg:snowcap-material",
      themed(0xe8f2f5, 0xaec1ca),
      { fog: true, roughness: 0.9, metalness: 0 },
    );
    const peaks = this.ctx.trackInstanced(new THREE.InstancedMesh(peakGeo, peakMat, count));
    const caps = this.ctx.trackInstanced(new THREE.InstancedMesh(capGeo, capMat, count));
    peaks.name = "environment:skierg:mountain-peaks";
    caps.name = "environment:skierg:snowcaps";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const { angle: a } = sectorSample(i, count, SKI_PEAK_SECTORS);
      // Distant massif: push peaks well beyond the track so they read as
      // a real mountain backdrop, not scenery flats hugging the course.
      const radius = 130 + (0.5 + Math.sin(i * 8.17) * 0.5) * 28;
      const tierScale = [0.82, 0.95, 1.08, 1.2][this.ctx.cfg.environmentDetail];
      const size = (0.85 + (0.5 + Math.sin(i * 4.91) * 0.5) * 0.72) * tierScale;
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + (i % 3) * 0.31);
      position.set(Math.sin(a) * radius, 12 * size, Math.cos(a) * radius);
      scale.set(size * (0.9 + (i % 4) * 0.08), size * 1.4, size);
      matrix.compose(position, quaternion, scale);
      peaks.setMatrixAt(i, matrix);
      position.y = 12 * size;
      scale.set(size, size * 0.95, size);
      matrix.compose(position, quaternion, scale);
      caps.setMatrixAt(i, matrix);
    }
    peaks.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    group.add(peaks, caps);
  }

  /**
   * A nearer terrain band beneath the distant massif. It stays outside the
   * snow berms and below the tree line, creating a valley-floor parallax cue
   * without turning the athlete's chase frame into a wall of scenery.
   */
  private addAlpineFoothills(group: THREE.Group, count: number): void {
    const geometry = this.ctx.track(alpineFoothillGeometry());
    const material = this.ctx.environmentStandardMat(
      "environment:skierg:foothill-material",
      themed(0x638794, 0x3a5968),
      { fog: true, roughness: 0.96, metalness: 0 },
    );
    const foothills = this.ctx.trackInstanced(new THREE.InstancedMesh(geometry, material, count));
    foothills.name = "environment:skierg:foothills";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const { angle: a } = sectorSample(i, count, SKI_PEAK_SECTORS);
      const size = 0.82 + (0.5 + Math.sin(i * 6.13) * 0.5) * 0.58;
      const verticalScale = size * 0.84;
      // Foothills sit between the track and the distant massif, not on the course edge.
      const radius = 85 + Math.sin(i * 4.41) * 4.5;
      quaternion.setFromAxisAngle(WORLD_UP, a + 0.36 + (i % 4) * 0.29);
      position.set(Math.sin(a) * radius, 3.2 * verticalScale, Math.cos(a) * radius);
      scale.set(size * 1.8, verticalScale, size * 1.05);
      matrix.compose(position, quaternion, scale);
      foothills.setMatrixAt(i, matrix);
    }
    foothills.instanceMatrix.needsUpdate = true;
    group.add(foothills);
  }

  private addPavilions(group: THREE.Group, placements: readonly EnvironmentPlacement[]): void {
    const bodyGeo = this.ctx.track(roundedVenueBlockGeometry(9, 2.6, 3.6, 0.36));
    const roofGeo = this.ctx.track(new THREE.CylinderGeometry(5.35, 4.35, 1.25, 24, 2));
    const glassGeo = this.ctx.track(roundedVenueBlockGeometry(7.4, 0.8, 0.08, 0.1));
    const mullionGeo = this.ctx.track(roundedVenueBlockGeometry(0.09, 1.16, 0.11, 0.025));
    const bodyMat = this.ctx.environmentStandardMat(
      `environment:${this.ctx.sport}:pavilion-body-material`,
      this.ctx.environment.venueStructure,
      { roughness: 0.76, metalness: 0.06 },
    );
    const roofMat = this.ctx.environmentStandardMat(
      `environment:${this.ctx.sport}:pavilion-roof-material`,
      this.ctx.environment.venueAccent,
      { roughness: 0.5, metalness: 0.16 },
    );
    // Row regatta buildings pick up the same local plank response as the
    // launch dock so High/Ultra venue forms share one wood language.
    if (this.ctx.sport === "rower") {
      this.applyEnvironmentSurfaceMaps(
        bodyMat,
        "/replay-assets/environments/brown-planks-03/brown-planks-03",
        [1.4, 0.9],
        0.22,
      );
    }
    const glassMat = this.ctx.mat(
      new THREE.MeshPhysicalMaterial({
        color: themed(0x8ed4e5, 0x173a4d)("light"),
        roughness: 0.18,
        metalness: 0.12,
        transparent: true,
        opacity: 0.72,
        clearcoat: 0.42,
        clearcoatRoughness: 0.16,
        depthWrite: false,
      }),
    );
    glassMat.name = `environment:${this.ctx.sport}:pavilion-glass-material`;
    this.ctx.environmentThemeMats.push({ material: glassMat, color: themed(0x8ed4e5, 0x173a4d) });
    for (const placement of placements) {
      const a = placement.angle;
      const pavilion = new THREE.Group();
      pavilion.name = placement.name;
      pavilion.position.set(Math.sin(a) * placement.radius, 0, Math.cos(a) * placement.radius);
      pavilion.rotation.y = a;
      pavilion.scale.set(...(placement.scale ?? [1, 1, 1]));
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.45;
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = 3.45;
      roof.scale.z = 0.52;
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(0, 1.8, -1.84);
      pavilion.add(body, roof, glass);
      for (const x of [-2.45, 0, 2.45]) {
        const mullion = new THREE.Mesh(mullionGeo, bodyMat);
        mullion.position.set(x, 1.8, -1.91);
        pavilion.add(mullion);
      }
      group.add(pavilion);
    }
  }

  private addFloodlights(
    group: THREE.Group,
    placements: readonly EnvironmentPlacement[],
    count: number,
  ): void {
    const authored = placements.slice(0, count);
    const poleGeo = this.ctx.track(new THREE.CylinderGeometry(0.1, 0.15, 8, 12));
    const panelGeo = this.ctx.track(roundedVenueBlockGeometry(2.2, 0.7, 0.22, 0.1));
    const poleMat = this.ctx.environmentStandardMat(
      `environment:${this.ctx.sport}:floodlight-pole-material`,
      this.ctx.environment.venueStructure,
      { roughness: 0.48, metalness: 0.55 },
    );
    const panelMat = this.ctx.environmentBasicMat(
      `environment:${this.ctx.sport}:floodlight-panel-material`,
      themed(0xfff4d0, 0xffd89c),
      { fog: true },
    );
    const poles = this.ctx.trackInstanced(
      new THREE.InstancedMesh(poleGeo, poleMat, authored.length),
    );
    const panels = this.ctx.trackInstanced(
      new THREE.InstancedMesh(panelGeo, panelMat, authored.length),
    );
    poles.name = `environment:${this.ctx.sport}:floodlight-poles`;
    panels.name = `environment:${this.ctx.sport}:floodlight-panels`;
    poles.userData.authoredPlacements = authored.map((placement) => placement.name);
    panels.userData.authoredPlacements = poles.userData.authoredPlacements;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < authored.length; i++) {
      const placement = authored[i];
      const a = placement.angle;
      position.set(Math.sin(a) * placement.radius, 4, Math.cos(a) * placement.radius);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      matrix.compose(position, quaternion, scale);
      poles.setMatrixAt(i, matrix);
      position.y = 8.15;
      matrix.compose(position, quaternion, scale);
      panels.setMatrixAt(i, matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    panels.instanceMatrix.needsUpdate = true;
    group.add(poles, panels);
  }

  private makeHorizontalArc(
    name: string,
    innerRadius: number,
    outerRadius: number,
    y: number,
    sector: EnvironmentSector,
    material: THREE.Material,
  ): THREE.Mesh {
    const segments = Math.max(
      6,
      Math.ceil((this.ctx.cfg.laneSegments * sector.span) / FULL_CIRCLE),
    );
    const positions = new Float32Array(segments * 18);
    let cursor = 0;
    for (let i = 0; i < segments; i++) {
      const a0 = sector.start + (i / segments) * sector.span;
      const a1 = sector.start + ((i + 1) / segments) * sector.span;
      const inner0 = [Math.sin(a0) * innerRadius, y, Math.cos(a0) * innerRadius];
      const outer0 = [Math.sin(a0) * outerRadius, y, Math.cos(a0) * outerRadius];
      const inner1 = [Math.sin(a1) * innerRadius, y, Math.cos(a1) * innerRadius];
      const outer1 = [Math.sin(a1) * outerRadius, y, Math.cos(a1) * outerRadius];
      positions.set([...inner0, ...outer0, ...outer1, ...inner0, ...outer1, ...inner1], cursor);
      cursor += 18;
    }
    const geometry = this.ctx.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // World-space planar UVs let High/Ultra CC0 bank materials tile without
    // depending on a per-mesh unwrap, while untextured arcs ignore them.
    this.ensurePlanarWorldUv(geometry);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = this.ctx.cfg.shadows;
    mesh.userData.authoredSector = { start: sector.start, span: sector.span };
    return mesh;
  }

  private addSnowBerms(group: THREE.Group, outerR: number, count: number): void {
    const geometry = this.ctx.track(snowDriftGeometry());
    const material = this.ctx.environmentStandardMat(
      "environment:skierg:snowbank-material",
      themed(0xe0edf2, 0x718a96),
      { roughness: 0.98, metalness: 0 },
    );
    const berms = this.ctx.trackInstanced(new THREE.InstancedMesh(geometry, material, count));
    berms.name = "environment:skierg:snowbank";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const tierScale = [0.58, 0.76, 0.9, 1][this.ctx.cfg.environmentDetail];
    for (let i = 0; i < count; i++) {
      const { angle } = sectorSample(i, count, SKI_BERM_SECTORS);
      const radius = outerR + 2.8 + Math.sin(i * 5.31) * 0.62;
      const width = 1.55 + (0.5 + Math.sin(i * 7.77) * 0.5) * 0.8;
      const height = 0.42 + (0.5 + Math.sin(i * 4.17) * 0.5) * 0.28;
      quaternion.setFromAxisAngle(up, angle);
      position.set(Math.sin(angle) * radius, 0.025, Math.cos(angle) * radius);
      scale.set(width * tierScale, height * tierScale, (0.82 + (i % 3) * 0.12) * tierScale);
      matrix.compose(position, quaternion, scale);
      berms.setMatrixAt(i, matrix);
    }
    berms.instanceMatrix.needsUpdate = true;
    berms.receiveShadow = this.ctx.cfg.shadows;
    group.add(berms);
  }

  private addScoreboard(group: THREE.Group, placement: EnvironmentPlacement): void {
    const structureMat = this.ctx.environmentStandardMat(
      "environment:bike:scoreboard-structure-material",
      this.ctx.environment.venueStructure,
      { roughness: 0.5, metalness: 0.46 },
    );
    const screenMat = this.ctx.environmentBasicMat(
      "environment:bike:scoreboard-screen-material",
      themed(0x172334, 0x080d17),
      { fog: true },
    );
    const accentMat = this.ctx.environmentBasicMat(
      "environment:bike:scoreboard-accent-material",
      this.ctx.environment.venueAccent,
      { fog: true },
    );
    const scoreboard = new THREE.Group();
    scoreboard.name = placement.name;
    scoreboard.position.set(
      Math.sin(placement.angle) * placement.radius,
      0,
      Math.cos(placement.angle) * placement.radius,
    );
    scoreboard.rotation.y = placement.angle;
    const supports = this.ctx.track(new THREE.CylinderGeometry(0.16, 0.2, 4.8, 12));
    for (const x of [-3.35, 3.35]) {
      const support = new THREE.Mesh(supports, structureMat);
      support.position.set(x, 2.4, 0);
      scoreboard.add(support);
    }
    const frame = new THREE.Mesh(
      this.ctx.track(roundedVenueBlockGeometry(9.4, 3.6, 0.42, 0.2)),
      structureMat,
    );
    frame.position.y = 5.25;
    const screen = new THREE.Mesh(
      this.ctx.track(roundedVenueBlockGeometry(8.65, 2.78, 0.08, 0.12)),
      screenMat,
    );
    screen.name = "environment:bike:scoreboard-screen";
    screen.position.set(0, 5.25, -0.25);
    const header = new THREE.Mesh(
      this.ctx.track(roundedVenueBlockGeometry(8.65, 0.18, 0.1, 0.04)),
      accentMat,
    );
    header.position.set(0, 6.35, -0.31);
    const split = new THREE.Mesh(
      this.ctx.track(roundedVenueBlockGeometry(0.1, 2.15, 0.1, 0.035)),
      accentMat,
    );
    split.position.set(0, 5.08, -0.31);
    scoreboard.add(frame, screen, header, split);
    group.add(scoreboard);
  }

  /**
   * Water quality is compositional, not just geometric resolution. Medium adds
   * broad sky reflections, High adds a readable launch dock, and Ultra adds a
   * sparse field of near-camera sun glints. Low keeps the clean graphic basin.
   */
  private addRowerWaterTier(group: THREE.Group, outerR: number): void {
    if (this.ctx.cfg.environmentDetail === 0) return;
    const rippleMat = this.ctx.environmentBasicMat(
      "environment:rower:water-ripple-material",
      themed(0xe2f8f7, 0x6caeba),
      { transparent: true, opacity: 0.16, depthWrite: false, fog: true },
    );
    const ripples = new THREE.Group();
    ripples.name = "environment:rower:ripple-field";
    const rippleCount = [0, 18, 30, 44][this.ctx.cfg.environmentDetail];
    for (let index = 0; index < rippleCount; index++) {
      const spread = (index * 0.7548776662466927) % 1;
      const radius = 8 + spread * 76;
      const angle = (index * 0.6180339887498949 + (index % 4) * 0.071) * FULL_CIRCLE;
      const span = degrees(5 + (index % 6) * 2.6);
      const width = 0.18 + (index % 5) * 0.1;
      ripples.add(
        this.makeHorizontalArc(
          `environment:rower:water-ripple-${index + 1}`,
          radius,
          radius + width,
          0.1 + (index % 3) * 0.004,
          { start: angle, span },
          rippleMat,
        ),
      );
    }
    group.add(ripples);

    const reflectionMat = this.ctx.environmentBasicMat(
      "environment:rower:reflection-material",
      themed(0xffdfab, 0x85bdc8),
      { transparent: true, opacity: 0.065, depthWrite: false, fog: true },
    );
    const reflections = new THREE.Group();
    reflections.name = "environment:rower:reflection-bands";
    for (const [index, sector] of [
      { start: degrees(-18), span: degrees(42), inner: outerR + 1.8, outer: outerR + 2.8 },
      { start: degrees(154), span: degrees(28), inner: outerR + 1.8, outer: outerR + 2.8 },
    ].entries()) {
      reflections.add(
        this.makeHorizontalArc(
          `environment:rower:reflection-band-${index + 1}`,
          sector.inner,
          sector.outer,
          0.1,
          sector,
          reflectionMat,
        ),
      );
    }
    group.add(reflections);

    // Launch dock lives on the campus shoreline (addRowerCampus). Water tiers
    // only add surface language so the basin stays one continuous place.
    if (this.ctx.cfg.environmentDetail < 3) return;
    const glintGeo = this.ctx.track(new THREE.CircleGeometry(0.12, 8));
    const glintMat = this.ctx.environmentBasicMat(
      "environment:rower:sun-glint-material",
      themed(0xfff1c8, 0x9cd5dc),
      { transparent: true, opacity: 0.28, depthWrite: false, fog: true },
    );
    const glints = this.ctx.trackInstanced(new THREE.InstancedMesh(glintGeo, glintMat, 56));
    glints.name = "environment:rower:sun-glints";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let index = 0; index < glints.count; index++) {
      const angle = degrees(-18) + degrees(42) * ((index + 0.5) / glints.count);
      const radius = 36 + (index % 9) * 2.3 + Math.sin(index * 3.17) * 1.4;
      position.set(Math.sin(angle) * radius, 0.12, Math.cos(angle) * radius);
      const length = 0.55 + (index % 5) * 0.24;
      scale.set(length, 0.32, 1);
      matrix.compose(position, quaternion, scale);
      glints.setMatrixAt(index, matrix);
    }
    glints.instanceMatrix.needsUpdate = true;
    group.add(glints);
  }

  /**
   * Closed regatta lagoon: water is the racing ring only. The circle centre is
   * land — an island park — just as a stadium’s infield is not more track.
   * Outer shore keeps authored land uses; campus owns dock and buildings.
   */
  addRowerRegattaWorld(group: THREE.Group, detailGroup: THREE.Group, outerR: number): void {
    // Land island in the lagoon centre (not more water), continuous shore,
    // denser bank woodland, water-surface dressing, and the shore campus.
    this.addRowerIslandCenter(group, outerR);
    this.addRowerShoreline(group, outerR);
    this.addRowerReeds(group, outerR);
    this.addRowerTrees(group, outerR);
    this.addRowerWaterTier(group, outerR);
    this.addRowerCampus(group, detailGroup, outerR);
    this.addRowerValleyBackdrop(group);
  }

  /**
   * Island park in the lagoon centre. Water stays in the racing channel
   * Simple shoreline bank ringing the regatta basin — earth topped with grass,
   * not a multi-sector land-use system.
   */
  private addRowerShoreline(group: THREE.Group, outerR: number): void {
    const earthMat = this.ctx.environmentStandardMat(
      "environment:rower:bank-material",
      themed(0x6d7050, 0x32392f),
      { roughness: 0.97, metalness: 0 },
    );
    const grassMat = this.ctx.environmentStandardMat(
      "environment:rower:bank-grass-material",
      themed(0x55724b, 0x294b3d),
      { roughness: 0.94, metalness: 0 },
    );
    this.applyEnvironmentSurfaceMaps(
      earthMat,
      "/replay-assets/environments/forrest-ground-01/forrest-ground-01",
      [0.55, 0.55],
      0.22,
    );
    this.applyEnvironmentSurfaceMaps(
      grassMat,
      "/replay-assets/environments/aerial-grass-rock/aerial-grass-rock",
      [0.45, 0.45],
      0.2,
    );
    const bank = new THREE.Mesh(
      this.ctx.track(new THREE.RingGeometry(outerR + 0.5, outerR + 8, this.ctx.cfg.laneSegments)),
      earthMat,
    );
    bank.name = "environment:rower:shoreline";
    bank.rotation.x = -Math.PI / 2;
    bank.position.y = 0.15;
    bank.receiveShadow = this.ctx.cfg.shadows;
    const grass = new THREE.Mesh(
      this.ctx.track(new THREE.RingGeometry(outerR + 2, outerR + 7.5, this.ctx.cfg.laneSegments)),
      grassMat,
    );
    grass.name = "environment:rower:shoreline-grass";
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.18;
    group.add(bank, grass);
  }

  /**
   * Trees scattered along the outer bank — natural clumps, not formal planting.
   */
  private addRowerTrees(group: THREE.Group, outerR: number): void {
    const count = [28, 48, 72, 110][this.ctx.cfg.environmentDetail];
    const canopyGeo = this.ctx.track(sculptedPineGeometry());
    const mat = this.ctx.environmentStandardMat(
      "environment:rower:bank-tree-material",
      themed(0x2d6548, 0x1c503c),
      { fog: true, roughness: 0.86, metalness: 0 },
    );
    this.applyEnvironmentSurfaceMaps(
      mat,
      "/replay-assets/environments/forest-leaves-04/forest-leaves-04",
      [1.8, 2.2],
      0.14,
    );
    const trees = this.ctx.trackInstanced(new THREE.InstancedMesh(canopyGeo, mat, count));
    trees.name = "environment:rower:bank-trees";
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // Multi-band forest: near bank + mid + far ridge trees for depth.
      const band = i % 3;
      const cluster = Math.floor(i / 3) % 5;
      const base = (cluster / 5) * FULL_CIRCLE + degrees(18 + cluster * 48);
      const angle = base + ((i % 7) - 3) * degrees(2.4 + band);
      const radius = outerR + 3.2 + band * 7.5 + (i % 5) * 0.9 + Math.sin(i * 1.7) * 1.1;
      const size = (band === 0 ? 0.55 : band === 1 ? 0.72 : 0.95) * (0.85 + (i % 4) * 0.08);
      q.setFromAxisAngle(WORLD_UP, angle + i * 0.25);
      p.set(Math.sin(angle) * radius, 0.9 * size, Math.cos(angle) * radius);
      s.set(size * 1.08, size, size * 1.08);
      m4.compose(p, q, s);
      trees.setMatrixAt(i, m4);
    }
    trees.instanceMatrix.needsUpdate = true;
    group.add(trees);
  }

  /** Reed beds at the waterline — continuous wetland edge detail. */
  private addRowerReeds(group: THREE.Group, outerR: number): void {
    const count = [24, 40, 64, 96][this.ctx.cfg.environmentDetail];
    const geo = this.ctx.track(new THREE.CylinderGeometry(0.018, 0.028, 1, 6));
    const mat = this.ctx.environmentStandardMat(
      "environment:rower:reed-material",
      themed(0x8b8850, 0x53633f),
      { roughness: 0.96, metalness: 0 },
    );
    this.applyEnvironmentSurfaceMaps(
      mat,
      "/replay-assets/environments/leafy-grass/leafy-grass",
      [1.6, 4.2],
      0.3,
    );
    const reeds = this.ctx.trackInstanced(new THREE.InstancedMesh(geo, mat, count));
    reeds.name = "environment:rower:reed-beds";
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * FULL_CIRCLE + Math.sin(i * 3.1) * degrees(2);
      const radius = outerR + 1.1 + (i % 5) * 0.35;
      const height = 0.45 + (i % 6) * 0.12;
      q.setFromAxisAngle(WORLD_UP, angle + i * 0.4);
      p.set(Math.sin(angle) * radius, height * 0.5 + 0.06, Math.cos(angle) * radius);
      s.set(1, height, 1);
      m4.compose(p, q, s);
      reeds.setMatrixAt(i, m4);
    }
    reeds.instanceMatrix.needsUpdate = true;
    group.add(reeds);
  }

  /**
   * Island park in the lagoon centre. Water stays in the racing channel
   * between island beach and outer banks — not a second water disk.
   */
  private addRowerIslandCenter(group: THREE.Group, _outerR: number): void {
    const island = new THREE.Group();
    island.name = "environment:rower:basin-center";
    const islandR = 15.5;

    const earthMat = this.ctx.environmentStandardMat(
      "environment:rower:island-earth-material",
      themed(0x6a6d4f, 0x32392f),
      { roughness: 0.97, metalness: 0 },
    );
    const grassMat = this.ctx.environmentStandardMat(
      "environment:rower:island-grass-material",
      themed(0x55724b, 0x294b3d),
      { roughness: 0.93, metalness: 0 },
    );
    const beachMat = this.ctx.environmentStandardMat(
      "environment:rower:island-beach-material",
      themed(0xc4b89a, 0x5a6258),
      { roughness: 0.9, metalness: 0.04 },
    );
    this.applyEnvironmentSurfaceMaps(
      earthMat,
      "/replay-assets/environments/forrest-ground-01/forrest-ground-01",
      [0.55, 0.55],
      0.22,
    );
    this.applyEnvironmentSurfaceMaps(
      grassMat,
      "/replay-assets/environments/aerial-grass-rock/aerial-grass-rock",
      [0.45, 0.45],
      0.2,
    );
    this.applyEnvironmentSurfaceMaps(
      beachMat,
      "/replay-assets/environments/dry-river-pebbles/dry-river-pebbles",
      [0.7, 0.7],
      0.35,
    );

    const core = new THREE.Mesh(
      this.ctx.track(new THREE.CircleGeometry(islandR - 2.2, this.ctx.cfg.laneSegments)),
      earthMat,
    );
    core.name = "environment:rower:island-core";
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.06;
    core.receiveShadow = this.ctx.cfg.shadows;
    const lawn = new THREE.Mesh(
      this.ctx.track(new THREE.CircleGeometry(islandR - 3.4, this.ctx.cfg.laneSegments)),
      grassMat,
    );
    lawn.name = "environment:rower:island-lawn";
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.09;
    lawn.receiveShadow = this.ctx.cfg.shadows;
    const beach = new THREE.Mesh(
      this.ctx.track(new THREE.RingGeometry(islandR - 2.2, islandR, this.ctx.cfg.laneSegments)),
      beachMat,
    );
    beach.name = "environment:rower:island-beach";
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.04;
    // Soft land mound for mass above the water plane.
    const mound = new THREE.Mesh(this.ctx.track(alpineFoothillGeometry()), grassMat);
    mound.name = "environment:rower:island-mound";
    mound.scale.set(2.2, 0.48, 1.9);
    mound.position.y = 0.95;
    island.add(core, lawn, beach, mound);

    // Secondary shrub layer around the beach for silhouette richness.
    if (this.ctx.cfg.environmentDetail >= 1) {
      const shrubCount = [8, 14, 22, 32][this.ctx.cfg.environmentDetail];
      const shrubGeo = this.ctx.track(sculptedPineGeometry());
      const shrubMat = this.ctx.environmentStandardMat(
        "environment:rower:island-shrub-material",
        themed(0x3a6a4a, 0x1e4032),
        { fog: true, roughness: 0.9, metalness: 0 },
      );
      const shrubs = this.ctx.trackInstanced(
        new THREE.InstancedMesh(shrubGeo, shrubMat, shrubCount),
      );
      shrubs.name = "environment:rower:island-shrubs";
      const sm = new THREE.Matrix4();
      const sq = new THREE.Quaternion();
      const sp = new THREE.Vector3();
      const ss = new THREE.Vector3();
      for (let i = 0; i < shrubCount; i++) {
        const angle = (i / shrubCount) * FULL_CIRCLE + degrees(7);
        const radius = islandR - 3.8 + (i % 4) * 0.55;
        const size = 0.22 + (i % 3) * 0.06;
        sq.setFromAxisAngle(WORLD_UP, angle);
        sp.set(Math.sin(angle) * radius, 0.45 * size, Math.cos(angle) * radius);
        ss.set(size * 1.4, size * 0.7, size * 1.4);
        sm.compose(sp, sq, ss);
        shrubs.setMatrixAt(i, sm);
      }
      shrubs.instanceMatrix.needsUpdate = true;
      island.add(shrubs);
    }

    // Natural tree cover — scattered pines, not a formal park planting.
    const treeCount = [14, 22, 34, 48][this.ctx.cfg.environmentDetail];
    const canopyGeo = this.ctx.track(sculptedPineGeometry());
    const canopyMat = this.ctx.environmentStandardMat(
      "environment:rower:island-canopy-material",
      themed(0x2d6548, 0x1c503c),
      { fog: true, roughness: 0.86, metalness: 0 },
    );
    this.applyEnvironmentSurfaceMaps(
      canopyMat,
      "/replay-assets/environments/forest-leaves-04/forest-leaves-04",
      [1.8, 2.2],
      0.14,
    );
    const trees = this.ctx.trackInstanced(new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount));
    trees.name = "environment:rower:island-trees";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let index = 0; index < treeCount; index++) {
      // Clustered placement: trees bunch in 3–4 loose groups rather than
      // an even ring, so the island reads as natural growth, not a park.
      const cluster = index % 4;
      const baseAngle = (cluster / 4) * FULL_CIRCLE + degrees(14 + cluster * 37);
      const angle = baseAngle + (index - cluster) * degrees(4 + cluster * 3);
      const radius = 3.2 + (index % 7) * 1.25 + (cluster % 2) * 0.6;
      const size = 0.38 + (index % 5) * 0.08;
      quaternion.setFromAxisAngle(WORLD_UP, angle + index * 0.22);
      position.set(Math.sin(angle) * radius, 0.8 * size, Math.cos(angle) * radius);
      scale.set(size * 1.05, size, size * 1.05);
      matrix.compose(position, quaternion, scale);
      trees.setMatrixAt(index, matrix);
    }
    trees.instanceMatrix.needsUpdate = true;
    island.add(trees);

    // Start pontoons live in the water channel (between island and outer shore),
    // facing the campus — regatta gear, not centre-of-island props.
    if (this.ctx.cfg.environmentDetail >= 1) {
      const pontoonMat = this.ctx.environmentStandardMat(
        "environment:rower:start-pontoon-material",
        themed(0x8d7558, 0x3f3428),
        { roughness: 0.72, metalness: 0.04 },
      );
      this.applyEnvironmentSurfaceMaps(
        pontoonMat,
        "/replay-assets/environments/brown-planks-03/brown-planks-03",
        [1.6, 0.55],
        0.28,
      );
      const pontoons = new THREE.Group();
      pontoons.name = "environment:rower:start-pontoons";
      const angle = ROW_CAMPUS_SECTOR.start + ROW_CAMPUS_SECTOR.span * 0.4;
      for (const [index, radius] of [18.8, 21.4].entries()) {
        const deck = new THREE.Mesh(
          this.ctx.track(roundedVenueBlockGeometry(5.2 - index * 0.35, 0.18, 1.45, 0.08)),
          pontoonMat,
        );
        deck.name = `environment:rower:start-pontoon-${index + 1}`;
        deck.position.set(Math.sin(angle) * radius, 0.09, Math.cos(angle) * radius);
        deck.rotation.y = angle;
        pontoons.add(deck);
      }
      island.add(pontoons);
    }
    group.add(island);
  }

  /**
   * Continuous shoreline around the basin with authored land uses: full bank
   * on woodland and campus sides, low reed shore on the open vista.
   */
  private addRowerShorelineSystem(group: THREE.Group, outerR: number): void {
    const bank = new THREE.Group();
    bank.name = "environment:rower:river-banks";
    const earthMat = this.ctx.environmentStandardMat(
      "environment:rower:bank-earth-material",
      themed(0x6d7050, 0x32392f),
      { roughness: 0.98, metalness: 0 },
    );
    const grassMat = this.ctx.environmentStandardMat(
      "environment:rower:bank-grass-material",
      themed(0x55724b, 0x294b3d),
      { roughness: 0.94, metalness: 0 },
    );
    const lawnMat = this.ctx.environmentStandardMat(
      "environment:rower:campus-lawn-material",
      themed(0x5f7d4f, 0x2f4d38),
      { roughness: 0.9, metalness: 0 },
    );
    this.applyEnvironmentSurfaceMaps(
      earthMat,
      "/replay-assets/environments/forrest-ground-01/forrest-ground-01",
      [0.14, 0.14],
      0.28,
    );
    this.applyEnvironmentSurfaceMaps(
      grassMat,
      "/replay-assets/environments/aerial-grass-rock/aerial-grass-rock",
      [0.11, 0.11],
      0.24,
    );
    this.applyEnvironmentSurfaceMaps(
      lawnMat,
      "/replay-assets/environments/aerial-grass-rock/aerial-grass-rock",
      [0.16, 0.16],
      0.2,
    );
    const waterlineMat = this.ctx.environmentStandardMat(
      "environment:rower:bank-waterline-material",
      themed(0xb4afa0, 0x4f5854),
      { roughness: 0.9, metalness: 0.05 },
    );
    this.applyEnvironmentSurfaceMaps(
      waterlineMat,
      "/replay-assets/environments/dry-river-pebbles/dry-river-pebbles",
      [0.42, 0.42],
      0.45,
    );
    const wetEdgeMat = this.ctx.environmentStandardMat(
      "environment:rower:wet-edge-material",
      themed(0x2a5a5e, 0x16363c),
      { roughness: 0.28, metalness: 0.08 },
    );

    const landSectors: readonly EnvironmentSector[] = [...ROW_WOODLAND_SECTORS, ROW_CAMPUS_SECTOR];
    for (const [index, sector] of landSectors.entries()) {
      const isCampus = sector === ROW_CAMPUS_SECTOR;
      bank.add(
        this.makeHorizontalArc(
          `environment:rower:earth-bank-${index + 1}`,
          outerR + 3.0,
          outerR + (isCampus ? 10.5 : 13.5),
          0.03,
          sector,
          earthMat,
        ),
        this.makeHorizontalArc(
          `environment:rower:grass-bank-${index + 1}`,
          outerR + 4.8,
          outerR + (isCampus ? 16.5 : 15.2),
          isCampus ? 0.1 : 0.08,
          sector,
          isCampus ? lawnMat : grassMat,
        ),
        this.makeHorizontalArc(
          `environment:rower:bank-terrace-${index + 1}`,
          outerR + 7.0,
          outerR + (isCampus ? 15.8 : 14.2),
          isCampus ? 0.42 : 0.62,
          sector,
          isCampus ? lawnMat : grassMat,
        ),
        this.makeHorizontalArc(
          `environment:rower:wet-edge-${index + 1}`,
          outerR + 2.4,
          outerR + 3.0,
          0.04,
          sector,
          wetEdgeMat,
        ),
        this.makeHorizontalArc(
          `environment:rower:waterline-${index + 1}`,
          outerR + 2.85,
          outerR + 3.5,
          0.1,
          sector,
          waterlineMat,
        ),
      );
    }

    // Open vista keeps a low reed shore so the basin still has a continuous
    // waterline without walling the sightline with embankments.
    bank.add(
      this.makeHorizontalArc(
        "environment:rower:vista-shingle",
        outerR + 2.5,
        outerR + 5.2,
        0.05,
        ROW_VISTA_SECTOR,
        waterlineMat,
      ),
      this.makeHorizontalArc(
        "environment:rower:vista-wet-edge",
        outerR + 2.35,
        outerR + 2.85,
        0.035,
        ROW_VISTA_SECTOR,
        wetEdgeMat,
      ),
    );

    const reedCount = [22, 36, 54, 74][this.ctx.cfg.environmentDetail];
    const reedGeo = this.ctx.track(new THREE.CylinderGeometry(0.018, 0.027, 1, 7));
    const reedMat = this.ctx.environmentStandardMat(
      "environment:rower:reed-material",
      themed(0x8b8850, 0x53633f),
      { roughness: 0.96, metalness: 0 },
    );
    this.applyEnvironmentSurfaceMaps(
      reedMat,
      "/replay-assets/environments/leafy-grass/leafy-grass",
      [1.6, 4.2],
      0.32,
    );
    const reeds = this.ctx.trackInstanced(new THREE.InstancedMesh(reedGeo, reedMat, reedCount));
    reeds.name = "environment:rower:reed-beds";
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    // Reeds only at land/water edges (woodland + vista), never on the campus
    // lawn where a real club would keep the shore clear for launching.
    const reedSectors: readonly EnvironmentSector[] = [...ROW_WOODLAND_SECTORS, ROW_VISTA_SECTOR];
    for (let index = 0; index < reedCount; index++) {
      const { angle } = sectorSample(index, reedCount, reedSectors);
      const radius = outerR + 3.4 + (index % 6) * 0.22;
      const height = 0.4 + (index % 5) * 0.12;
      position.set(Math.sin(angle) * radius, height * 0.5 + 0.08, Math.cos(angle) * radius);
      quaternion.setFromAxisAngle(WORLD_UP, angle + index * 0.27);
      scale.set(1, height, 1);
      matrix.compose(position, quaternion, scale);
      reeds.setMatrixAt(index, matrix);
    }
    reeds.instanceMatrix.needsUpdate = true;
    bank.add(reeds);
    group.add(bank);
  }

  /**
   * Woodland grows only on land behind the continuous bank — one tree system,
   * not a second random prop field competing with the shoreline.
   */
  private addRowerWoodland(group: THREE.Group, outerR: number): void {
    const woodland = new THREE.Group();
    woodland.name = "environment:rower:woodland";
    const nearCount = [10, 16, 24, 32][this.ctx.cfg.environmentDetail];
    const nearMat = this.ctx.environmentStandardMat(
      "environment:rower:shoreline-material",
      themed(0x355f48, 0x163c33),
      { fog: true, roughness: 0.94, metalness: 0 },
    );
    this.applyEnvironmentSurfaceMaps(
      nearMat,
      "/replay-assets/environments/forest-leaves-04/forest-leaves-04",
      [2.1, 2.6],
      0.16,
    );
    const nearGeo = this.ctx.track(alpineFoothillGeometry());
    const nearHills = this.ctx.trackInstanced(new THREE.InstancedMesh(nearGeo, nearMat, nearCount));
    nearHills.name = "environment:rower:wooded-shoreline";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let index = 0; index < nearCount; index++) {
      const { angle } = sectorSample(index, nearCount, ROW_WOODLAND_SECTORS);
      const size = 0.85 + (0.5 + Math.sin(index * 4.7) * 0.5) * 0.45;
      const radius = outerR + 14 + (index % 4) * 1.8;
      quaternion.setFromAxisAngle(WORLD_UP, angle + 0.4);
      position.set(Math.sin(angle) * radius, 1.35 * size, Math.cos(angle) * radius);
      scale.set(size * 2.4, size * 0.85, size * 1.5);
      matrix.compose(position, quaternion, scale);
      nearHills.setMatrixAt(index, matrix);
    }
    nearHills.instanceMatrix.needsUpdate = true;
    woodland.add(nearHills);

    // Pines only behind woodland banks — the campus and vista stay clear.
    this.addInstancedPines(
      woodland,
      [40, 64, 96, 140][this.ctx.cfg.environmentDetail],
      outerR + 14,
      outerR + 38,
      ROW_WOODLAND_SECTORS,
    );
    group.add(woodland);
  }

  /**
   * One campus owns dock, lawn path and buildings as a connected facility
   * rather than three props dropped at random angles.
   */
  private addRowerCampus(group: THREE.Group, detailGroup: THREE.Group, outerR: number): void {
    const campus = new THREE.Group();
    campus.name = "environment:rower:campus";
    const center = ROW_CAMPUS_SECTOR.start + ROW_CAMPUS_SECTOR.span * 0.48;

    // Hardscape apron linking dock to pavilion — a real club walkway.
    const pathMat = this.ctx.environmentStandardMat(
      "environment:rower:campus-path-material",
      themed(0xb7aea0, 0x4e524c),
      { roughness: 0.88, metalness: 0.02 },
    );
    this.applyEnvironmentSurfaceMaps(
      pathMat,
      "/replay-assets/environments/cobblestone-floor-03/cobblestone-floor-03",
      [1.2, 1.2],
      0.38,
    );
    campus.add(
      this.makeHorizontalArc(
        "environment:rower:campus-path",
        outerR + 5.5,
        outerR + 8.2,
        0.14,
        {
          start: center - degrees(10),
          span: degrees(20),
        },
        pathMat,
      ),
    );

    // Launch dock sits on the campus water edge and faces the basin.
    if (this.ctx.cfg.environmentDetail >= 2) {
      const dock = new THREE.Group();
      dock.name = "environment:rower:launch-dock";
      dock.position.set(Math.sin(center) * (outerR + 3.6), 0.08, Math.cos(center) * (outerR + 3.6));
      dock.rotation.y = center;
      const deckMat = this.ctx.environmentStandardMat(
        "environment:rower:dock-deck-material",
        themed(0x9a7654, 0x49392d),
        { roughness: 0.78, metalness: 0.02 },
      );
      this.applyEnvironmentSurfaceMaps(
        deckMat,
        "/replay-assets/environments/brown-planks-03/brown-planks-03",
        [2.8, 0.7],
        0.35,
      );
      const railMat = this.ctx.environmentStandardMat(
        "environment:rower:dock-rail-material",
        this.ctx.environment.venueStructure,
        { roughness: 0.46, metalness: 0.42 },
      );
      const deck = new THREE.Mesh(
        this.ctx.track(roundedVenueBlockGeometry(12, 0.22, 2.6, 0.1)),
        deckMat,
      );
      const railGeo = this.ctx.track(new THREE.CylinderGeometry(0.045, 0.055, 1.15, 10));
      for (const x of [-5, -1.7, 1.7, 5]) {
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(x, 0.56, -1.05);
        dock.add(rail);
      }
      dock.add(deck);
      campus.add(dock);
    }

    group.add(campus);
    // Buildings stay in the detail group but share the campus radius/angles.
    this.addPavilions(detailGroup, ROW_LANDMARKS);
  }

  /** Distant valley shoulders — continuous land mass, not prop scatter. */
  private addRowerValleyBackdrop(group: THREE.Group): void {
    const valley = new THREE.Group();
    valley.name = "environment:rower:valley-ridges";
    const farMat = this.ctx.environmentStandardMat(
      "environment:rower:ridge-far-material",
      themed(0x6f8a72, 0x1f3d40),
      { fog: true, roughness: 1, metalness: 0 },
    );
    const midMat = this.ctx.environmentStandardMat(
      "environment:rower:ridge-mid-material",
      themed(0x4a6d54, 0x1a403a),
      { fog: true, roughness: 0.97, metalness: 0 },
    );
    const count = [6, 9, 12, 16][this.ctx.cfg.environmentDetail];
    const geo = this.ctx.track(alpineFoothillGeometry());
    for (const [layer, material, radius, height, width, name] of [
      [0, farMat, 98, 1.7, 3.6, "environment:rower:ridge-far"],
      [1, midMat, 80, 1.25, 2.9, "environment:rower:ridge-mid"],
    ] as const) {
      const capacity = count + layer * 2;
      const mesh = this.ctx.trackInstanced(new THREE.InstancedMesh(geo, material, capacity));
      mesh.name = name;
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      let written = 0;
      for (let index = 0; index < capacity; index++) {
        // Continuous around most of the basin, thinner on the open vista.
        const t = index / Math.max(1, capacity - 1);
        const angle = degrees(-50) + degrees(280) * t;
        const vista = angularDistance(angle, ROW_VISTA_SECTOR.start + ROW_VISTA_SECTOR.span * 0.5);
        if (vista < degrees(22)) continue;
        const size = 0.9 + (index % 4) * 0.12;
        quaternion.setFromAxisAngle(WORLD_UP, angle + 0.35);
        position.set(Math.sin(angle) * radius, height * size * 1.4, Math.cos(angle) * radius);
        scale.set(size * width, size * height, size * width * 0.7);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(written, matrix);
        written += 1;
      }
      matrix.makeScale(0, 0, 0);
      for (let index = written; index < capacity; index++) mesh.setMatrixAt(index, matrix);
      mesh.count = written;
      mesh.instanceMatrix.needsUpdate = true;
      valley.add(mesh);
    }
    group.add(valley);
  }

  /**
   * Nordic stadium: snow is the racing track and outer valley only. The circle
   * centre is the stadium plaza — hardscape, lawn, boards, flags — not more
   * snow. Forest/alpine/lodge land uses own the periphery.
   */
  addSkiStadiumWorld(group: THREE.Group, detailGroup: THREE.Group, outerR: number): void {
    this.addSkiStadiumCentre(group, outerR);
    this.addSkiValley(group, outerR);
    this.addSnowBerms(group, outerR, [20, 34, 52, 72][this.ctx.cfg.environmentDetail]);
    this.addAlpineFoothills(group, [8, 12, 18, 26][this.ctx.cfg.environmentDetail]);
    this.addAlpinePeaks(group, [12, 18, 28, 40][this.ctx.cfg.environmentDetail]);
    this.addInstancedPines(
      group,
      [48, 72, 110, 160][this.ctx.cfg.environmentDetail],
      outerR + 22,
      outerR + 58,
      SKI_FOREST_SECTORS,
    );
    this.addSkiSurfaceTier(group, outerR);
    this.addFloodlights(detailGroup, SKI_FLOODLIGHTS, 10 + this.ctx.cfg.environmentDetail * 3);
    this.addPavilions(detailGroup, SKI_LANDMARKS);
  }

  /**
   * A real XC stadium centre is snow, not paving. The start/finish area sits
   * on packed snow with subtle grooming texture — no concrete, turf, boards or
   * flag masts belong inside a Nordic course loop.
   */
  private addSkiStadiumCentre(group: THREE.Group, outerR: number): void {
    const centre = new THREE.Group();
    centre.name = "environment:skierg:stadium-centre";
    const snowMat = this.ctx.environmentStandardMat(
      "environment:skierg:centre-snow-material",
      themed(0xe2edf5, 0xb0c4d4),
      { roughness: 0.94, metalness: 0 },
    );
    const packedMat = this.ctx.environmentStandardMat(
      "environment:skierg:centre-packed-material",
      themed(0xd4e2ec, 0x9bb0c0),
      { roughness: 0.9, metalness: 0 },
    );
    if (this.ctx.cfg.environmentDetail >= 1) {
      snowMat.map = this.makeSnowSurfaceTexture(this.ctx.cfg.environmentDetail);
      packedMat.map = this.makeSnowSurfaceTexture(this.ctx.cfg.environmentDetail);
      snowMat.needsUpdate = true;
      packedMat.needsUpdate = true;
    }
    if (this.ctx.cfg.environmentDetail >= 2) {
      snowMat.emissive = new THREE.Color(themed(0x1a2a38, 0x0a1828)("light"));
      snowMat.emissiveIntensity = 0.1;
      snowMat.needsUpdate = true;
    }
    // Outer stadium snow + denser packed start/finish pad near lodge.
    const field = new THREE.Mesh(
      this.ctx.track(new THREE.CircleGeometry(outerR - 1.0, this.ctx.cfg.laneSegments)),
      snowMat,
    );
    field.name = "environment:skierg:stadium-field";
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.02;
    field.receiveShadow = this.ctx.cfg.shadows;
    const pad = new THREE.Mesh(
      this.ctx.track(new THREE.CircleGeometry(8.5, this.ctx.cfg.laneSegments)),
      packedMat,
    );
    pad.name = "environment:skierg:start-pad";
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.035;
    pad.receiveShadow = this.ctx.cfg.shadows;
    centre.add(field, pad);

    // Parallel groomed track lines across the stadium snow.
    const trackMat = this.ctx.environmentBasicMat(
      "environment:skierg:groom-line-material",
      themed(0xc0d2de, 0x6e8796),
      { fog: true },
    );
    const trackCount = [6, 8, 12, 16][this.ctx.cfg.environmentDetail];
    for (let i = 0; i < trackCount; i++) {
      const across = (i / Math.max(1, trackCount - 1) - 0.5) * 16;
      const strip = new THREE.Mesh(this.ctx.track(new THREE.PlaneGeometry(24, 0.18)), trackMat);
      strip.name = `environment:skierg:groom-line-${i + 1}`;
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = degrees(6);
      strip.position.set(across * 0.12, 0.045, across * 0.04);
      centre.add(strip);
    }

    // Groomed start chute leading from the lodge toward the track.
    const chuteMat = this.ctx.environmentStandardMat(
      "environment:skierg:chute-material",
      themed(0xd8e5f0, 0x9bb5c8),
      { roughness: 0.92, metalness: 0 },
    );
    const lodgeAngle = SKI_LODGE_SECTOR.start + SKI_LODGE_SECTOR.span * 0.5;
    centre.add(
      this.makeHorizontalArc(
        "environment:skierg:start-chute",
        outerR - 6.5,
        outerR - 1.2,
        0.05,
        { start: lodgeAngle - degrees(14), span: degrees(28) },
        chuteMat,
      ),
    );

    // Low snow fences / boards only on the lodge approach — stadium edge, not full ring.
    if (this.ctx.cfg.environmentDetail >= 1) {
      const boardCount = [10, 16, 24, 32][this.ctx.cfg.environmentDetail];
      const boardGeo = this.ctx.track(roundedVenueBlockGeometry(1.5, 0.7, 0.1, 0.05));
      const boardMat = this.ctx.environmentBasicMat(
        "environment:skierg:snow-fence-material",
        this.ctx.environment.venueAccent,
        { fog: true },
      );
      const boards = this.ctx.trackInstanced(
        new THREE.InstancedMesh(boardGeo, boardMat, boardCount),
      );
      boards.name = "environment:skierg:snow-fences";
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < boardCount; i++) {
        const { angle } = sectorSample(i, boardCount, [SKI_LODGE_SECTOR]);
        const radius = outerR - 0.9;
        p.set(Math.sin(angle) * radius, 0.4, Math.cos(angle) * radius);
        q.setFromAxisAngle(WORLD_UP, angle);
        m4.compose(p, q, s);
        boards.setMatrixAt(i, m4);
      }
      boards.instanceMatrix.needsUpdate = true;
      centre.add(boards);
    }
    group.add(centre);
  }

  private addSkiValley(group: THREE.Group, outerR: number): void {
    const valley = new THREE.Group();
    valley.name = "environment:skierg:valley-bowl";
    const shadowSnowMat = this.ctx.environmentStandardMat(
      "environment:skierg:valley-shadow-material",
      themed(0xcbdde5, 0x6e8795),
      { roughness: 0.98, metalness: 0 },
    );
    const sunSnowMat = this.ctx.environmentStandardMat(
      "environment:skierg:valley-sun-material",
      themed(0xf1f6f8, 0xa9bdc7),
      { roughness: 0.95, metalness: 0 },
    );
    // Continuous land snow except the open vista sector.
    const slopeSectors: readonly EnvironmentSector[] = [
      { start: degrees(-170), span: degrees(150), weight: 1 },
      { start: degrees(20), span: degrees(140), weight: 1 },
      { start: degrees(195), span: degrees(50), weight: 0.8 },
    ];
    for (const [index, sector] of slopeSectors.entries()) {
      valley.add(
        this.makeHorizontalArc(
          `environment:skierg:valley-shadow-${index + 1}`,
          outerR + 2.6,
          outerR + 19,
          0.03,
          sector,
          shadowSnowMat,
        ),
        this.makeHorizontalArc(
          `environment:skierg:valley-sun-${index + 1}`,
          outerR + 6.4,
          outerR + 17.2,
          0.085,
          { start: sector.start + degrees(6), span: sector.span * 0.78 },
          sunSnowMat,
        ),
      );
    }

    // Course fencing only frames the lodge/competition approaches.
    const panelCount = [8, 12, 18, 24][this.ctx.cfg.environmentDetail];
    const panelGeo = this.ctx.track(roundedVenueBlockGeometry(1.75, 0.52, 0.08, 0.07));
    const panelMat = this.ctx.environmentBasicMat(
      "environment:skierg:course-panel-material",
      this.ctx.environment.venueAccent,
      { fog: true },
    );
    const panels = this.ctx.trackInstanced(new THREE.InstancedMesh(panelGeo, panelMat, panelCount));
    panels.name = "environment:skierg:course-fencing";
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let index = 0; index < panelCount; index++) {
      const { angle } = sectorSample(index, panelCount, [
        SKI_LODGE_SECTOR,
        { start: degrees(175), span: degrees(55), weight: 1 },
      ]);
      const radius = outerR + 2.15;
      position.set(Math.sin(angle) * radius, 0.58, Math.cos(angle) * radius);
      quaternion.setFromAxisAngle(WORLD_UP, angle);
      matrix.compose(position, quaternion, scale);
      panels.setMatrixAt(index, matrix);
    }
    panels.instanceMatrix.needsUpdate = true;
    valley.add(panels);
    group.add(valley);
  }

  /** High/Ultra snow language on the course edge — not a random glitter field. */
  private addSkiSurfaceTier(group: THREE.Group, outerR: number): void {
    if (this.ctx.cfg.environmentDetail < 2) return;
    const windLipMat = this.ctx.environmentStandardMat(
      "environment:skierg:wind-lip-material",
      themed(0xdcebf2, 0x7993a1),
      { roughness: 0.94, metalness: 0 },
    );
    const windLips = new THREE.Group();
    windLips.name = "environment:skierg:wind-lips";
    for (const [index, sector] of [
      SKI_LODGE_SECTOR,
      { start: degrees(190), span: degrees(50), weight: 1 },
    ].entries()) {
      windLips.add(
        this.makeHorizontalArc(
          `environment:skierg:wind-lip-${index + 1}`,
          outerR + 1.7,
          outerR + 3.1,
          0.12,
          sector,
          windLipMat,
        ),
      );
    }
    group.add(windLips);

    if (this.ctx.cfg.environmentDetail < 3) return;
    // Crystal highlights only near sun-facing lodge snow, not a full-loop spray.
    const crystalGeo = this.ctx.track(new THREE.OctahedronGeometry(0.045, 0));
    const crystalMat = this.ctx.environmentBasicMat(
      "environment:skierg:snow-crystal-material",
      themed(0xffffff, 0xbfe4f4),
      { transparent: true, opacity: 0.3, depthWrite: false, fog: true },
    );
    const crystals = this.ctx.trackInstanced(new THREE.InstancedMesh(crystalGeo, crystalMat, 36));
    crystals.name = "environment:skierg:snow-crystals";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let index = 0; index < crystals.count; index++) {
      const { angle } = sectorSample(index, crystals.count, [SKI_LODGE_SECTOR, SKI_OPEN_SECTOR]);
      const radius = outerR + 1.2 + (index % 7) * 0.55;
      position.set(Math.sin(angle) * radius, 0.09 + (index % 3) * 0.012, Math.cos(angle) * radius);
      quaternion.setFromAxisAngle(WORLD_UP, angle + index * 0.37);
      const size = 0.7 + (index % 5) * 0.14;
      scale.set(size * 2.1, size * 0.5, size);
      matrix.compose(position, quaternion, scale);
      crystals.setMatrixAt(index, matrix);
    }
    crystals.instanceMatrix.needsUpdate = true;
    group.add(crystals);
  }

  /**
   * One dusk circuit venue: planted infield park at the centre, grandstands
   * as the stadium shell, city skyline only on urban land, service campus on
   * its own sector.
   */
  addBikeCircuitWorld(group: THREE.Group, detailGroup: THREE.Group, outerR: number): void {
    this.addBikeInfieldFloor(group, outerR);
    this.addBikeSeating(group);
    this.addBikeArenaWall(group);
    this.addBikeTrackBoards(group, outerR);
    this.addBikeHangarLights(group, outerR);
    this.addScoreboard(detailGroup, BIKE_SCOREBOARD);
    this.addBikeCeilingBeams(group, outerR);
    if (this.ctx.cfg.environmentDetail >= 1) {
      this.addPavilions(detailGroup, [BIKE_SERVICE_BUILDING]);
    }
  }

  /**
   * Indoor velodrome infield: multi-use sports-hall floor with court markings
   * and a staging apron — not a landscaped park.
   */
  private addBikeInfieldFloor(group: THREE.Group, outerR: number): void {
    const floorMat = this.ctx.environmentStandardMat(
      "environment:bike:infield-floor-material",
      themed(0x6b7b6e, 0x2a3a31),
      { roughness: 0.72, metalness: 0.02 },
    );
    this.applyEnvironmentSurfaceMaps(
      floorMat,
      "/replay-assets/environments/brushed-concrete-2/brushed-concrete-2",
      [0.28, 0.28],
      0.14,
    );
    const floor = new THREE.Mesh(
      this.ctx.track(new THREE.CircleGeometry(outerR - 0.9, this.ctx.cfg.laneSegments)),
      floorMat,
    );
    floor.name = "environment:bike:infield-floor";
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    floor.receiveShadow = this.ctx.cfg.shadows;
    group.add(floor);

    const lineMat = this.ctx.environmentBasicMat(
      "environment:bike:infield-line-material",
      themed(0xd4cec4, 0x3a4248),
      { transparent: true, opacity: 0.32, depthWrite: false },
    );
    // Court centre circle + half-court + key boxes for multi-use hall read.
    const centreCircle = new THREE.Mesh(
      this.ctx.track(new THREE.RingGeometry(1.65, 1.8, 48)),
      lineMat,
    );
    centreCircle.name = "environment:bike:infield-centre-circle";
    centreCircle.rotation.x = -Math.PI / 2;
    centreCircle.position.y = 0.005;
    const halfCourt = new THREE.Mesh(
      this.ctx.track(new THREE.PlaneGeometry(0.12, outerR * 1.4)),
      lineMat,
    );
    halfCourt.name = "environment:bike:infield-half-court";
    halfCourt.rotation.x = -Math.PI / 2;
    halfCourt.position.y = 0.006;
    group.add(centreCircle, halfCourt);

    if (this.ctx.cfg.environmentDetail >= 1) {
      for (const side of [-1, 1]) {
        const key = new THREE.Mesh(
          this.ctx.track(new THREE.RingGeometry(2.8, 2.95, 32, 1, 0, Math.PI)),
          lineMat,
        );
        key.name = `environment:bike:infield-key-${side > 0 ? "a" : "b"}`;
        key.rotation.x = -Math.PI / 2;
        key.rotation.z = side > 0 ? 0 : Math.PI;
        key.position.set(0, 0.006, side * (outerR * 0.38));
        group.add(key);
      }
      // Staging rectangles near the service sector for equipment warm-up zones.
      const stageMat = this.ctx.environmentStandardMat(
        "environment:bike:staging-mat-material",
        themed(0x5a655c, 0x2a3330),
        { roughness: 0.8, metalness: 0.04 },
      );
      this.applyEnvironmentSurfaceMaps(
        stageMat,
        "/replay-assets/environments/concrete-floor-painted/concrete-floor-painted",
        [0.8, 0.8],
        0.15,
      );
      const serviceAngle = BIKE_SERVICE_SECTOR.start + BIKE_SERVICE_SECTOR.span * 0.5;
      for (const [i, off] of [-3.2, 0, 3.2].entries()) {
        const pad = new THREE.Mesh(
          this.ctx.track(roundedVenueBlockGeometry(2.4, 0.04, 3.6, 0.06)),
          stageMat,
        );
        pad.name = `environment:bike:staging-pad-${i + 1}`;
        pad.position.set(
          Math.sin(serviceAngle) * (outerR - 8) + Math.cos(serviceAngle) * off,
          0.02,
          Math.cos(serviceAngle) * (outerR - 8) - Math.sin(serviceAngle) * off,
        );
        pad.rotation.y = serviceAngle;
        group.add(pad);
      }
    }
  }

  /** Full seating bowl with denser tiers and seat colour breaks. */
  private addBikeSeating(group: THREE.Group): void {
    const tierMat = this.ctx.environmentBasicMat(
      "environment:bike:stands-material",
      this.ctx.environment.midSilhouette,
      { side: THREE.DoubleSide, fog: true },
    );
    const accentMat = this.ctx.environmentBasicMat(
      "environment:bike:stands-accent-material",
      this.ctx.environment.venueAccent,
      { side: THREE.DoubleSide, fog: true },
    );
    const stands = new THREE.Group();
    stands.name = "environment:bike:stands";
    const tiers: readonly [number, number, number][] = [
      [44.5, 47.6, 0.42],
      [47.8, 51.2, 0.92],
      [50.8, 54.1, 1.62],
      [53.7, 57.2, 2.46],
      [56.8, 60.2, 3.35],
    ];
    for (const [ti, [innerR, outerR, y]] of tiers.entries()) {
      // Full-circle seating so the velodrome reads as an enclosed bowl.
      const sector: EnvironmentSector = { start: 0, span: FULL_CIRCLE, weight: 1 };
      stands.add(
        this.makeHorizontalArc(
          `environment:bike:stands-tier-${ti + 1}`,
          innerR,
          outerR,
          y,
          sector,
          ti % 2 === 0 ? tierMat : accentMat,
        ),
      );
    }
    group.add(stands);
  }

  /** Continuous arena wall behind the seating bowl. */
  private addBikeArenaWall(group: THREE.Group): void {
    const wallMat = this.ctx.environmentStandardMat(
      "environment:bike:arena-wall-material",
      this.ctx.environment.venueStructure,
      { roughness: 0.88, metalness: 0.08, side: THREE.BackSide, fog: true },
    );
    this.applyEnvironmentSurfaceMaps(
      wallMat,
      "/replay-assets/environments/concrete-floor-painted/concrete-floor-painted",
      [0.08, 0.35],
      0.12,
    );
    const wall = this.ctx.makeVerticalArc(
      "environment:bike:arena-wall",
      61.5,
      6.2,
      3.1,
      { start: 0, span: FULL_CIRCLE },
      wallMat,
    );
    group.add(wall);

    // Advertising ribbon band around the bowl.
    if (this.ctx.cfg.environmentDetail >= 1) {
      const bandMat = this.ctx.environmentBasicMat(
        "environment:bike:ad-band-material",
        themed(0x1a2434, 0x0c121c),
        { fog: true, side: THREE.BackSide },
      );
      group.add(
        this.ctx.makeVerticalArc(
          "environment:bike:ad-band",
          61.35,
          0.55,
          1.35,
          { start: 0, span: FULL_CIRCLE },
          bandMat,
        ),
      );
    }
  }

  /** Safety boards / kick plate around the track apron. */
  private addBikeTrackBoards(group: THREE.Group, outerR: number): void {
    const boardMat = this.ctx.environmentStandardMat(
      "environment:bike:track-board-material",
      themed(0xd8d2c6, 0x4a524c),
      { roughness: 0.7, metalness: 0.05 },
    );
    this.applyEnvironmentSurfaceMaps(
      boardMat,
      "/replay-assets/environments/brown-planks-03/brown-planks-03",
      [2.4, 0.4],
      0.25,
    );
    group.add(
      this.makeHorizontalArc(
        "environment:bike:track-boards-inner",
        outerR + 0.15,
        outerR + 0.55,
        0.22,
        { start: 0, span: FULL_CIRCLE },
        boardMat,
      ),
    );
    if (this.ctx.cfg.environmentDetail >= 2) {
      group.add(
        this.makeHorizontalArc(
          "environment:bike:track-boards-outer",
          43.6,
          44.2,
          0.35,
          { start: 0, span: FULL_CIRCLE },
          boardMat,
        ),
      );
    }
  }

  /** Rows of hangar lights under the roof for indoor arena scale. */
  private addBikeHangarLights(group: THREE.Group, outerR: number): void {
    if (this.ctx.cfg.environmentDetail < 1) return;
    const count = [0, 16, 28, 40][this.ctx.cfg.environmentDetail];
    const bodyMat = this.ctx.environmentStandardMat(
      "environment:bike:hangar-light-body",
      themed(0x2a3240, 0x141a24),
      { roughness: 0.45, metalness: 0.55 },
    );
    const glowMat = this.ctx.environmentBasicMat(
      "environment:bike:hangar-light-glow",
      themed(0xffe6b0, 0xffc878),
      { fog: true },
    );
    const lights = new THREE.Group();
    lights.name = "environment:bike:hangar-lights";
    const bodyGeo = this.ctx.track(roundedVenueBlockGeometry(1.8, 0.25, 0.55, 0.08));
    const glowGeo = this.ctx.track(new THREE.PlaneGeometry(1.5, 0.35));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * FULL_CIRCLE;
      const radius = outerR * 0.55 + (i % 3) * 6;
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.name = `environment:bike:hangar-light-${i + 1}`;
      body.position.set(Math.sin(angle) * radius, 9.8, Math.cos(angle) * radius);
      body.rotation.y = angle;
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(body.position);
      glow.position.y -= 0.18;
      glow.rotation.x = -Math.PI / 2;
      glow.rotation.z = angle;
      lights.add(body, glow);
    }
    group.add(lights);
  }

  /**
   * Radial ceiling beams spanning from the arena centre outward — the
   * distinctive roof structure that makes a velodrome read as a building.
   */
  private addBikeCeilingBeams(group: THREE.Group, outerR: number): void {
    if (this.ctx.cfg.environmentDetail < 1) return;
    const beamCount = [0, 16, 28, 40][this.ctx.cfg.environmentDetail];
    const beamMat = this.ctx.environmentBasicMat(
      "environment:bike:ceiling-beam-material",
      themed(0x3a4458, 0x1e2838),
      { side: THREE.DoubleSide, fog: true, transparent: true, opacity: 0.55 },
    );
    const beamGeo = this.ctx.track(new THREE.BoxGeometry(0.14, 0.1, outerR + 28));
    const beams = new THREE.Group();
    beams.name = "environment:bike:ceiling-beams";
    for (let i = 0; i < beamCount; i++) {
      const angle = (i / beamCount) * Math.PI * 2;
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.name = `environment:bike:ceiling-beam-${i + 1}`;
      beam.position.set(0, 11.5, 0);
      beam.rotation.set(0, angle, -0.12);
      beams.add(beam);
    }
    group.add(beams);

    if (this.ctx.cfg.environmentDetail >= 2) {
      for (const [name, radius, y] of [
        ["environment:bike:ceiling-ring-inner", outerR + 4, 11.35],
        ["environment:bike:ceiling-ring", outerR + 12, 11.15],
        ["environment:bike:ceiling-ring-outer", outerR + 20, 10.9],
      ] as const) {
        const ring = new THREE.Mesh(
          this.ctx.track(new THREE.TorusGeometry(radius, 0.07, 8, 56)),
          beamMat,
        );
        ring.name = name;
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        group.add(ring);
      }
    }
  }
}
