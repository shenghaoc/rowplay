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

/** Quintic smoothstep with zero velocity and acceleration at both ends. */
function smootherstep(value: number): number {
  const x = clamp01(value);
  return clamp01(x * x * x * (x * (x * 6 - 15) + 10));
}

function stage(progress: number, start: number, end: number): number {
  return smootherstep((progress - start) / Math.max(0.0001, end - start));
}

function secondaryScale(intensity: number): number {
  // Effort may make the athlete look a little more dynamic, but never changes
  // the authored range of motion or the order of the joint sequence.
  return 0.9 + clamp01(intensity) * 0.1;
}

/**
 * Legs, then body, then arms on the drive; hands, body, then slide on recovery.
 * The ordering and range of motion remain stable when power or rate changes.
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
    legExtension = stage(p, 0, 0.58);
    bodySwing = stage(p, 0.28, 0.84);
    armDraw = stage(p, 0.58, 1);
    bladeDepth = stage(p, 0, 0.08) * (1 - stage(p, 0.9, 1));
    bladeFeather = 0;
  } else {
    const p = pose.recoveryProgress;
    armDraw = 1 - stage(p, 0, 0.3);
    bodySwing = 1 - stage(p, 0.16, 0.58);
    legExtension = 1 - stage(p, 0.4, 1);
    bladeDepth = 0;
    bladeFeather = stage(p, 0, 0.12) * (1 - stage(p, 0.78, 1));
  }

  output.legExtension = legExtension;
  output.bodySwing = bodySwing;
  output.armDraw = armDraw;
  output.bladeDepth = bladeDepth;
  output.bladeFeather = bladeFeather;
  output.surge = strokeSurge(pose.warpedPhase) * effort;
  output.vertical = Math.sin(pose.warpedPhase) * effort;
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
    armPress = stage(p, 0, 0.78);
    hipHinge = stage(p, 0.08, 0.76);
    kneeFlex = stage(p, 0.2, 0.84);
    poleContact = stage(p, 0, 0.06) * (1 - stage(p, 0.84, 1));
    poleSweep = stage(p, 0.04, 0.92);
    rebound = 0;
  } else {
    const p = pose.recoveryProgress;
    armPress = 1 - stage(p, 0, 0.42);
    hipHinge = 1 - stage(p, 0.08, 0.62);
    kneeFlex = 1 - stage(p, 0.16, 0.72);
    poleContact = 0;
    poleSweep = 1 - stage(p, 0, 0.5);
    rebound = Math.sin(Math.PI * clamp01(p)) * effort;
  }

  output.armPress = armPress;
  output.hipHinge = hipHinge;
  output.kneeFlex = kneeFlex;
  output.poleContact = poleContact;
  output.poleSweep = poleSweep;
  output.rebound = rebound;
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
  output.torsoSway = Math.sin(crankAngle) * 0.035 * effort;
  output.hipRock = Math.sin(crankAngle * 2) * 0.018 * effort;
  output.anklePitchLeft = -0.04 + Math.sin(crankAngle) * 0.11;
  output.anklePitchRight = -0.04 + Math.sin(crankAngle + Math.PI) * 0.11;
  return output;
}
