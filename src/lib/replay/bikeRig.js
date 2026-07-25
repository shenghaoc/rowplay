/**
 * Shared bike fit contract for the procedural renderer and generated
 * V3 equipment package. Local +Z is travel; +Y is up; lateral contacts use X.
 *
 * Clean diamond-frame proportions — two equal wheels, BB at axle height,
 * chain to rear cassette.  The chase camera carries the machine around the
 * race course as a progress metaphor; this is a compact stylised road-bike
 * silhouette, not a free-road-bicycle simulation.
 *
 * Contact rules (no mesh penetration):
 * - Mesh sit surface (ischial / posterior skin) rests **on** the saddle pad
 *   platforms. The hip bone is above the seat; it is not the sit surface.
 * - The pad is placed under the measured V4 sit surface. Raising only the hip
 *   re-opens 穿模 or breaks pedal reach; seating is a derived pair
 *   (pad top, sit offset), not a free aesthetic Y.
 * - Wheel tyres rest **on** the ground plane (axle Y == wheelRadius + tyreTube
 *   so the outer shell sits on y == 0 without clipping through).
 */
const SADDLE_Y = 1.23;
const SADDLE_PAD_HALF_HEIGHT = 0.02;
const SIT_NESTLE = 0.005;
/**
 * Lowest hips-weighted sit-bone skin relative to v4Hips (avatar-up, metres).
 * Sized to the worst crank phase (~0.5), not only the neutral pose, so the
 * posterior cannot dig through the pad mid-stroke.
 */
const SIT_SURFACE_FROM_HIP_Y = -0.2;

export const BIKE_RIG = Object.freeze({
  /** Wheel major radius (rim centreline). */
  wheelRadius: 0.45,
  /** Extra radial thickness of the tyre shell. */
  tyreTube: 0.06,
  /** Front wheel axle Z (forward). */
  frontAxleZ: 0.85,
  /** Rear wheel axle Z (aft). */
  rearAxleZ: -0.85,
  /** BB sits 5 cm below the axle line — classic road-bike geometry. */
  bottomBracket: Object.freeze([0, 0.46, -0.05]),
  /**
   * Seat-tube / seat-cluster top. Kept just under the saddle centre so the
   * post reads as supporting the pad rather than stabbing through it.
   */
  seatCluster: Object.freeze([0, 1.2, -0.4]),
  headBottom: Object.freeze([0, 1.06, 0.42]),
  headTop: Object.freeze([0, 1.31, 0.5]),
  /**
   * Saddle centre marker. Pad top = centre + {@link BIKE_RIG.saddlePadHalfHeight}.
   * Placed under the measured V4 sit surface at the contact hip height so the
   * posterior lands on the cushion instead of through a high lofted ridge.
   */
  saddle: Object.freeze([0, SADDLE_Y, -0.4]),
  /**
   * Thin performance pad half-height above the centre marker. Sit-bone
   * platforms land near this plane; the centre channel is lower.
   */
  saddlePadHalfHeight: SADDLE_PAD_HALF_HEIGHT,
  handlebar: Object.freeze({
    base: Object.freeze([0, 1.31, 0.35]),
    grip: Object.freeze({ y: 1.29, z: 0.39, halfSpan: 0.32 }),
  }),
  crank: Object.freeze({ lateral: 0.1, pedalRadius: 0.21 }),
  rider: Object.freeze({
    /**
     * Hip / pelvis target. Y is {@link bikeRiderHipY} so the measured V4
     * sit surface lands on the pad while legs still reach the pedals.
     */
    root: Object.freeze([
      0,
      bikeRiderHipYFromParts(SADDLE_Y, SADDLE_PAD_HALF_HEIGHT, SIT_NESTLE, SIT_SURFACE_FROM_HIP_Y),
      -0.38,
    ]),
    /** Compact residual nestle of the procedural pelvis into the seat shell. */
    pelvisOffset: Object.freeze([0, 0, -0.005]),
    /**
     * Measured posterior sit surface relative to v4Hips after the bike clip
     * is skinned (avatar-up metres). Empirically ~18.8 cm below the hip bone
     * for the lowest ischial skin over the pad footprint — far deeper than a
     * bone-only guess. The saddle is placed under this surface; do not "fix"
     * 穿模 by only editing hip Y.
     */
    sitSurfaceFromHip: Object.freeze([0, SIT_SURFACE_FROM_HIP_Y, -0.05]),
    /** Soft cushion nestle (metres). Positive sinks the sit surface into the pad. */
    sitNestle: SIT_NESTLE,
  }),
});

/** Axle height so the tyre outer shell rests on the ground plane (y == 0). */
export function bikeWheelAxleY(rig = BIKE_RIG) {
  return rig.wheelRadius + rig.tyreTube;
}

/** Authored sit-bone pad top Y in avatar-local space. */
export function bikeSaddleTopY(rig = BIKE_RIG) {
  return (rig.saddle[1] ?? 0) + (rig.saddlePadHalfHeight ?? 0);
}

/**
 * Hip Y that places `sitSurfaceFromHip` on the pad top (minus soft nestle).
 * Keep this as the single seating derivation so height tweaks cannot drift
 * the butt through the cushion again.
 */
export function bikeRiderHipY(rig = BIKE_RIG) {
  const sitY = rig.rider?.sitSurfaceFromHip?.[1] ?? SIT_SURFACE_FROM_HIP_Y;
  const nestle = rig.rider?.sitNestle ?? SIT_NESTLE;
  return bikeSaddleTopY(rig) - nestle - sitY;
}

/**
 * Same derivation as {@link bikeRiderHipY}, from loose parts. It exists because
 * the rider root is computed while `BIKE_RIG` is still being constructed and
 * cannot read itself back.
 *
 * @param {number} saddleY
 * @param {number} padHalfHeight
 * @param {number} nestle
 * @param {number} sitFromHipY
 * @returns {number}
 */
function bikeRiderHipYFromParts(saddleY, padHalfHeight, nestle, sitFromHipY) {
  return saddleY + padHalfHeight - nestle - sitFromHipY;
}
