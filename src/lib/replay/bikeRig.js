/**
 * Shared BikeErg-form fit contract for the procedural renderer and generated
 * V3 equipment package. Local +Z is travel; +Y is up; lateral contacts use X.
 *
 * This is a stylised **stationary indoor erg** (Concept2 BikeErg-like), not a
 * free road bicycle. The chase camera still carries the machine around the
 * race course as a progress metaphor; the equipment silhouette is an indoor
 * bike with a front flywheel cage, fixed base, seat rail, and cockpit.
 *
 * Athlete interaction is hip-joint based: the production V4 mesh's posterior
 * sit surface sits below/aft of `v4Hips` (`sitSurfaceFromHip`). The saddle is
 * placed under that sit surface so the rider reads as seated. Palm targets are
 * the hood/grip contacts; feet lock to the crank pedals.
 */
export const BIKE_RIG = Object.freeze({
  /** Front flywheel radius (also drives the rotating "wheel" visual group). */
  wheelRadius: 0.36,
  /** Front flywheel axle Z (forward). */
  frontAxleZ: 0.58,
  /** Rear base-foot visual Z (aft stabilizer; not a free road wheel). */
  rearAxleZ: -0.62,
  bottomBracket: Object.freeze([0, 0.34, 0.02]),
  seatCluster: Object.freeze([0, 1.05, -0.4]),
  /** Stem / mast base under the cockpit. */
  headBottom: Object.freeze([0, 0.72, 0.2]),
  headTop: Object.freeze([0, 1.12, 0.16]),
  saddle: Object.freeze([0, 1.06, -0.4]),
  handlebar: Object.freeze({
    base: Object.freeze([0, 1.1, 0.14]),
    grip: Object.freeze({ y: 1.08, z: 0.2, halfSpan: 0.24 }),
  }),
  crank: Object.freeze({ lateral: 0.1, pedalRadius: 0.175 }),
  rider: Object.freeze({
    // Hip above the saddle so mesh sit surface lands on the seat, while
    // thigh+shin still reach bottom dead centre without residual IK gap.
    root: Object.freeze([0, 1.12, -0.38]),
    pelvisOffset: Object.freeze([0, 0.005, -0.005]),
    /**
     * Approximate posterior sit surface relative to the hip joint after the
     * bike clip (metres). Saddle ≈ hip + sitSurfaceFromHip.
     */
    sitSurfaceFromHip: Object.freeze([0, -0.065, -0.04]),
  }),
  /** Front/rear floor feet for the fixed base. */
  base: Object.freeze({
    frontFootZ: 0.78,
    rearFootZ: -0.72,
    halfWidth: 0.28,
    railY: 0.06,
  }),
});
