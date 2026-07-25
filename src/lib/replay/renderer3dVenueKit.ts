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
