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
 * - Mesh sit surface rests **on** the saddle top (hip is above the seat; the
 *   hip bone is not the sit surface).
 * - Wheel tyres rest **on** the ground plane (axle Y == wheelRadius + tyreTube
 *   so the outer shell sits on y == 0 without clipping through).
 */
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
  seatCluster: Object.freeze([0, 1.27, -0.4]),
  headBottom: Object.freeze([0, 1.06, 0.42]),
  headTop: Object.freeze([0, 1.31, 0.5]),
  /** Saddle centre — matches the V3 performance-saddle loft position. */
  saddle: Object.freeze([0, 1.3, -0.4]),
  handlebar: Object.freeze({
    base: Object.freeze([0, 1.31, 0.35]),
    grip: Object.freeze({ y: 1.29, z: 0.39, halfSpan: 0.32 }),
  }),
  crank: Object.freeze({ lateral: 0.1, pedalRadius: 0.21 }),
  rider: Object.freeze({
    // Hip positioned so the measured V4 sit surface lands on the saddle pad.
    root: Object.freeze([0, 1.43, -0.38]),
    pelvisOffset: Object.freeze([0, 0.005, -0.005]),
    /** Measured posterior sit surface relative to v4Hips (metres). */
    sitSurfaceFromHip: Object.freeze([0, -0.065, -0.04]),
  }),
});

/** Axle height so the tyre outer shell rests on the ground plane (y == 0). */
export function bikeWheelAxleY(rig = BIKE_RIG) {
  return rig.wheelRadius + rig.tyreTube;
}
