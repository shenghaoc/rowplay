import {
  createBikeMotionGraphScratch,
  createRowerMotionGraphScratch,
  createSkierMotionGraphScratch,
  sampleBikeMotionGraphInto,
  sampleRowerMotionGraphInto,
  sampleSkierMotionGraphInto,
  SKI_POLE_OFF_CYCLE,
} from "./motionGraph";
import type { StrokePose } from "./strokeModel";

// Compatibility projections are invoked by the Canvas renderer on every live
// and ghost frame. Keep one graph frame per sport here, then copy only the
// legacy scalar channels into the caller-owned output below.
const ROW_GRAPH_SCRATCH = createRowerMotionGraphScratch();
const SKI_GRAPH_SCRATCH = createSkierMotionGraphScratch();
const BIKE_GRAPH_SCRATCH = createBikeMotionGraphScratch();

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
  /** Canonical full-cycle phase in [0, 1). */
  cycle: number;
  armPress: number;
  hipHinge: number;
  kneeFlex: number;
  poleContact: number;
  poleSweep: number;
  /** Early flexion cue used to keep the elbow on its anatomical branch. */
  elbowLoad: number;
  /** Long-arm cue from late press through early recovery. */
  armExtension: number;
  /** Lifted basket recovery cue; zero at pole-off and the next plant. */
  poleLift: number;
  /** Free-flight weight, C2-eased away from and back to the snow anchor. */
  poleFlight: number;
  rebound: number;
  surge: number;
}

/**
 * Phase-continuous SkiErg elbow-plane direction.
 *
 * These are semantic directions rather than measured joint angles: the elbow
 * points down at the high plant, rotates behind the shoulder during the loaded
 * press, then returns underneath the rising/forward-travelling arms before the
 * next plant. Negative `vertical` points down, negative `foreAft` points back.
 */
export interface SkierElbowDirection {
  vertical: number;
  foreAft: number;
}

/** Bike crank angle and restrained secondary joint rotations, all in radians. */
export interface BikeKinematics {
  crankAngle: number;
  torsoSway: number;
  hipRock: number;
  anklePitchLeft: number;
  anklePitchRight: number;
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function secondaryScale(intensity: number): number {
  const normalized = Number.isFinite(intensity) ? clampUnit(intensity) : 0.5;
  // Logged effort may make secondary motion more legible, but must not change
  // the authored technique sequence, contact paths, or pose limits.
  return 0.9 + normalized * 0.1;
}

/**
 * Resolve the shared down → back → recovery → down SkiErg elbow sequence.
 *
 * The bend vector follows one continuous arc in the sagittal plane. During
 * contact, `poleSweep` turns it from down toward back. After pole-off, the same
 * C2 channel takes the shortest sagittal arc back underneath the recovering
 * arm. Following the circle avoids interpolating through a zero vector, which
 * would make a two-bone solver choose a lateral fallback and flip.
 */
export function solveSkierElbowDirection(
  kinematics: SkierKinematics,
  output: SkierElbowDirection = { vertical: -1, foreAft: 0 },
): SkierElbowDirection {
  const sweep = clampUnit(kinematics.poleSweep);
  const angle =
    kinematics.cycle <= SKI_POLE_OFF_CYCLE
      ? Math.PI + sweep * (Math.PI / 2)
      : Math.PI * 1.5 - (1 - sweep) * (Math.PI / 2);
  output.vertical = Math.cos(angle);
  output.foreAft = Math.sin(angle);
  return output;
}

/**
 * Compatibility projection for renderers that consume the legacy compact
 * channels. The ReplayMotionGraph is now the single source of choreography;
 * these names keep Canvas and the contact-safe Three rig on the same poses
 * while allowing them to adopt its richer skeleton/constraint cues incrementally.
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
  const graph = sampleRowerMotionGraphInto(pose, ROW_GRAPH_SCRATCH);
  output.legExtension = graph.body.legExtension.value;
  output.bodySwing = graph.body.spineHinge.value;
  output.armDraw = graph.body.armDraw.value;
  output.bladeDepth = graph.contacts.bladeWater.value;
  output.bladeFeather = graph.contacts.bladeFeather.value;
  output.surge = graph.accents.surge.value;
  output.vertical = graph.accents.vertical.value;
  return output;
}

/** Shared SkiErg projection; pole contact remains a C2 plant/release envelope. */
export function solveSkierKinematics(
  pose: StrokePose,
  output: SkierKinematics = {
    cycle: 0,
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
    elbowLoad: 0,
    armExtension: 0,
    poleLift: 0,
    poleFlight: 0,
    rebound: 0,
    surge: 0,
  },
): SkierKinematics {
  const graph = sampleSkierMotionGraphInto(pose, SKI_GRAPH_SCRATCH);
  output.cycle = graph.timing.cycle;
  output.armPress = graph.body.armPress.value;
  output.hipHinge = graph.body.pelvisHinge.value;
  output.kneeFlex = graph.body.kneeFlex.value;
  output.poleContact = graph.contacts.polePlant.value;
  output.poleSweep = graph.body.poleSweep.value;
  output.elbowLoad = graph.body.elbowLoad.value;
  output.armExtension = graph.body.armExtension.value;
  output.poleLift = graph.body.poleLift.value;
  output.poleFlight = graph.body.poleFlight.value;
  output.rebound = graph.accents.rebound.value;
  output.surge = graph.accents.surge.value;
  return output;
}

/**
 * Shared BikeErg projection. The graph provides continuous circular pedal
 * state; this adapter preserves the current equipment-safe visual ranges while
 * giving both renderers the same cadence, pedal opposition, and ankle timing.
 */
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
  const graph = sampleBikeMotionGraphInto(pose, BIKE_GRAPH_SCRATCH);
  const effort = secondaryScale(pose.intensity);
  output.crankAngle = graph.crank.angle;
  // Keep the road-bike posture controlled at all cadences. The graph's larger
  // coordinate-neutral values are intentionally projected into the existing
  // world-space contact envelope instead of making the rider thrash.
  output.torsoSway = graph.body.torsoSway.value * 0.34 * effort;
  output.hipRock = graph.body.pelvisRock.value * 0.3 * effort;
  output.anklePitchLeft = -0.05 + graph.leftPedal.ankleFlex.value * 0.3;
  output.anklePitchRight = -0.05 + graph.rightPedal.ankleFlex.value * 0.3;
  return output;
}
