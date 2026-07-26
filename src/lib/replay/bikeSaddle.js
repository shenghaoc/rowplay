/**
 * Saddle shape contract, shared by the procedural renderer, the authored V3
 * equipment package, and the penetration guards. One table, three consumers —
 * so the cushion the tests trust is the cushion both renderers actually draw.
 *
 * Local frame: origin at `BIKE_RIG.saddle`, +Z forward (travel), +Y up. The
 * top surface at the widest station is the pad top, so
 * `y = BIKE_RIG.saddle[1] + BIKE_RIG.saddlePadHalfHeight - drop`.
 *
 * ## Why this shape
 *
 * The rider is a standing-derived mesh. Measured across the whole crank cycle
 * on the shipped GLB, their seat region is not a plane:
 *
 * - the **ischia** carry at |x| ∈ [0.050, 0.075], y ≈ -0.158 below `v4Hips`,
 *   over z ∈ [-0.135, -0.095] behind the pelvis root — a flat 40 mm plateau;
 * - the **gluteal cleft** between them rides ~12 mm *higher*;
 * - the **perineum** on the centreline hangs ~37 mm *lower* (-0.195), as soft
 *   tissue does on a body that is not actually sitting on anything;
 * - the **thighs** sweep down past -0.30 forward of the pelvis root.
 *
 * A flat pad under the ischia therefore drives straight through the perineum,
 * and a pad wide enough to look like a saddle gets swept by the thighs. Both
 * are answered the way real performance saddles answer them: a wide winged
 * rear with a **through cut-out** down the centreline, and a narrow nose that
 * drops away under the crotch — a Selle-SMP-style profile, which exists for
 * exactly this reason.
 *
 * The previous pad was a 0.27 m rounded block. At the shipped saddle height it
 * was already 19 mm inside the thighs at the crank extremes; the guard missed
 * it because it only ever sampled hips-weighted vertices.
 */

import { BIKE_RIG } from "./bikeRig.js";

/**
 * Stations along the saddle's own Z, nose-ward positive.
 *
 * - `halfWidth` — shell half-width.
 * - `dropOuter` — top surface below the pad top at the widest point.
 * - `dropChannel` — top surface below the pad top at the channel edge.
 * - `cutout` — half-width of the through cut-out; 0 where the shell is solid.
 *
 * Every value is the measured skin envelope minus clearance, not styling. The
 * `bikeSaddleClearsRider` guard in `bikeRig.test.ts` re-derives the check.
 */
export const BIKE_SADDLE_STATIONS = Object.freeze(
  [
    { z: -0.05, halfWidth: 0.03, dropOuter: 0.012, dropChannel: 0.012, cutout: 0 },
    { z: -0.03, halfWidth: 0.06, dropOuter: 0.002, dropChannel: 0.004, cutout: 0 },
    { z: -0.015, halfWidth: 0.073, dropOuter: 0.0, dropChannel: 0.004, cutout: 0.018 },
    { z: 0.0, halfWidth: 0.075, dropOuter: 0.0, dropChannel: 0.007, cutout: 0.024 },
    { z: 0.015, halfWidth: 0.068, dropOuter: 0.001, dropChannel: 0.014, cutout: 0.024 },
    { z: 0.028, halfWidth: 0.056, dropOuter: 0.002, dropChannel: 0.021, cutout: 0.024 },
    { z: 0.045, halfWidth: 0.046, dropOuter: 0.018, dropChannel: 0.021, cutout: 0.024 },
    { z: 0.06, halfWidth: 0.038, dropOuter: 0.02, dropChannel: 0.022, cutout: 0.024 },
    { z: 0.08, halfWidth: 0.032, dropOuter: 0.024, dropChannel: 0.026, cutout: 0.024 },
    { z: 0.1, halfWidth: 0.027, dropOuter: 0.028, dropChannel: 0.029, cutout: 0.022 },
    { z: 0.115, halfWidth: 0.024, dropOuter: 0.04, dropChannel: 0.041, cutout: 0.014 },
    { z: 0.13, halfWidth: 0.022, dropOuter: 0.046, dropChannel: 0.046, cutout: 0 },
    { z: 0.15, halfWidth: 0.02, dropOuter: 0.053, dropChannel: 0.053, cutout: 0 },
    { z: 0.17, halfWidth: 0.017, dropOuter: 0.062, dropChannel: 0.062, cutout: 0 },
  ].map((station) => Object.freeze(station)),
);

/**
 * How sharply the shell climbs from the channel to the wing. Low exponent =
 * pronounced wings, which is what holds the ischia up while the cleft between
 * them clears. A linear blend leaves the surface ~2 mm inside the gluteal
 * curve just ahead of the plateau.
 */
const CHANNEL_FALLOFF = 0.22;

/** Shell thickness below the top surface. */
export const BIKE_SADDLE_SHELL_THICKNESS = 0.016;

export const BIKE_SADDLE_REAR_Z = BIKE_SADDLE_STATIONS[0].z;
export const BIKE_SADDLE_NOSE_Z = BIKE_SADDLE_STATIONS[BIKE_SADDLE_STATIONS.length - 1].z;
export const BIKE_SADDLE_LENGTH = BIKE_SADDLE_NOSE_Z - BIKE_SADDLE_REAR_Z;
export const BIKE_SADDLE_MAX_HALF_WIDTH = BIKE_SADDLE_STATIONS.reduce(
  (max, station) => Math.max(max, station.halfWidth),
  0,
);

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Station values interpolated at an arbitrary local Z, or null beyond the
 * saddle's own ends.
 *
 * @param {number} z
 * @returns {{halfWidth: number, dropOuter: number, dropChannel: number, cutout: number} | null}
 */
export function bikeSaddleStationAt(z) {
  const stations = BIKE_SADDLE_STATIONS;
  if (z < stations[0].z || z > stations[stations.length - 1].z) return null;
  for (let i = 1; i < stations.length; i++) {
    const b = stations[i];
    if (z > b.z) continue;
    const a = stations[i - 1];
    const span = b.z - a.z;
    const t = span <= 0 ? 0 : (z - a.z) / span;
    return {
      halfWidth: lerp(a.halfWidth, b.halfWidth, t),
      dropOuter: lerp(a.dropOuter, b.dropOuter, t),
      dropChannel: lerp(a.dropChannel, b.dropChannel, t),
      cutout: lerp(a.cutout, b.cutout, t),
    };
  }
  return null;
}

/**
 * Top surface of the saddle at a local (x, z), as a drop below the pad top —
 * or null where there is no material: outside the shell, or inside the
 * cut-out. This is the single definition of "is the saddle here"; the
 * penetration guard and both mesh builders all read it.
 *
 * @param {number} x
 * @param {number} z
 * @returns {number | null}
 */
export function bikeSaddleDropAt(x, z) {
  const station = bikeSaddleStationAt(z);
  if (!station) return null;
  const ax = Math.abs(x);
  if (ax > station.halfWidth) return null;
  if (ax < station.cutout) return null;
  const inner = Math.max(station.cutout, 0);
  const span = station.halfWidth - inner;
  const t = span <= 1e-6 ? 1 : Math.min(1, Math.max(0, (ax - inner) / span));
  return station.dropOuter + (station.dropChannel - station.dropOuter) * (1 - t) ** CHANNEL_FALLOFF;
}

/**
 * Build the saddle shell as a closed top/bottom surface pair with a rim, in
 * the saddle's local frame. `THREE` is injected so this stays a plain contract
 * module usable from both the app and the Node asset builder.
 *
 * @param {typeof import("three")} THREE
 * @param {{lateralSegments?: number, stationsPerSpan?: number, topY?: number}} [options]
 * @returns {import("three").BufferGeometry}
 */
export function buildBikeSaddleGeometry(
  THREE,
  { lateralSegments = 10, stationsPerSpan = 3, topY = BIKE_RIG.saddlePadHalfHeight } = {},
) {
  const stations = BIKE_SADDLE_STATIONS;
  /** @type {number[]} */
  const zs = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i].z;
    const b = stations[i + 1].z;
    for (let s = 0; s < stationsPerSpan; s++) zs.push(a + ((b - a) * s) / stationsPerSpan);
  }
  zs.push(stations[stations.length - 1].z);

  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const indices = [];
  /**
   * Ring of vertices for one side of one station, or null if no material.
   *
   * @param {number} z
   * @param {number} side
   */
  const ringFor = (z, side) => {
    const station = bikeSaddleStationAt(z);
    if (!station) return null;
    const inner = station.cutout;
    const outer = station.halfWidth;
    if (outer - inner < 1e-4) return null;
    /** @type {Array<{x: number, top: number, bottom: number}>} */
    const ring = [];
    for (let i = 0; i <= lateralSegments; i++) {
      const ax = inner + ((outer - inner) * i) / lateralSegments;
      const drop = bikeSaddleDropAt(Math.max(ax, inner + 1e-6), z) ?? station.dropOuter;
      ring.push({
        x: side * ax,
        top: topY - drop,
        bottom: topY - drop - BIKE_SADDLE_SHELL_THICKNESS,
      });
    }
    return ring;
  };

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  const pushVertex = (x, y, z) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };

  for (const side of [-1, 1]) {
    /** @type {Array<{top: number[]; bottom: number[]} | null>} */
    const rings = [];
    for (const z of zs) {
      const ring = ringFor(z, side);
      if (!ring) {
        rings.push(null);
        continue;
      }
      const top = ring.map((p) => pushVertex(p.x, p.top, z));
      const bottom = ring.map((p) => pushVertex(p.x, p.bottom, z));
      rings.push({ top, bottom });
    }
    /**
     * @param {number} a
     * @param {number} b
     * @param {number} c
     * @param {number} d
     */
    const quad = (a, b, c, d) => {
      indices.push(a, b, c, a, c, d);
    };
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      if (!a || !b) continue;
      for (let j = 0; j < lateralSegments; j++) {
        if (side > 0) {
          quad(a.top[j], b.top[j], b.top[j + 1], a.top[j + 1]);
          quad(a.bottom[j + 1], b.bottom[j + 1], b.bottom[j], a.bottom[j]);
        } else {
          quad(a.top[j + 1], b.top[j + 1], b.top[j], a.top[j]);
          quad(a.bottom[j], b.bottom[j], b.bottom[j + 1], a.bottom[j + 1]);
        }
      }
      // Inner (cut-out) and outer rims close the shell into a solid.
      if (side > 0) {
        quad(a.bottom[0], b.bottom[0], b.top[0], a.top[0]);
        quad(
          a.top[lateralSegments],
          b.top[lateralSegments],
          b.bottom[lateralSegments],
          a.bottom[lateralSegments],
        );
      } else {
        quad(a.top[0], b.top[0], b.bottom[0], a.bottom[0]);
        quad(
          a.bottom[lateralSegments],
          b.bottom[lateralSegments],
          b.top[lateralSegments],
          a.top[lateralSegments],
        );
      }
    }
    // Cap the ends so the shell reads as a solid pad from every angle.
    for (const index of [0, rings.length - 1]) {
      const ring = rings[index];
      if (!ring) continue;
      for (let j = 0; j < lateralSegments; j++) {
        if ((index === 0) === side > 0) {
          quad(ring.top[j], ring.top[j + 1], ring.bottom[j + 1], ring.bottom[j]);
        } else {
          quad(ring.bottom[j], ring.bottom[j + 1], ring.top[j + 1], ring.top[j]);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
