/**
 * Shared BikeErg-form fit contract for the procedural renderer and generated
 * V3 equipment package. Local +Z is travel; +Y is up; lateral contacts use X.
 *
 * Stationary indoor erg (Concept2 BikeErg-like), not a free road bicycle.
 *
 * Contact rules (no mesh penetration):
 * - Mesh sit surface rests **on** the saddle top (hip is above the seat; the
 *   hip bone is not the sit surface).
 * - Wheel/flywheel tyres rest **on** the ground plane (axle height accounts for
 *   tyre tube thickness so the outer shell does not clip through y = 0).
 */
export const BIKE_RIG = Object.freeze({
  /** Front flywheel major radius (rim centreline). */
  wheelRadius: 0.36,
  /**
   * Extra radial thickness of the tyre/fan shell beyond `wheelRadius`.
   * Axle Y must be `wheelRadius + tyreTube` so the outer shell sits on y = 0.
   */
  tyreTube: 0.055,
  /** Front flywheel axle Z (forward). */
  frontAxleZ: 0.58,
  /** Rear base-foot visual Z (aft stabilizer). */
  rearAxleZ: -0.62,
  bottomBracket: Object.freeze([0, 0.34, 0.02]),
  // Seat under the measured V4 sit surface (hip stays high enough for BDC
  // pedal reach; the saddle is lowered so the butt rests on the pad top).
  seatCluster: Object.freeze([0, 0.86, -0.4]),
  headBottom: Object.freeze([0, 0.72, 0.2]),
  headTop: Object.freeze([0, 1.12, 0.16]),
  /**
   * Saddle centre. Authored pad top is ~7 cm above centre; with hip at
   * `rider.root` the measured sit surface lands on that top (no 穿模).
   */
  saddle: Object.freeze([0, 0.86, -0.4]),
  handlebar: Object.freeze({
    base: Object.freeze([0, 1.1, 0.14]),
    grip: Object.freeze({ y: 1.08, z: 0.2, halfSpan: 0.24 }),
  }),
  crank: Object.freeze({ lateral: 0.1, pedalRadius: 0.175 }),
  rider: Object.freeze({
    // Hip for full pedal reach; sit = hip + sitSurfaceFromHip ≈ saddle top.
    root: Object.freeze([0, 1.12, -0.38]),
    pelvisOffset: Object.freeze([0, 0.005, -0.005]),
    /**
     * Measured posterior sit surface relative to v4Hips after bike clip +
     * contact solve (metres).
     */
    sitSurfaceFromHip: Object.freeze([0, -0.164, -0.04]),
  }),
  base: Object.freeze({
    frontFootZ: 0.78,
    rearFootZ: -0.72,
    halfWidth: 0.28,
    /** Top of longitudinal base rail; feet rest on the ground (y ≈ 0). */
    railY: 0.06,
  }),
});

/** Axle height so the tyre outer shell rests on the ground plane (y = 0). */
export function bikeWheelAxleY(rig = BIKE_RIG) {
  return rig.wheelRadius + rig.tyreTube;
}
