/**
 * One BikeErg fit contract shared by the procedural renderer and the generated
 * V3 equipment package. Local +Z is travel; +Y is up; lateral contacts use X.
 *
 * The values are a stylised indoor-racing-bike proportion baseline, not a
 * claim about a particular athlete's fit. Keeping the machine anchors here
 * prevents the fallback and authored equipment from drifting apart again.
 */
export const BIKE_RIG = Object.freeze({
  wheelRadius: 0.45,
  rearAxleZ: -0.76,
  frontAxleZ: 0.76,
  bottomBracket: Object.freeze([0, 0.45, -0.05]),
  seatCluster: Object.freeze([0, 1.21, -0.33]),
  headBottom: Object.freeze([0, 1.0, 0.34]),
  headTop: Object.freeze([0, 1.25, 0.41]),
  saddle: Object.freeze([0, 1.22, -0.33]),
  handlebar: Object.freeze({
    base: Object.freeze([0, 1.23, 0.29]),
    grip: Object.freeze({ y: 1.21, z: 0.33, halfSpan: 0.3 }),
  }),
  crank: Object.freeze({ lateral: 0.1, pedalRadius: 0.21 }),
  rider: Object.freeze({
    root: Object.freeze([0, 1.22, -0.31]),
    pelvisOffset: Object.freeze([0, 0.005, -0.005]),
  }),
});
