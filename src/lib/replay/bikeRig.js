/**
 * One BikeErg fit contract shared by the procedural renderer and the generated
 * V3 equipment package. Local +Z is travel; +Y is up; lateral contacts use X.
 *
 * The values are a stylised indoor-racing-bike proportion baseline, not a
 * claim about a particular athlete's fit. Keeping the machine anchors here
 * prevents the fallback and authored equipment from drifting apart again.
 *
 * Rider placement is hip-joint based. The production V4 mesh's posterior sit
 * surface sits below/aft of `v4Hips` (`sitSurfaceFromHip`). The saddle is
 * therefore placed under that sit surface, not under the hip bone: aligning
 * the hip bone to a high saddle marker sinks the buttocks under the authored
 * seat and makes the saddle look empty from the chase camera even though
 * bone-to-marker tests still pass.
 */
export const BIKE_RIG = Object.freeze({
  wheelRadius: 0.45,
  rearAxleZ: -0.76,
  frontAxleZ: 0.76,
  bottomBracket: Object.freeze([0, 0.45, -0.05]),
  // Seat cluster / saddle sit under the mesh sit surface (hip + sitSurfaceFromHip),
  // not under the hip joint. Hip stays high enough for full pedal reach.
  seatCluster: Object.freeze([0, 1.14, -0.33]),
  headBottom: Object.freeze([0, 1.0, 0.34]),
  headTop: Object.freeze([0, 1.25, 0.41]),
  saddle: Object.freeze([0, 1.15, -0.33]),
  handlebar: Object.freeze({
    base: Object.freeze([0, 1.23, 0.29]),
    grip: Object.freeze({ y: 1.21, z: 0.33, halfSpan: 0.3 }),
  }),
  crank: Object.freeze({ lateral: 0.1, pedalRadius: 0.21 }),
  rider: Object.freeze({
    // Hip joint above the saddle so the mesh sit surface lands on the seat
    // while thigh+shin still reach bottom dead centre.
    root: Object.freeze([0, 1.22, -0.29]),
    pelvisOffset: Object.freeze([0, 0.005, -0.005]),
    /**
     * Approximate posterior sit surface relative to the hip joint after the
     * bike clip (metres, rider-local). Saddle ≈ hip + sitSurfaceFromHip.
     */
    sitSurfaceFromHip: Object.freeze([0, -0.075, -0.04]),
  }),
});
