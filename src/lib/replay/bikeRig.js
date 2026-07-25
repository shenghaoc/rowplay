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
 * Hip-to-pedal distance at the bottom of the stroke, as a fraction of the
 * two-bone chain. Kept under 1 so the knee retains visible flexion through
 * bottom dead centre — a locked leg is both wrong and an IK singularity.
 *
 * Only femur + tibia count. The contact solver drives the ankle straight onto
 * the pedal spindle, so the sole drop buys no extra reach; including it put the
 * pedal 3 mm beyond the leg and the foot came off the spindle at the bottom.
 */
const LEG_EXTENSION_AT_BDC = 0.95;
const LEG_REACH = (ATHLETE_THIGH + ATHLETE_SHIN) * LEG_EXTENSION_AT_BDC;

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
 * Saddle setback behind the bottom bracket. Every centimetre of setback is
 * borrowed from the vertical the same leg could otherwise reach down, so this
 * stays at the shallow end of a road fit.
 */
const SADDLE_SETBACK = 0.12;
const SADDLE_Z = BB_Z - SADDLE_SETBACK;

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
 * Lowest hips-weighted posterior skin relative to v4Hips, measured across the
 * whole crank cycle on the shipped GLB (worst phase ≈ -0.2016).
 *
 * Note this is the *standing* gluteal fold: the authored bike clip holds the
 * pelvis essentially still (hip Y moves 1.5 mm across the stroke), so there is
 * no seated pelvic rotation to measure. The saddle is therefore placed under a
 * real mesh surface rather than an idealised sit-bone height, which is honest
 * but does sit the saddle lower than a race fit would.
 */
const SIT_SURFACE_FROM_HIP_Y = -0.2;
/** Soft cushion nestle. Positive sinks the sit surface into the pad. */
const SIT_NESTLE = 0.005;
const SADDLE_PAD_HALF_HEIGHT = 0.022;

/** Vertical hip rise above the bottom-dead-centre pedal, from leg reach. */
const BDC_PEDAL_Y = BB_Y - CRANK_RADIUS;
const HIP_RISE = Math.sqrt(LEG_REACH * LEG_REACH - SADDLE_SETBACK * SADDLE_SETBACK);
const RIDER_HIP_Y = BDC_PEDAL_Y + HIP_RISE;
/** Pad top follows the hip, so the sit surface always lands on the cushion. */
const SADDLE_PAD_TOP_Y = RIDER_HIP_Y + SIT_NESTLE + SIT_SURFACE_FROM_HIP_Y;
const SADDLE_Y = SADDLE_PAD_TOP_Y - SADDLE_PAD_HALF_HEIGHT;

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
  /** Seat-tube top, just under the saddle so the post supports the pad. */
  seatCluster: Object.freeze([0, SADDLE_Y - 0.03, SADDLE_Z]),
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
  crank: Object.freeze({ lateral: 0.09, pedalRadius: CRANK_RADIUS }),
  rider: Object.freeze({
    /** Hip / pelvis target, derived from leg reach — see {@link bikeRiderHipY}. */
    root: Object.freeze([0, RIDER_HIP_Y, SADDLE_Z]),
    /** Compact residual nestle of the procedural pelvis into the seat shell. */
    pelvisOffset: Object.freeze([0, 0, -0.005]),
    /** Measured posterior sit surface relative to v4Hips (avatar-up metres). */
    sitSurfaceFromHip: Object.freeze([0, SIT_SURFACE_FROM_HIP_Y, -0.05]),
    /** Soft cushion nestle (metres). */
    sitNestle: SIT_NESTLE,
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
 * Hip Y that places `sitSurfaceFromHip` on the pad top (minus soft nestle).
 * Keep this as the single seating derivation so height tweaks cannot drift
 * the rider through the cushion again.
 */
export function bikeRiderHipY(rig = BIKE_RIG) {
  const sitY = rig.rider?.sitSurfaceFromHip?.[1] ?? SIT_SURFACE_FROM_HIP_Y;
  const nestle = rig.rider?.sitNestle ?? SIT_NESTLE;
  return bikeSaddleTopY(rig) - nestle - sitY;
}
