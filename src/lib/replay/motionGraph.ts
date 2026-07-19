import type { Sport } from "../types";
import type { StrokePose } from "./strokeModel";

/** One full turn in radians. Kept local so this module stays dependency-free. */
const TAU = Math.PI * 2;

/**
 * A scalar choreography channel sampled at one instant in a replay cycle.
 *
 * `value` is coordinate-neutral. Most body/contact channels use the 0..1
 * interval documented beside their owner; small expressive channels may use a
 * signed range. `velocity` and `acceleration` are derivatives in those same
 * units per second and per second squared. Renderers can use them to orient
 * an authored limb, lead a camera, or decide whether a contact should remain
 * locked without re-differentiating frame samples.
 */
export interface MotionChannel {
  readonly value: number;
  readonly velocity: number;
  readonly acceleration: number;
}

/**
 * Circular state for a crank or other object that must cross 0 / 2π without
 * a scalar-angle discontinuity. `sin` and `cos` are deliberately exposed so
 * renderers can build pedal positions directly at the wrap boundary.
 */
export interface CircularMotion {
  /** Canonical angle in [0, 2π). Positive direction is renderer-defined. */
  readonly angle: number;
  readonly sin: number;
  readonly cos: number;
  /** Radians per second. */
  readonly angularVelocity: number;
  /** Radians per second squared; zero for one constant-cadence pose. */
  readonly angularAcceleration: number;
}

/**
 * Cycle timing reconstructed from a `StrokePose`.
 *
 * The graph intentionally treats each input pose as a constant-cadence sample:
 * a recorded stroke supplies a duration but not a force curve. That keeps the
 * result deterministic while every body and contact transition carries its
 * own C2-continuous envelope.
 */
export interface MotionTiming {
  /** Integer cycle that contains this pose; useful for deterministic contact keys. */
  readonly cycleIndex: number;
  /** Normalized phase in [0, 1), with the catch / pedal reference at 0. */
  readonly cycle: number;
  /** Canonical phase in [0, 2π). Prefer this over a wrapped source phase for angles. */
  readonly phase: number;
  /** Positive, finite cadence-derived duration of one full cycle in seconds. */
  readonly secondsPerCycle: number;
  /** Canonical phase speed in radians per second. */
  readonly phaseVelocity: number;
  /** Canonical phase acceleration in radians per second squared (always zero here). */
  readonly phaseAcceleration: number;
  /** Sanitized share of a row/ski cycle devoted to the drive. */
  readonly driveFraction: number;
  /** 0..1 during drive, then 1 through recovery. */
  readonly driveProgress: number;
  /** 0 through drive, then 0..1 through recovery. */
  readonly recoveryProgress: number;
}

/**
 * Rower choreography. Primary body channels travel 0 at the catch to 1 at
 * the finish, then return in the classic hands → body → slide order.
 */
export interface RowerMotionGraph {
  readonly sport: "rower";
  readonly timing: MotionTiming;
  readonly body: {
    /** 0 = seat at the catch, 1 = fully driven back. */
    readonly seatTravel: MotionChannel;
    /** Pelvis/root translation, intentionally equal to seat travel for constraint rigs. */
    readonly pelvisTravel: MotionChannel;
    /** Same authored range as seat travel, exposed for rig naming clarity. */
    readonly legExtension: MotionChannel;
    /** 0 = body over at the catch, 1 = open at the finish. */
    readonly torsoSwing: MotionChannel;
    /** Spine hinge cue, equal to torso swing so a torso chain can share one truth source. */
    readonly spineHinge: MotionChannel;
    /** Inverse of torso swing: 1 at the forward reach, 0 at finish. */
    readonly torsoReach: MotionChannel;
    /** 0 = long arms, 1 = handle drawn to the body. */
    readonly armDraw: MotionChannel;
    /** 0..1 shoulder follow-through, lagging legs and leading the final arm draw. */
    readonly shoulderSet: MotionChannel;
    /** Coordinated catch-to-finish handle path for 2D and 3D contact targets. */
    readonly handleTravel: MotionChannel;
    /** Small signed vertical cue (about -0.14..0.14), not a world-space height. */
    readonly headBob: MotionChannel;
  };
  readonly contacts: {
    /** 0..1 drive pressure through the shoe/footplate; straps remain mechanically locked. */
    readonly footPressure: MotionChannel;
    /** Constant hand-to-handle attachment; solve the arm toward the handle, never through torso. */
    readonly handleGrip: MotionChannel;
    /** 0..1 blade immersion; lock blade/water interaction only while this is engaged. */
    readonly bladeWater: MotionChannel;
    /** 0..1 feather amount during recovery, returning to square before the catch. */
    readonly bladeFeather: MotionChannel;
    /** 0..1 oarlock load; use for small rigger/oar flex rather than moving the pivot. */
    readonly oarlockLoad: MotionChannel;
  };
  readonly accents: {
    /** Signed catch-to-finish propulsion cue in approximately -1..1. */
    readonly surge: MotionChannel;
    /** Signed restrained hull/torso rise cue in approximately -0.18..0.18. */
    readonly vertical: MotionChannel;
  };
}

/**
 * SkiErg choreography. Pole contact is an envelope, not a moving tip: when
 * it is materially engaged, a renderer should preserve the sampled world tip
 * and solve the athlete toward that anchor.
 */
export interface SkierMotionGraph {
  readonly sport: "skierg";
  readonly timing: MotionTiming;
  readonly body: {
    /** 0 = high reach, 1 = completed double-pole press. */
    readonly armPress: MotionChannel;
    /** Shoulder follow-through for clavicle/scapula controls, sharing the arm press timing. */
    readonly shoulderDrop: MotionChannel;
    /** 0 = upright, 1 = forward hip hinge. */
    readonly hipHinge: MotionChannel;
    /** Pelvis hinge cue, equal to hip hinge for a constraint-friendly root target. */
    readonly pelvisHinge: MotionChannel;
    /** 0 = tall legs, 1 = athletic compression. */
    readonly kneeFlex: MotionChannel;
    /** 0 = poles forward/up, 1 = poles swept back/down. */
    readonly poleSweep: MotionChannel;
    /** Inverse arm press for an explicit high-reach target. */
    readonly reach: MotionChannel;
    /** Weighted hip/knee compression suitable for a torso root. */
    readonly torsoCompression: MotionChannel;
    /** Spine hinge cue for a multi-bone torso, derived from the compression truth. */
    readonly spineHinge: MotionChannel;
    /** Small upright-rebound cue (about 0..0.16). */
    readonly headRise: MotionChannel;
  };
  readonly contacts: {
    /** Constant hand-to-grip attachment. */
    readonly poleGrip: MotionChannel;
    /** 0..1 pole-tip plant envelope; world-lock each tip while materially engaged. */
    readonly polePlant: MotionChannel;
    /** 0..1 force/load envelope within the planted period. */
    readonly poleLoad: MotionChannel;
    /** 0..1 snow/foot pressure through the press. */
    readonly footPressure: MotionChannel;
  };
  readonly accents: {
    /** Signed forward propulsion cue in approximately -1..1. */
    readonly surge: MotionChannel;
    /** 0..1 recovery rebound, with C2-flat endpoints. */
    readonly rebound: MotionChannel;
  };
}

/** One pedal's contact-safe cyclic state. */
export interface PedalMotion {
  /** Circular pedal angle and derivatives, phase-opposed between left and right. */
  readonly rotation: CircularMotion;
  /** 0 = flexed knee, 1 = extended leg. */
  readonly legExtension: MotionChannel;
  /** Inverse leg extension, exposed for knee-target rigs. */
  readonly kneeLift: MotionChannel;
  /** Signed ankle articulation in approximately -0.55..0.55. */
  readonly ankleFlex: MotionChannel;
  /** Smooth 0..1 downstroke load cue; never a discontinuous half-wave. */
  readonly drive: MotionChannel;
  /** Constant shoe-to-pedal attachment. */
  readonly pedalLock: MotionChannel;
}

/** BikeErg choreography with circular, opposed pedal contacts. */
export interface BikeMotionGraph {
  readonly sport: "bike";
  readonly timing: MotionTiming;
  /** Crank state shared by both pedals and any visible drivetrain. */
  readonly crank: CircularMotion;
  readonly body: {
    /** Small signed side-to-side torso cue in approximately -0.22..0.22. */
    readonly torsoSway: MotionChannel;
    /** Small signed pelvis rotation cue in approximately -0.14..0.14. */
    readonly hipRock: MotionChannel;
    /** Alias of hip rock with a rig-friendly pelvis name. */
    readonly pelvisRock: MotionChannel;
    /** Small signed fore/aft spine cue in approximately -0.065..0.065. */
    readonly spineLean: MotionChannel;
    /** Counter-rotation for shoulders/handlebar posture. */
    readonly shoulderCounterRotation: MotionChannel;
    /** Small signed head-stabilization cue that counters pelvis and torso sway. */
    readonly headStabilization: MotionChannel;
  };
  readonly leftPedal: PedalMotion;
  readonly rightPedal: PedalMotion;
  readonly contacts: {
    /** Constant hands-on-bars attachment. */
    readonly handlebarGrip: MotionChannel;
    /** Constant seated contact; use secondary channels for visual rocking. */
    readonly saddleContact: MotionChannel;
  };
}

/** Discriminated output shared by both 2D and 3D replay renderers. */
export type ReplayMotionGraph = RowerMotionGraph | SkierMotionGraph | BikeMotionGraph;

interface CurveSample {
  value: number;
  dCycle: number;
  ddCycle: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function defaultSeconds(sport: Sport): number {
  return sport === "bike" ? 60 / 80 : sport === "skierg" ? 60 / 32 : 60 / 28;
}

function defaultDriveFraction(sport: Sport): number {
  return sport === "bike" ? 0.5 : sport === "skierg" ? 0.34 : 0.38;
}

/**
 * Quintic smootherstep and its first two analytic derivatives. It is C2-flat
 * at both ends, so chaining ramps creates stable poses and contacts even when
 * the phase advances across a drive/recovery or cycle boundary.
 */
function quinticRamp(cycle: number, start: number, end: number): CurveSample {
  const span = Math.max(1e-6, end - start);
  if (cycle <= start) return { value: 0, dCycle: 0, ddCycle: 0 };
  if (cycle >= end) return { value: 1, dCycle: 0, ddCycle: 0 };
  const u = (cycle - start) / span;
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  const derivative = 30 * u2 * (u - 1) * (u - 1);
  const secondDerivative = 120 * u3 - 180 * u2 + 60 * u;
  return {
    value: 6 * u5 - 15 * u4 + 10 * u3,
    dCycle: derivative / span,
    ddCycle: secondDerivative / (span * span),
  };
}

function constant(value: number): CurveSample {
  return { value, dCycle: 0, ddCycle: 0 };
}

function add(...samples: CurveSample[]): CurveSample {
  let value = 0;
  let dCycle = 0;
  let ddCycle = 0;
  for (const sample of samples) {
    value += sample.value;
    dCycle += sample.dCycle;
    ddCycle += sample.ddCycle;
  }
  return { value, dCycle, ddCycle };
}

function scale(sample: CurveSample, amount: number): CurveSample {
  return {
    value: sample.value * amount,
    dCycle: sample.dCycle * amount,
    ddCycle: sample.ddCycle * amount,
  };
}

function invert(sample: CurveSample): CurveSample {
  return {
    value: 1 - sample.value,
    dCycle: -sample.dCycle,
    ddCycle: -sample.ddCycle,
  };
}

function multiply(first: CurveSample, second: CurveSample): CurveSample {
  return {
    value: first.value * second.value,
    dCycle: first.dCycle * second.value + first.value * second.dCycle,
    ddCycle:
      first.ddCycle * second.value +
      2 * first.dCycle * second.dCycle +
      first.value * second.ddCycle,
  };
}

/** A C2 rise, plateau, and fall within one normalized replay cycle. */
function pulse(
  cycle: number,
  riseStart: number,
  riseEnd: number,
  fallStart: number,
  fallEnd: number,
): CurveSample {
  const up = quinticRamp(cycle, riseStart, riseEnd);
  const down = quinticRamp(cycle, fallStart, fallEnd);
  return add(up, scale(down, -1));
}

/** A C2 bell with zero value, velocity, and acceleration at both endpoints. */
function bump(cycle: number, start: number, end: number): CurveSample {
  const ramp = quinticRamp(cycle, start, end);
  const value = 4 * ramp.value * (1 - ramp.value);
  return {
    value,
    dCycle: 4 * ramp.dCycle * (1 - 2 * ramp.value),
    ddCycle: 4 * (ramp.ddCycle * (1 - 2 * ramp.value) - 2 * ramp.dCycle * ramp.dCycle),
  };
}

function sine(cycle: number, phaseOffset = 0): CurveSample {
  const angle = cycle * TAU + phaseOffset;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return { value: sin, dCycle: cos * TAU, ddCycle: -sin * TAU * TAU };
}

function cosine(cycle: number, phaseOffset = 0): CurveSample {
  return sine(cycle, phaseOffset + Math.PI / 2);
}

function toChannel(sample: CurveSample, timing: MotionTiming): MotionChannel {
  const cyclesPerSecond = 1 / timing.secondsPerCycle;
  return {
    value: sample.value,
    velocity: sample.dCycle * cyclesPerSecond,
    acceleration: sample.ddCycle * cyclesPerSecond * cyclesPerSecond,
  };
}

function timingFor(sport: Sport, pose: StrokePose): MotionTiming {
  const fallbackCycle = clamp(finite(pose.cycleFrac, 0), 0, 0.999999);
  const sourcePhase = finite(pose.phase, fallbackCycle * TAU);
  const rawCycle = sourcePhase / TAU;
  const cycle = ((rawCycle % 1) + 1) % 1;
  const secondsPerCycle = clamp(finite(pose.strokeSeconds, defaultSeconds(sport)), 0.2, 12);
  const driveFraction = clamp(
    finite(pose.driveFrac, defaultDriveFraction(sport)),
    sport === "bike" ? 0.5 : 0.26,
    sport === "bike" ? 0.5 : 0.48,
  );
  const inDrive = cycle < driveFraction;
  return {
    cycleIndex: Math.floor(rawCycle),
    cycle,
    phase: cycle * TAU,
    secondsPerCycle,
    phaseVelocity: TAU / secondsPerCycle,
    phaseAcceleration: 0,
    driveFraction,
    driveProgress: inDrive ? cycle / driveFraction : 1,
    recoveryProgress: inDrive ? 0 : (cycle - driveFraction) / (1 - driveFraction),
  };
}

function centered(sample: CurveSample): CurveSample {
  return add(scale(sample, 2), constant(-1));
}

function intensityScale(pose: StrokePose): number {
  return 0.88 + clamp(finite(pose.intensity, 0.5), 0, 1) * 0.12;
}

function sampleRower(timing: MotionTiming, pose: StrokePose): RowerMotionGraph {
  const cycle = timing.cycle;
  const drive = timing.driveFraction;
  const recovery = 1 - drive;

  // The ranges intentionally overlap. The finish is a short shared plateau,
  // while recovery sends hands away before body-over and slide return.
  const legs = pulse(cycle, 0, drive * 0.56, drive + recovery * 0.34, 1);
  const torso = pulse(
    cycle,
    drive * 0.12,
    drive * 0.82,
    drive + recovery * 0.13,
    drive + recovery * 0.66,
  );
  const arms = pulse(cycle, drive * 0.45, drive * 0.98, drive, drive + recovery * 0.36);
  const handle = add(scale(legs, 0.37), scale(torso, 0.28), scale(arms, 0.35));
  const shoulders = add(scale(torso, 0.4), scale(arms, 0.6));
  const bladeWater = pulse(cycle, drive * 0.008, drive * 0.085, drive * 0.78, drive * 0.95);
  const bladeFeather = pulse(
    cycle,
    drive + recovery * 0.025,
    drive + recovery * 0.13,
    drive + recovery * 0.75,
    1,
  );
  const footPressure = pulse(cycle, drive * 0.02, drive * 0.17, drive * 0.63, drive * 0.86);
  const oarlockLoad = multiply(bladeWater, footPressure);
  const vertical = add(scale(centered(legs), 0.1), scale(centered(torso), 0.055));
  const headBob = add(scale(centered(handle), 0.09), scale(vertical, 0.22));
  const effort = intensityScale(pose);

  return {
    sport: "rower",
    timing,
    body: {
      seatTravel: toChannel(legs, timing),
      pelvisTravel: toChannel(legs, timing),
      legExtension: toChannel(legs, timing),
      torsoSwing: toChannel(torso, timing),
      spineHinge: toChannel(torso, timing),
      torsoReach: toChannel(invert(torso), timing),
      armDraw: toChannel(arms, timing),
      shoulderSet: toChannel(shoulders, timing),
      handleTravel: toChannel(handle, timing),
      headBob: toChannel(headBob, timing),
    },
    contacts: {
      footPressure: toChannel(footPressure, timing),
      handleGrip: toChannel(constant(1), timing),
      bladeWater: toChannel(bladeWater, timing),
      bladeFeather: toChannel(bladeFeather, timing),
      oarlockLoad: toChannel(oarlockLoad, timing),
    },
    accents: {
      surge: toChannel(scale(centered(handle), effort), timing),
      vertical: toChannel(scale(vertical, effort), timing),
    },
  };
}

function sampleSkier(timing: MotionTiming, pose: StrokePose): SkierMotionGraph {
  const cycle = timing.cycle;
  const drive = timing.driveFraction;
  const recovery = 1 - drive;

  // A deliberately staggered, overlapping double-pole press: arms initiate,
  // hips follow, and knees absorb last. Recovery reverses this without snaps.
  const arms = pulse(cycle, drive * 0.015, drive * 0.7, drive, drive + recovery * 0.42);
  const hips = pulse(
    cycle,
    drive * 0.08,
    drive * 0.77,
    drive + recovery * 0.06,
    drive + recovery * 0.6,
  );
  const knees = pulse(
    cycle,
    drive * 0.17,
    drive * 0.86,
    drive + recovery * 0.15,
    drive + recovery * 0.7,
  );
  const poleSweep = pulse(cycle, drive * 0.01, drive * 0.93, drive, drive + recovery * 0.55);
  // Pole tips should be held in course space while this is materially active;
  // the envelope itself never invents a sliding ground point.
  const polePlant = pulse(cycle, drive * 0.005, drive * 0.075, drive * 0.84, drive * 0.97);
  const poleLoad = pulse(cycle, drive * 0.06, drive * 0.18, drive * 0.67, drive * 0.84);
  const footPressure = pulse(cycle, drive * 0.12, drive * 0.28, drive * 0.7, drive * 0.92);
  const torsoCompression = add(scale(hips, 0.66), scale(knees, 0.34));
  const rebound = bump(cycle, drive + recovery * 0.18, drive + recovery * 0.85);
  const headRise = scale(rebound, 0.16);
  const effort = intensityScale(pose);

  return {
    sport: "skierg",
    timing,
    body: {
      armPress: toChannel(arms, timing),
      shoulderDrop: toChannel(arms, timing),
      hipHinge: toChannel(hips, timing),
      pelvisHinge: toChannel(hips, timing),
      kneeFlex: toChannel(knees, timing),
      poleSweep: toChannel(poleSweep, timing),
      reach: toChannel(invert(arms), timing),
      torsoCompression: toChannel(torsoCompression, timing),
      spineHinge: toChannel(torsoCompression, timing),
      headRise: toChannel(headRise, timing),
    },
    contacts: {
      poleGrip: toChannel(constant(1), timing),
      polePlant: toChannel(polePlant, timing),
      poleLoad: toChannel(poleLoad, timing),
      footPressure: toChannel(footPressure, timing),
    },
    accents: {
      surge: toChannel(scale(centered(poleSweep), effort), timing),
      rebound: toChannel(rebound, timing),
    },
  };
}

function circularAt(timing: MotionTiming, phaseOffset = 0): CircularMotion {
  const unwrapped = timing.phase + phaseOffset;
  const angle = ((unwrapped % TAU) + TAU) % TAU;
  return {
    angle,
    sin: Math.sin(unwrapped),
    cos: Math.cos(unwrapped),
    angularVelocity: timing.phaseVelocity,
    angularAcceleration: timing.phaseAcceleration,
  };
}

function pedalAt(timing: MotionTiming, phaseOffset: number): PedalMotion {
  const rotation = circularAt(timing, phaseOffset);
  const sineWave = sine(timing.cycle, phaseOffset);
  const cosineWave = cosine(timing.cycle, phaseOffset);
  const extension = add(constant(0.5), scale(cosineWave, 0.5));
  const downstroke = add(constant(0.5), scale(sineWave, 0.5));
  // Squaring makes peak torque live around the downstroke while remaining C∞
  // at the zero-load point; unlike max(0, sin), it has no derivative kink.
  const drive = multiply(downstroke, downstroke);
  const ankle = add(scale(sineWave, 0.44), scale(cosineWave, -0.11));
  return {
    rotation,
    legExtension: toChannel(extension, timing),
    kneeLift: toChannel(invert(extension), timing),
    ankleFlex: toChannel(ankle, timing),
    drive: toChannel(drive, timing),
    pedalLock: toChannel(constant(1), timing),
  };
}

function sampleBike(timing: MotionTiming): BikeMotionGraph {
  const sineWave = sine(timing.cycle);
  // Doubling the phase is done analytically rather than by sampling a wrapped
  // angle, so body rotation keeps its derivatives clean at the cycle boundary.
  const doubleAngle = timing.cycle * TAU * 2;
  const hipRock: CurveSample = {
    value: Math.sin(doubleAngle) * 0.14,
    dCycle: Math.cos(doubleAngle) * TAU * 2 * 0.14,
    ddCycle: -Math.sin(doubleAngle) * TAU * TAU * 4 * 0.14,
  };
  const torsoSway = scale(sineWave, 0.22);
  const spineLean = scale(cosine(timing.cycle), 0.065);
  // Keep this explicit rather than deriving from a render-space torso angle:
  // authored shoulders counter the pelvis in both orthographic and perspective views.
  const shoulders = scale(torsoSway, -0.62);
  const headStabilization = scale(add(scale(torsoSway, -1), scale(hipRock, -0.25)), 0.32);

  return {
    sport: "bike",
    timing,
    crank: circularAt(timing),
    body: {
      torsoSway: toChannel(torsoSway, timing),
      hipRock: toChannel(hipRock, timing),
      pelvisRock: toChannel(hipRock, timing),
      spineLean: toChannel(spineLean, timing),
      shoulderCounterRotation: toChannel(shoulders, timing),
      headStabilization: toChannel(headStabilization, timing),
    },
    leftPedal: pedalAt(timing, 0),
    rightPedal: pedalAt(timing, Math.PI),
    contacts: {
      handlebarGrip: toChannel(constant(1), timing),
      saddleContact: toChannel(constant(1), timing),
    },
  };
}

/**
 * Sample the shared authored motion graph for a data-derived `StrokePose`.
 *
 * The result contains no DOM, Three.js, random state, or mutable global data.
 * It is therefore safe to call from Canvas and Three render paths for the same
 * frame; both consumers will receive identical timing, body sequencing, and
 * equipment-contact envelopes.
 */
export function sampleMotionGraph(sport: Sport, pose: StrokePose): ReplayMotionGraph {
  const timing = timingFor(sport, pose);
  switch (sport) {
    case "skierg":
      return sampleSkier(timing, pose);
    case "bike":
      return sampleBike(timing);
    default:
      return sampleRower(timing, pose);
  }
}

/** Convenience typed sampler for RowErg consumers. */
export function sampleRowerMotionGraph(pose: StrokePose): RowerMotionGraph {
  return sampleRower(timingFor("rower", pose), pose);
}

/** Convenience typed sampler for SkiErg consumers. */
export function sampleSkierMotionGraph(pose: StrokePose): SkierMotionGraph {
  return sampleSkier(timingFor("skierg", pose), pose);
}

/** Convenience typed sampler for BikeErg consumers. */
export function sampleBikeMotionGraph(pose: StrokePose): BikeMotionGraph {
  return sampleBike(timingFor("bike", pose));
}

// ── Allocation-conscious renderer sampling ──────────────────────────────────
//
// The public samplers above intentionally return independent immutable-looking
// snapshots. That is useful for tests, diagnostics, and any caller that wants
// to retain a pose. Renderers, however, run this work for live and ghost
// athletes every frame. The factories and `...Into` samplers below reuse one
// caller-owned graph tree and evaluate every intermediate curve in a fixed
// module-owned scratch set. They therefore allocate no graph, channel, or
// temporary curve objects in the animation hot path.

type WritableDeep<T> = {
  -readonly [Key in keyof T]: T[Key] extends object ? WritableDeep<T[Key]> : T[Key];
};

function writable<T>(value: T): WritableDeep<T> {
  return value as WritableDeep<T>;
}

function emptyChannel(): MotionChannel {
  return { value: 0, velocity: 0, acceleration: 0 };
}

function emptyTiming(): MotionTiming {
  return {
    cycleIndex: 0,
    cycle: 0,
    phase: 0,
    secondsPerCycle: 1,
    phaseVelocity: TAU,
    phaseAcceleration: 0,
    driveFraction: 0,
    driveProgress: 0,
    recoveryProgress: 0,
  };
}

function emptyCircularMotion(): CircularMotion {
  return {
    angle: 0,
    sin: 0,
    cos: 1,
    angularVelocity: 0,
    angularAcceleration: 0,
  };
}

function emptyPedalMotion(): PedalMotion {
  return {
    rotation: emptyCircularMotion(),
    legExtension: emptyChannel(),
    kneeLift: emptyChannel(),
    ankleFlex: emptyChannel(),
    drive: emptyChannel(),
    pedalLock: emptyChannel(),
  };
}

/** Create a reusable RowErg output frame for `sampleRowerMotionGraphInto`. */
export function createRowerMotionGraphScratch(): RowerMotionGraph {
  return {
    sport: "rower",
    timing: emptyTiming(),
    body: {
      seatTravel: emptyChannel(),
      pelvisTravel: emptyChannel(),
      legExtension: emptyChannel(),
      torsoSwing: emptyChannel(),
      spineHinge: emptyChannel(),
      torsoReach: emptyChannel(),
      armDraw: emptyChannel(),
      shoulderSet: emptyChannel(),
      handleTravel: emptyChannel(),
      headBob: emptyChannel(),
    },
    contacts: {
      footPressure: emptyChannel(),
      handleGrip: emptyChannel(),
      bladeWater: emptyChannel(),
      bladeFeather: emptyChannel(),
      oarlockLoad: emptyChannel(),
    },
    accents: {
      surge: emptyChannel(),
      vertical: emptyChannel(),
    },
  };
}

/** Create a reusable SkiErg output frame for `sampleSkierMotionGraphInto`. */
export function createSkierMotionGraphScratch(): SkierMotionGraph {
  return {
    sport: "skierg",
    timing: emptyTiming(),
    body: {
      armPress: emptyChannel(),
      shoulderDrop: emptyChannel(),
      hipHinge: emptyChannel(),
      pelvisHinge: emptyChannel(),
      kneeFlex: emptyChannel(),
      poleSweep: emptyChannel(),
      reach: emptyChannel(),
      torsoCompression: emptyChannel(),
      spineHinge: emptyChannel(),
      headRise: emptyChannel(),
    },
    contacts: {
      poleGrip: emptyChannel(),
      polePlant: emptyChannel(),
      poleLoad: emptyChannel(),
      footPressure: emptyChannel(),
    },
    accents: {
      surge: emptyChannel(),
      rebound: emptyChannel(),
    },
  };
}

/** Create a reusable BikeErg output frame for `sampleBikeMotionGraphInto`. */
export function createBikeMotionGraphScratch(): BikeMotionGraph {
  return {
    sport: "bike",
    timing: emptyTiming(),
    crank: emptyCircularMotion(),
    body: {
      torsoSway: emptyChannel(),
      hipRock: emptyChannel(),
      pelvisRock: emptyChannel(),
      spineLean: emptyChannel(),
      shoulderCounterRotation: emptyChannel(),
      headStabilization: emptyChannel(),
    },
    leftPedal: emptyPedalMotion(),
    rightPedal: emptyPedalMotion(),
    contacts: {
      handlebarGrip: emptyChannel(),
      saddleContact: emptyChannel(),
    },
  };
}

interface IntoCurveScratch {
  value: number;
  dCycle: number;
  ddCycle: number;
}

/**
 * All temporary curves are overwritten before use. Sampling is synchronous and
 * invokes no callbacks, so one private scratch bank is safe and removes the
 * short-lived object churn that would otherwise hit the garbage collector once
 * per live/ghost frame.
 */
const INTO_CURVES = {
  rise: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  fall: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowLegs: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowTorso: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowArms: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowHandle: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowShoulders: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowBladeWater: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowBladeFeather: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowFootPressure: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowOarlockLoad: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowVertical: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  rowHeadBob: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiArms: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiHips: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiKnees: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiPoleSweep: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiPolePlant: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiPoleLoad: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiFootPressure: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiCompression: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiRebound: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  skiHeadRise: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  bikeSine: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  bikeCosine: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  bikeHipRock: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  bikeTorsoSway: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  bikeSpineLean: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  bikeShoulders: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  bikeHead: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  pedalSine: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  pedalCosine: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  pedalExtension: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  pedalDownstroke: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  pedalDrive: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
  pedalAnkle: { value: 0, dCycle: 0, ddCycle: 0 } satisfies IntoCurveScratch,
};

function writeCurve(
  output: IntoCurveScratch,
  value: number,
  dCycle: number,
  ddCycle: number,
): IntoCurveScratch {
  output.value = value;
  output.dCycle = dCycle;
  output.ddCycle = ddCycle;
  return output;
}

function quinticRampInto(
  output: IntoCurveScratch,
  cycle: number,
  start: number,
  end: number,
): IntoCurveScratch {
  const span = Math.max(1e-6, end - start);
  if (cycle <= start) return writeCurve(output, 0, 0, 0);
  if (cycle >= end) return writeCurve(output, 1, 0, 0);
  const u = (cycle - start) / span;
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  return writeCurve(
    output,
    6 * u5 - 15 * u4 + 10 * u3,
    (30 * u2 * (u - 1) * (u - 1)) / span,
    (120 * u3 - 180 * u2 + 60 * u) / (span * span),
  );
}

function pulseInto(
  output: IntoCurveScratch,
  cycle: number,
  riseStart: number,
  riseEnd: number,
  fallStart: number,
  fallEnd: number,
): IntoCurveScratch {
  const rise = quinticRampInto(INTO_CURVES.rise, cycle, riseStart, riseEnd);
  const fall = quinticRampInto(INTO_CURVES.fall, cycle, fallStart, fallEnd);
  return writeCurve(
    output,
    rise.value - fall.value,
    rise.dCycle - fall.dCycle,
    rise.ddCycle - fall.ddCycle,
  );
}

function bumpInto(
  output: IntoCurveScratch,
  cycle: number,
  start: number,
  end: number,
): IntoCurveScratch {
  const ramp = quinticRampInto(INTO_CURVES.rise, cycle, start, end);
  return writeCurve(
    output,
    4 * ramp.value * (1 - ramp.value),
    4 * ramp.dCycle * (1 - 2 * ramp.value),
    4 * (ramp.ddCycle * (1 - 2 * ramp.value) - 2 * ramp.dCycle * ramp.dCycle),
  );
}

function sineInto(output: IntoCurveScratch, cycle: number, phaseOffset = 0): IntoCurveScratch {
  const angle = cycle * TAU + phaseOffset;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return writeCurve(output, sin, cos * TAU, -sin * TAU * TAU);
}

function cosineInto(output: IntoCurveScratch, cycle: number, phaseOffset = 0): IntoCurveScratch {
  return sineInto(output, cycle, phaseOffset + Math.PI / 2);
}

function scaleInto(
  output: IntoCurveScratch,
  sample: IntoCurveScratch,
  amount: number,
): IntoCurveScratch {
  return writeCurve(output, sample.value * amount, sample.dCycle * amount, sample.ddCycle * amount);
}

function combine2Into(
  output: IntoCurveScratch,
  first: IntoCurveScratch,
  firstScale: number,
  second: IntoCurveScratch,
  secondScale: number,
  constantValue = 0,
): IntoCurveScratch {
  return writeCurve(
    output,
    first.value * firstScale + second.value * secondScale + constantValue,
    first.dCycle * firstScale + second.dCycle * secondScale,
    first.ddCycle * firstScale + second.ddCycle * secondScale,
  );
}

function combine3Into(
  output: IntoCurveScratch,
  first: IntoCurveScratch,
  firstScale: number,
  second: IntoCurveScratch,
  secondScale: number,
  third: IntoCurveScratch,
  thirdScale: number,
): IntoCurveScratch {
  return writeCurve(
    output,
    first.value * firstScale + second.value * secondScale + third.value * thirdScale,
    first.dCycle * firstScale + second.dCycle * secondScale + third.dCycle * thirdScale,
    first.ddCycle * firstScale + second.ddCycle * secondScale + third.ddCycle * thirdScale,
  );
}

function multiplyInto(
  output: IntoCurveScratch,
  first: IntoCurveScratch,
  second: IntoCurveScratch,
): IntoCurveScratch {
  return writeCurve(
    output,
    first.value * second.value,
    first.dCycle * second.value + first.value * second.dCycle,
    first.ddCycle * second.value + 2 * first.dCycle * second.dCycle + first.value * second.ddCycle,
  );
}

function channelInto(output: MotionChannel, sample: IntoCurveScratch, timing: MotionTiming): void {
  const channel = writable(output);
  const cyclesPerSecond = 1 / timing.secondsPerCycle;
  channel.value = sample.value;
  channel.velocity = sample.dCycle * cyclesPerSecond;
  channel.acceleration = sample.ddCycle * cyclesPerSecond * cyclesPerSecond;
}

function constantChannelInto(output: MotionChannel, value: number): void {
  const channel = writable(output);
  channel.value = value;
  channel.velocity = 0;
  channel.acceleration = 0;
}

function copyChannelInto(output: MotionChannel, source: MotionChannel): void {
  const channel = writable(output);
  channel.value = source.value;
  channel.velocity = source.velocity;
  channel.acceleration = source.acceleration;
}

function timingInto(output: MotionTiming, sport: Sport, pose: StrokePose): void {
  const timing = writable(output);
  const fallbackCycle = clamp(finite(pose.cycleFrac, 0), 0, 0.999999);
  const sourcePhase = finite(pose.phase, fallbackCycle * TAU);
  const rawCycle = sourcePhase / TAU;
  const cycle = ((rawCycle % 1) + 1) % 1;
  const secondsPerCycle = clamp(finite(pose.strokeSeconds, defaultSeconds(sport)), 0.2, 12);
  const driveFraction = clamp(
    finite(pose.driveFrac, defaultDriveFraction(sport)),
    sport === "bike" ? 0.5 : 0.26,
    sport === "bike" ? 0.5 : 0.48,
  );
  const inDrive = cycle < driveFraction;
  timing.cycleIndex = Math.floor(rawCycle);
  timing.cycle = cycle;
  timing.phase = cycle * TAU;
  timing.secondsPerCycle = secondsPerCycle;
  timing.phaseVelocity = TAU / secondsPerCycle;
  timing.phaseAcceleration = 0;
  timing.driveFraction = driveFraction;
  timing.driveProgress = inDrive ? cycle / driveFraction : 1;
  timing.recoveryProgress = inDrive ? 0 : (cycle - driveFraction) / (1 - driveFraction);
}

function circularInto(output: CircularMotion, timing: MotionTiming, phaseOffset = 0): void {
  const circular = writable(output);
  const unwrapped = timing.phase + phaseOffset;
  circular.angle = ((unwrapped % TAU) + TAU) % TAU;
  circular.sin = Math.sin(unwrapped);
  circular.cos = Math.cos(unwrapped);
  circular.angularVelocity = timing.phaseVelocity;
  circular.angularAcceleration = timing.phaseAcceleration;
}

function sampleRowerInto(pose: StrokePose, output: RowerMotionGraph): void {
  const graph = writable(output);
  const timing = graph.timing;
  timingInto(timing, "rower", pose);
  const cycle = timing.cycle;
  const drive = timing.driveFraction;
  const recovery = 1 - drive;
  const curves = INTO_CURVES;

  pulseInto(curves.rowLegs, cycle, 0, drive * 0.56, drive + recovery * 0.34, 1);
  pulseInto(
    curves.rowTorso,
    cycle,
    drive * 0.12,
    drive * 0.82,
    drive + recovery * 0.13,
    drive + recovery * 0.66,
  );
  pulseInto(curves.rowArms, cycle, drive * 0.45, drive * 0.98, drive, drive + recovery * 0.36);
  combine3Into(curves.rowHandle, curves.rowLegs, 0.37, curves.rowTorso, 0.28, curves.rowArms, 0.35);
  combine2Into(curves.rowShoulders, curves.rowTorso, 0.4, curves.rowArms, 0.6);
  pulseInto(curves.rowBladeWater, cycle, drive * 0.008, drive * 0.085, drive * 0.78, drive * 0.95);
  pulseInto(
    curves.rowBladeFeather,
    cycle,
    drive + recovery * 0.025,
    drive + recovery * 0.13,
    drive + recovery * 0.75,
    1,
  );
  pulseInto(curves.rowFootPressure, cycle, drive * 0.02, drive * 0.17, drive * 0.63, drive * 0.86);
  multiplyInto(curves.rowOarlockLoad, curves.rowBladeWater, curves.rowFootPressure);
  // Preserve the public sampler's evaluation order as well as its formula.
  // That keeps diagnostic snapshots bit-for-bit stable while still writing
  // into fixed scratch objects.
  writeCurve(
    curves.rowVertical,
    (curves.rowLegs.value * 2 - 1) * 0.1 + (curves.rowTorso.value * 2 - 1) * 0.055,
    curves.rowLegs.dCycle * 2 * 0.1 + curves.rowTorso.dCycle * 2 * 0.055,
    curves.rowLegs.ddCycle * 2 * 0.1 + curves.rowTorso.ddCycle * 2 * 0.055,
  );
  writeCurve(
    curves.rowHeadBob,
    (curves.rowHandle.value * 2 - 1) * 0.09 + curves.rowVertical.value * 0.22,
    curves.rowHandle.dCycle * 2 * 0.09 + curves.rowVertical.dCycle * 0.22,
    curves.rowHandle.ddCycle * 2 * 0.09 + curves.rowVertical.ddCycle * 0.22,
  );

  channelInto(graph.body.seatTravel, curves.rowLegs, timing);
  copyChannelInto(graph.body.pelvisTravel, graph.body.seatTravel);
  copyChannelInto(graph.body.legExtension, graph.body.seatTravel);
  channelInto(graph.body.torsoSwing, curves.rowTorso, timing);
  copyChannelInto(graph.body.spineHinge, graph.body.torsoSwing);
  const reach = writable(graph.body.torsoReach);
  reach.value = 1 - graph.body.spineHinge.value;
  reach.velocity = -graph.body.spineHinge.velocity;
  reach.acceleration = -graph.body.spineHinge.acceleration;
  channelInto(graph.body.armDraw, curves.rowArms, timing);
  channelInto(graph.body.shoulderSet, curves.rowShoulders, timing);
  channelInto(graph.body.handleTravel, curves.rowHandle, timing);
  channelInto(graph.body.headBob, curves.rowHeadBob, timing);
  channelInto(graph.contacts.footPressure, curves.rowFootPressure, timing);
  constantChannelInto(graph.contacts.handleGrip, 1);
  channelInto(graph.contacts.bladeWater, curves.rowBladeWater, timing);
  channelInto(graph.contacts.bladeFeather, curves.rowBladeFeather, timing);
  channelInto(graph.contacts.oarlockLoad, curves.rowOarlockLoad, timing);
  const effort = intensityScale(pose);
  writeCurve(
    curves.rowHandle,
    (curves.rowHandle.value * 2 - 1) * effort,
    curves.rowHandle.dCycle * 2 * effort,
    curves.rowHandle.ddCycle * 2 * effort,
  );
  channelInto(graph.accents.surge, curves.rowHandle, timing);
  scaleInto(curves.rowVertical, curves.rowVertical, effort);
  channelInto(graph.accents.vertical, curves.rowVertical, timing);
}

function sampleSkierInto(pose: StrokePose, output: SkierMotionGraph): void {
  const graph = writable(output);
  const timing = graph.timing;
  timingInto(timing, "skierg", pose);
  const cycle = timing.cycle;
  const drive = timing.driveFraction;
  const recovery = 1 - drive;
  const curves = INTO_CURVES;

  pulseInto(curves.skiArms, cycle, drive * 0.015, drive * 0.7, drive, drive + recovery * 0.42);
  pulseInto(
    curves.skiHips,
    cycle,
    drive * 0.08,
    drive * 0.77,
    drive + recovery * 0.06,
    drive + recovery * 0.6,
  );
  pulseInto(
    curves.skiKnees,
    cycle,
    drive * 0.17,
    drive * 0.86,
    drive + recovery * 0.15,
    drive + recovery * 0.7,
  );
  pulseInto(curves.skiPoleSweep, cycle, drive * 0.01, drive * 0.93, drive, drive + recovery * 0.55);
  pulseInto(curves.skiPolePlant, cycle, drive * 0.005, drive * 0.075, drive * 0.84, drive * 0.97);
  pulseInto(curves.skiPoleLoad, cycle, drive * 0.06, drive * 0.18, drive * 0.67, drive * 0.84);
  pulseInto(curves.skiFootPressure, cycle, drive * 0.12, drive * 0.28, drive * 0.7, drive * 0.92);
  combine2Into(curves.skiCompression, curves.skiHips, 0.66, curves.skiKnees, 0.34);
  bumpInto(curves.skiRebound, cycle, drive + recovery * 0.18, drive + recovery * 0.85);
  scaleInto(curves.skiHeadRise, curves.skiRebound, 0.16);

  channelInto(graph.body.armPress, curves.skiArms, timing);
  copyChannelInto(graph.body.shoulderDrop, graph.body.armPress);
  channelInto(graph.body.hipHinge, curves.skiHips, timing);
  copyChannelInto(graph.body.pelvisHinge, graph.body.hipHinge);
  channelInto(graph.body.kneeFlex, curves.skiKnees, timing);
  channelInto(graph.body.poleSweep, curves.skiPoleSweep, timing);
  const reach = writable(graph.body.reach);
  reach.value = 1 - graph.body.armPress.value;
  reach.velocity = -graph.body.armPress.velocity;
  reach.acceleration = -graph.body.armPress.acceleration;
  channelInto(graph.body.torsoCompression, curves.skiCompression, timing);
  copyChannelInto(graph.body.spineHinge, graph.body.torsoCompression);
  channelInto(graph.body.headRise, curves.skiHeadRise, timing);
  constantChannelInto(graph.contacts.poleGrip, 1);
  channelInto(graph.contacts.polePlant, curves.skiPolePlant, timing);
  channelInto(graph.contacts.poleLoad, curves.skiPoleLoad, timing);
  channelInto(graph.contacts.footPressure, curves.skiFootPressure, timing);
  const effort = intensityScale(pose);
  writeCurve(
    curves.skiPoleSweep,
    (curves.skiPoleSweep.value * 2 - 1) * effort,
    curves.skiPoleSweep.dCycle * 2 * effort,
    curves.skiPoleSweep.ddCycle * 2 * effort,
  );
  channelInto(graph.accents.surge, curves.skiPoleSweep, timing);
  channelInto(graph.accents.rebound, curves.skiRebound, timing);
}

function pedalInto(timing: MotionTiming, phaseOffset: number, output: PedalMotion): void {
  const pedal = writable(output);
  const curves = INTO_CURVES;
  circularInto(pedal.rotation, timing, phaseOffset);
  sineInto(curves.pedalSine, timing.cycle, phaseOffset);
  cosineInto(curves.pedalCosine, timing.cycle, phaseOffset);
  writeCurve(
    curves.pedalExtension,
    0.5 + curves.pedalCosine.value * 0.5,
    curves.pedalCosine.dCycle * 0.5,
    curves.pedalCosine.ddCycle * 0.5,
  );
  writeCurve(
    curves.pedalDownstroke,
    0.5 + curves.pedalSine.value * 0.5,
    curves.pedalSine.dCycle * 0.5,
    curves.pedalSine.ddCycle * 0.5,
  );
  multiplyInto(curves.pedalDrive, curves.pedalDownstroke, curves.pedalDownstroke);
  combine2Into(curves.pedalAnkle, curves.pedalSine, 0.44, curves.pedalCosine, -0.11);
  channelInto(pedal.legExtension, curves.pedalExtension, timing);
  const kneeLift = writable(pedal.kneeLift);
  kneeLift.value = 1 - pedal.legExtension.value;
  kneeLift.velocity = -pedal.legExtension.velocity;
  kneeLift.acceleration = -pedal.legExtension.acceleration;
  channelInto(pedal.ankleFlex, curves.pedalAnkle, timing);
  channelInto(pedal.drive, curves.pedalDrive, timing);
  constantChannelInto(pedal.pedalLock, 1);
}

function sampleBikeInto(pose: StrokePose, output: BikeMotionGraph): void {
  const graph = writable(output);
  const timing = graph.timing;
  timingInto(timing, "bike", pose);
  const curves = INTO_CURVES;
  sineInto(curves.bikeSine, timing.cycle);
  cosineInto(curves.bikeCosine, timing.cycle);
  const doubleAngle = timing.cycle * TAU * 2;
  const doubleSin = Math.sin(doubleAngle);
  const doubleCos = Math.cos(doubleAngle);
  writeCurve(
    curves.bikeHipRock,
    doubleSin * 0.14,
    doubleCos * TAU * 2 * 0.14,
    -doubleSin * TAU * TAU * 4 * 0.14,
  );
  scaleInto(curves.bikeTorsoSway, curves.bikeSine, 0.22);
  scaleInto(curves.bikeSpineLean, curves.bikeCosine, 0.065);
  scaleInto(curves.bikeShoulders, curves.bikeTorsoSway, -0.62);
  // Same nested scale/add order as `sampleBike` for identical snapshots.
  writeCurve(
    curves.bikeHead,
    (0 + curves.bikeTorsoSway.value * -1 + curves.bikeHipRock.value * -0.25) * 0.32,
    (0 + curves.bikeTorsoSway.dCycle * -1 + curves.bikeHipRock.dCycle * -0.25) * 0.32,
    (0 + curves.bikeTorsoSway.ddCycle * -1 + curves.bikeHipRock.ddCycle * -0.25) * 0.32,
  );

  circularInto(graph.crank, timing);
  channelInto(graph.body.torsoSway, curves.bikeTorsoSway, timing);
  channelInto(graph.body.hipRock, curves.bikeHipRock, timing);
  copyChannelInto(graph.body.pelvisRock, graph.body.hipRock);
  channelInto(graph.body.spineLean, curves.bikeSpineLean, timing);
  channelInto(graph.body.shoulderCounterRotation, curves.bikeShoulders, timing);
  channelInto(graph.body.headStabilization, curves.bikeHead, timing);
  pedalInto(timing, 0, graph.leftPedal);
  pedalInto(timing, Math.PI, graph.rightPedal);
  constantChannelInto(graph.contacts.handlebarGrip, 1);
  constantChannelInto(graph.contacts.saddleContact, 1);
}

/**
 * Fill a reusable RowErg graph frame without allocating output or temporary
 * curve objects. Use `createRowerMotionGraphScratch()` once per renderer.
 */
export function sampleRowerMotionGraphInto(
  pose: StrokePose,
  output: RowerMotionGraph,
): RowerMotionGraph {
  sampleRowerInto(pose, output);
  return output;
}

/** Fill a reusable SkiErg graph frame without per-sample object allocation. */
export function sampleSkierMotionGraphInto(
  pose: StrokePose,
  output: SkierMotionGraph,
): SkierMotionGraph {
  sampleSkierInto(pose, output);
  return output;
}

/** Fill a reusable BikeErg graph frame without per-sample object allocation. */
export function sampleBikeMotionGraphInto(
  pose: StrokePose,
  output: BikeMotionGraph,
): BikeMotionGraph {
  sampleBikeInto(pose, output);
  return output;
}
