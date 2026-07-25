/**
 * Shared bike fit contract for the procedural renderer and the generated V3
 * equipment package. Local +Z is travel; +Y is up; lateral contacts use X.
 * All values are metres, in the same metric space as the V4 athlete — that
 * athlete is 1.83 m tall, so the bicycle has to be a real bicycle.
 *
 * This is authored the way a bike is actually fitted: the frame comes from
 * real road geometry, and the rider's hip is then *derived* from their own
 * leg length against the bottom bracket. It used to work the other way round
 * — the bike was inflated to roughly 1.5x (1.02 m wheels, a 1.70 m wheelbase)
 * to reach a rider whose procedural legs had themselves been stretched to
 * 0.63 m. That is what produced the 0.70 m chopper fork: with wheels that
 * large, the front wheel had to be thrown far forward or the pedals struck it,
 * and the fork then had to stretch out at 52° to meet it.
 *
 * Contact rules (no mesh penetration):
 * - The mesh sit surface rests **on** the saddle pad. The hip bone is above
 *   the seat; it is not the sit surface.
 * - Seating is a derived pair (pad top, sit offset), never a free aesthetic Y.
 * - Wheel tyres rest **on** the ground plane (axle Y == wheelRadius + tyreTube).
 */

// ---------------------------------------------------------------------------
// Rider, measured from V4_BONE_DEFINITIONS in rigV4.ts.
// ---------------------------------------------------------------------------

/** Femur length: v4LeftLowerLeg offset from v4LeftUpperLeg. */
const ATHLETE_THIGH = 0.4915;
/** Tibia length: v4LeftFoot offset from v4LeftLowerLeg. */
const ATHLETE_SHIN = 0.4794;
/** Ankle-to-sole drop, from V4_CONTACT_OFFSETS.v4LeftFoot. */
const ATHLETE_SOLE_DROP = 0.055;
/**
 * `v4Hips` is the pelvis root, and it is *not* the hip joint: the femur starts
 * at `v4LeftUpperLeg`, 25 mm below it. Treating the two as the same point cost
 * the fit 25 mm of leg — the rider was solved as though the femur began at the
 * pelvis root, so the real chain fell short and the saddle came down with it.
 */
const HIP_ROOT_TO_FEMORAL_HEAD = 0.025;
/**
 * Knee flexion at bottom dead centre. This — not a reach fraction — is the
 * number bike fitters actually set a saddle by: the Holmes road-fit window is
 * 25–35°, and 30° is the middle of it.
 *
 * It replaces an opaque `LEG_EXTENSION_AT_BDC = 0.95`, which combined with the
 * femoral-head error above produced **44.8°** — a cruiser squat, not a road
 * position, and the single biggest reason the rider looked wrong on the bike.
 *
 * Only femur + tibia count. The contact solver drives the ankle straight onto
 * the pedal spindle, so the sole drop buys no extra reach; including it put the
 * pedal 3 mm beyond the leg and the foot came off the spindle at the bottom.
 */
const KNEE_FLEXION_AT_BDC = (30 * Math.PI) / 180;
/** Femoral-head-to-pedal distance at BDC, by the law of cosines. */
const LEG_REACH = Math.sqrt(
  ATHLETE_THIGH * ATHLETE_THIGH +
    ATHLETE_SHIN * ATHLETE_SHIN -
    2 * ATHLETE_THIGH * ATHLETE_SHIN * Math.cos(Math.PI - KNEE_FLEXION_AT_BDC),
);

// ---------------------------------------------------------------------------
// Frame, from real road geometry (≈56 cm frame, 700×25c).
// ---------------------------------------------------------------------------

const WHEEL_RADIUS = 0.31;
const TYRE_TUBE = 0.025;
/** Outer tyre radius; also the axle height, so the tread rests on y == 0. */
const AXLE_Y = WHEEL_RADIUS + TYRE_TUBE;
/** The bottom bracket hangs below the axle line on every road bike. */
const BB_DROP = 0.07;
const BB_Y = AXLE_Y - BB_DROP;
const BB_Z = -0.05;
/** Crank arm length for a rider this size. */
const CRANK_RADIUS = 0.1725;
/**
 * Femoral-head setback behind the bottom bracket. Every centimetre of setback
 * is borrowed from the vertical the same leg could otherwise reach down, so
 * this stays at the shallow end of a road fit.
 */
const PELVIS_SETBACK = 0.12;
const PELVIS_Z = BB_Z - PELVIS_SETBACK;

/** Head tube angle, from horizontal. */
const HEAD_ANGLE = (73 * Math.PI) / 180;
const HEAD_TUBE_LENGTH = 0.155;
/** Frame stack and reach, measured from the bottom bracket. */
const STACK = 0.575;
const REACH = 0.385;
const HEAD_TOP_Y = BB_Y + STACK;
const HEAD_TOP_Z = BB_Z + REACH;
/**
 * A steerer leans *back* as it rises, so the head tube top is rearward of its
 * bottom. This used to be inverted, which tilted the whole front end forward
 * like a chopper before the fork even began.
 */
const HEAD_BOTTOM_Y = HEAD_TOP_Y - HEAD_TUBE_LENGTH;
const HEAD_BOTTOM_Z = HEAD_TOP_Z + HEAD_TUBE_LENGTH / Math.tan(HEAD_ANGLE);

/** Fork offset ahead of the steering axis. */
const FORK_RAKE = 0.05;
const FRONT_AXLE_Z = HEAD_TOP_Z + (HEAD_TOP_Y - AXLE_Y) / Math.tan(HEAD_ANGLE) + FORK_RAKE;
const CHAINSTAY = 0.41;
const REAR_AXLE_Z = BB_Z - CHAINSTAY;

// ---------------------------------------------------------------------------
// Seating, derived from the rider against the frame.
// ---------------------------------------------------------------------------

/**
 * Ischial (sit-bone) surface relative to `v4Hips`, measured on the shipped GLB
 * across the whole crank cycle. This is the surface a saddle actually carries:
 * skin at |x| ∈ [0.050, 0.075] — a 100–150 mm sit-bone spread, which matches
 * the 110–130 mm of a real pelvis — over z ∈ [-0.135, -0.095] behind the
 * pelvis root. Worst phase −0.1557; the plateau is flat to about 3 mm.
 *
 * It replaces a −0.2016 that was measured as "lowest hips-weighted posterior
 * skin" with no lateral gate, and so found the **perineum** on the centreline
 * (|x| ≤ 0.02, y −0.1936) instead of the sit bones. Placing a saddle under
 * that put the whole bike 3.7 cm low and made the fit unfixable from the
 * mesh side, because no amount of pelvis lift moves a surface you are
 * measuring in the wrong place.
 */
const SIT_SURFACE_FROM_HIP_Y = -0.158;
/**
 * Perineal soft tissue on the centreline, same measurement. It hangs below the
 * ischia — as it does on a standing body — so a flat pad under the sit bones
 * would pass straight through it. The saddle answers this the way real
 * performance saddles do, with a cut-out; {@link BIKE_SADDLE} owns the shape
 * and `bikeRig.test.ts` proves the relief clears this number.
 */
const PERINEUM_FROM_HIP_Y = -0.1952;
/** Soft cushion nestle. Positive sinks the sit surface into the pad. */
const SIT_NESTLE = 0.005;
const SADDLE_PAD_HALF_HEIGHT = 0.022;
/** Sit-bone contact behind the pelvis root, from the same measurement. */
const SIT_CONTACT_Z_FROM_HIP = -0.115;

/**
 * Vertical femoral-head rise above the bottom-dead-centre pedal, from leg
 * reach; the pelvis root then sits {@link HIP_ROOT_TO_FEMORAL_HEAD} above it.
 */
const BDC_PEDAL_Y = BB_Y - CRANK_RADIUS;
const FEMORAL_HEAD_RISE = Math.sqrt(LEG_REACH * LEG_REACH - PELVIS_SETBACK * PELVIS_SETBACK);
const RIDER_HIP_Y = BDC_PEDAL_Y + FEMORAL_HEAD_RISE + HIP_ROOT_TO_FEMORAL_HEAD;
/** Pad top follows the hip, so the sit surface always lands on the cushion. */
const SADDLE_PAD_TOP_Y = RIDER_HIP_Y + SIT_NESTLE + SIT_SURFACE_FROM_HIP_Y;
const SADDLE_Y = SADDLE_PAD_TOP_Y - SADDLE_PAD_HALF_HEIGHT;
/** Saddle origin sits under the sit bones, not under the pelvis root. */
const SADDLE_Z = PELVIS_Z + SIT_CONTACT_Z_FROM_HIP;
/** Rail clamp, near the saddle's mid-length and so ahead of the sit bones. */
const SADDLE_CLAMP_Z = 0.05;

export const BIKE_RIG = Object.freeze({
  /** Wheel major radius (rim centreline). */
  wheelRadius: WHEEL_RADIUS,
  /** Extra radial thickness of the tyre shell. */
  tyreTube: TYRE_TUBE,
  /** Front wheel axle Z (forward). */
  frontAxleZ: FRONT_AXLE_Z,
  /** Rear wheel axle Z (aft). */
  rearAxleZ: REAR_AXLE_Z,
  bottomBracket: Object.freeze([0, BB_Y, BB_Z]),
  /**
   * Seat-tube top, just under the saddle so the post supports the pad. The
   * post meets the rails near the saddle's mid-length, which is ahead of the
   * sit-bone origin the saddle is now placed by.
   */
  seatCluster: Object.freeze([0, SADDLE_Y - 0.03, SADDLE_Z + SADDLE_CLAMP_Z]),
  headBottom: Object.freeze([0, HEAD_BOTTOM_Y, HEAD_BOTTOM_Z]),
  headTop: Object.freeze([0, HEAD_TOP_Y, HEAD_TOP_Z]),
  /** Saddle centre. Pad top = centre + {@link BIKE_RIG.saddlePadHalfHeight}. */
  saddle: Object.freeze([0, SADDLE_Y, SADDLE_Z]),
  /** Thin performance pad half-height above the centre marker. */
  saddlePadHalfHeight: SADDLE_PAD_HALF_HEIGHT,
  handlebar: Object.freeze({
    /** Stem clamp / bar centre, ahead of and just above the head tube top. */
    base: Object.freeze([0, HEAD_TOP_Y + 0.015, HEAD_TOP_Z + 0.09]),
    /** Brake hoods — where the palms actually close. 40 cm bar. */
    grip: Object.freeze({ y: HEAD_TOP_Y, z: HEAD_TOP_Z + 0.175, halfSpan: 0.2 }),
  }),
  /** Saddle rail clamp offset ahead of the sit-bone origin. */
  saddleClampZ: SADDLE_CLAMP_Z,
  crank: Object.freeze({ lateral: 0.09, pedalRadius: CRANK_RADIUS }),
  rider: Object.freeze({
    /** Hip / pelvis target, derived from leg reach — see {@link bikeRiderHipY}. */
    root: Object.freeze([0, RIDER_HIP_Y, PELVIS_Z]),
    /** Compact residual nestle of the procedural pelvis into the seat shell. */
    pelvisOffset: Object.freeze([0, 0, -0.005]),
    /** Measured ischial sit surface relative to v4Hips (avatar-up metres). */
    sitSurfaceFromHip: Object.freeze([0, SIT_SURFACE_FROM_HIP_Y, SIT_CONTACT_Z_FROM_HIP]),
    /** Measured perineal centreline, which the saddle cut-out must clear. */
    perineumFromHipY: PERINEUM_FROM_HIP_Y,
    /** Soft cushion nestle (metres). */
    sitNestle: SIT_NESTLE,
    /** Knee flexion at the crank extremes — the road-fit criterion. */
    kneeFlexionAtBdc: KNEE_FLEXION_AT_BDC,
  }),
  /** Rider limb lengths, so procedural legs cannot drift from the V4 rig. */
  athlete: Object.freeze({
    thigh: ATHLETE_THIGH,
    shin: ATHLETE_SHIN,
    soleDrop: ATHLETE_SOLE_DROP,
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
 * Knee flexion (radians away from a straight leg) with the crank at `angle`,
 * measured 0 at top dead centre and increasing forward. This is the fit
 * criterion the saddle height is solved against, so tests can check the whole
 * cycle rather than trusting the one derivation at bottom dead centre.
 *
 * @param {number} angle
 * @param {typeof BIKE_RIG} [rig]
 * @returns {number}
 */
export function bikeKneeFlexion(angle, rig = BIKE_RIG) {
  const bb = rig.bottomBracket;
  const crank = rig.crank.pedalRadius;
  const pedalY = (bb[1] ?? 0) + crank * Math.cos(angle);
  const pedalZ = (bb[2] ?? 0) + crank * Math.sin(angle);
  const hipY = (rig.rider.root[1] ?? 0) - HIP_ROOT_TO_FEMORAL_HEAD;
  const hipZ = rig.rider.root[2] ?? 0;
  const reach = Math.hypot(hipY - pedalY, hipZ - pedalZ);
  const thigh = rig.athlete.thigh;
  const shin = rig.athlete.shin;
  const cosKnee = (thigh * thigh + shin * shin - reach * reach) / (2 * thigh * shin);
  return Math.PI - Math.acos(Math.min(1, Math.max(-1, cosKnee)));
}

/**
 * Hip Y that places `sitSurfaceFromHip` on the pad top (minus soft nestle).
 * Keep this as the single seating derivation so height tweaks cannot drift
 * the rider through the cushion again.
 */
export function bikeRiderHipY(rig = BIKE_RIG) {
  const sitY = rig.rider?.sitSurfaceFromHip?.[1] ?? SIT_SURFACE_FROM_HIP_Y;
  const nestle = rig.rider?.sitNestle ?? SIT_NESTLE;
  return bikeSaddleTopY(rig) - nestle - sitY;
}
