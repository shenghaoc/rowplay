import { strokeSurge } from "./motion";
import type { StrokePose } from "./strokeModel";

const TAU = Math.PI * 2;

/** Normalised rowing pose channels. Main joint channels are in the 0..1 range. */
export interface RowerKinematics {
  legExtension: number;
  bodySwing: number;
  armDraw: number;
  bladeDepth: number;
  bladeFeather: number;
  surge: number;
  vertical: number;
}

/** Normalised SkiErg pose channels. Main joint channels are in the 0..1 range. */
export interface SkierKinematics {
  armPress: number;
  hipHinge: number;
  kneeFlex: number;
  poleContact: number;
  poleSweep: number;
  rebound: number;
  surge: number;
}

/** Bike crank angle and restrained secondary joint rotations, all in radians. */
export interface BikeKinematics {
  crankAngle: number;
  torsoSway: number;
  hipRock: number;
  anklePitchLeft: number;
  anklePitchRight: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Smoothstep (cubic Hermite). Flatter at the ends than a pure linear ramp, but
 * less "sticky" than quintic smootherstep — the drive still punches rather than
 * hanging at the catch for a beat.
 */
function smoothstep(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

/** Ease-out cubic for contact accents that may commit sharply. */
function easeOutCubic(value: number): number {
  const x = clamp01(value);
  return 1 - (1 - x) ** 3;
}

/**
 * Front-loaded but C1-continuous drive curve for articulated joints.  Feeding
 * an ease-out quadratic through smoothstep gives the stroke early intent while
 * retaining zero velocity at both ends; a plain ease-out cubic snapped from a
 * stationary recovery into non-zero joint velocity at the catch.
 */
function athleticDrive(value: number): number {
  const x = clamp01(value);
  return smoothstep(x * (2 - x));
}

/** Ease-in-out cubic for recovery: controlled, unhurried return. */
function easeInOutCubic(value: number): number {
  const x = clamp01(value);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function stage(
  progress: number,
  start: number,
  end: number,
  ease: (t: number) => number = smoothstep,
): number {
  return ease((progress - start) / Math.max(0.0001, end - start));
}

function secondaryScale(intensity: number): number {
  // Effort may make the athlete look a little more dynamic, but never changes
  // the authored range of motion or the order of the joint sequence. Keep the
  // scale ≤ 1 so surge/vertical channels stay inside the documented −1..1 band.
  return 0.9 + clamp01(intensity) * 0.1;
}

/**
 * Legs, then body, then arms on the drive; hands, body, then slide on recovery.
 * Overlap is deliberate so the stroke reads as one continuous athletic action
 * rather than three queued puppets. The ordering and range of motion remain
 * stable when power or rate changes.
 */
export function solveRowerKinematics(
  pose: StrokePose,
  output: RowerKinematics = {
    legExtension: 0,
    bodySwing: 0,
    armDraw: 0,
    bladeDepth: 0,
    bladeFeather: 0,
    surge: 0,
    vertical: 0,
  },
): RowerKinematics {
  const effort = secondaryScale(pose.intensity);
  let legExtension: number;
  let bodySwing: number;
  let armDraw: number;
  let bladeDepth: number;
  let bladeFeather: number;

  if (pose.drive) {
    const p = pose.driveProgress;
    // Legs commit first and hard; body opens through mid-drive; arms finish.
    legExtension = stage(p, 0, 0.55, athleticDrive);
    bodySwing = stage(p, 0.18, 0.78, athleticDrive);
    armDraw = stage(p, 0.48, 1, athleticDrive);
    // Blade buries immediately at the catch and extracts late in the drive.
    bladeDepth = stage(p, 0, 0.06, easeOutCubic) * (1 - stage(p, 0.82, 1, smoothstep));
    bladeFeather = 0;
  } else {
    const p = pose.recoveryProgress;
    // Hands away first, body follows, legs fold last — classic recovery order.
    armDraw = 1 - stage(p, 0, 0.34, easeInOutCubic);
    bodySwing = 1 - stage(p, 0.12, 0.62, easeInOutCubic);
    legExtension = 1 - stage(p, 0.32, 1, easeInOutCubic);
    bladeDepth = 0;
    // Feather early, stay flat through the slide, square just before the catch.
    bladeFeather = stage(p, 0, 0.1, smoothstep) * (1 - stage(p, 0.72, 1, easeOutCubic));
  }

  output.legExtension = legExtension;
  output.bodySwing = bodySwing;
  output.armDraw = armDraw;
  output.bladeDepth = bladeDepth;
  output.bladeFeather = bladeFeather;
  // Surge peaks through mid-drive and checks hard at the catch.
  output.surge = strokeSurge(pose.warpedPhase) * effort;
  // Catch compression is front-loaded so the shell visibly loads, then lifts
  // through the finish rather than bobbing as a pure sine.
  const verticalWave = Math.sin(pose.warpedPhase);
  const catchLoad = pose.drive ? 1 - athleticDrive(pose.driveProgress) : 0;
  output.vertical = Math.max(-1, Math.min(1, (verticalWave * 0.72 - catchLoad * 0.45) * effort));
  return output;
}

/** Coordinated double-pole press followed by a light, springy recovery. */
export function solveSkierKinematics(
  pose: StrokePose,
  output: SkierKinematics = {
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
    rebound: 0,
    surge: 0,
  },
): SkierKinematics {
  const effort = secondaryScale(pose.intensity);
  let armPress: number;
  let hipHinge: number;
  let kneeFlex: number;
  let poleContact: number;
  let poleSweep: number;
  let rebound: number;

  if (pose.drive) {
    const p = pose.driveProgress;
    armPress = stage(p, 0, 0.72, athleticDrive);
    hipHinge = stage(p, 0.04, 0.7, athleticDrive);
    kneeFlex = stage(p, 0.12, 0.8, athleticDrive);
    // Plant is brief and decisive, but its endpoint velocity must be zero: a
    // hard ease-out makes a visible snap when the basket meets or leaves the
    // snow. The pole stays loaded through the main press, then releases before
    // recovery begins so the 3D contact solver can lift it continuously.
    poleContact = stage(p, 0.01, 0.08, smoothstep) * (1 - stage(p, 0.72, 0.88, smoothstep));
    poleSweep = stage(p, 0.02, 0.95, easeOutCubic);
    rebound = 0;
  } else {
    const p = pose.recoveryProgress;
    armPress = 1 - stage(p, 0, 0.45, easeInOutCubic);
    hipHinge = 1 - stage(p, 0.06, 0.58, easeInOutCubic);
    kneeFlex = 1 - stage(p, 0.12, 0.68, easeInOutCubic);
    poleContact = 0;
    poleSweep = 1 - stage(p, 0, 0.55, easeInOutCubic);
    // Springy upright rebound peaks mid-recovery.
    rebound = Math.sin(Math.PI * clamp01(p)) * effort;
  }

  output.armPress = armPress;
  output.hipHinge = hipHinge;
  output.kneeFlex = kneeFlex;
  output.poleContact = poleContact;
  output.poleSweep = poleSweep;
  // Recovery rebound is the only vertical cue; keep it in 0..1 after effort.
  output.rebound = clamp01(rebound);
  // Check at plant, then run through the double-pole press.
  output.surge = strokeSurge(pose.warpedPhase) * effort;
  return output;
}

/** Continuous pedalling with opposite ankle articulation and subtle upper-body motion. */
export function solveBikeKinematics(
  pose: StrokePose,
  output: BikeKinematics = {
    crankAngle: 0,
    torsoSway: 0,
    hipRock: 0,
    anklePitchLeft: 0,
    anklePitchRight: 0,
  },
): BikeKinematics {
  const crankAngle = ((pose.phase % TAU) + TAU) % TAU;
  const effort = secondaryScale(pose.intensity);
  output.crankAngle = crankAngle;
  // Still restrained — bikes don't thrash — but readable at a glance from the
  // overview and chase cameras without looking like a rodeo. Ankle amplitude
  // stays under the contact-lock envelope used by the 3D pedal solve.
  output.torsoSway = Math.sin(crankAngle) * 0.068 * effort;
  output.hipRock = Math.sin(crankAngle * 2) * 0.036 * effort;
  output.anklePitchLeft = -0.05 + Math.sin(crankAngle) * 0.175;
  output.anklePitchRight = -0.05 + Math.sin(crankAngle + Math.PI) * 0.175;
  return output;
}
