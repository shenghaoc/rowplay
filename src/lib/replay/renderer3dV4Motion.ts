import * as THREE from "three";
import type { Sport } from "../types";
import type { RenderQuality } from "./replayRenderer";
import { solveTwoBone3D } from "./figurePose";
import {
  collectHandDigitChains,
  HAND_CLOSURE_CUP,
  handCurlAxis,
  solveHandGripClosure,
  type HandDigitContactReport,
  type HandGripSurface,
} from "./handGrip";
import {
  disposeReplayV4AthleteInstance,
  REPLAY_V4_HAND_HELPER_NAMES,
  REPLAY_V4_SURFACE_ROLES,
  type ReplayV4AthleteInstance,
  type ReplayV4EffectorName,
  type ReplayV4HandHelperName,
  type ReplayV4SurfaceRole,
} from "./renderer3dV4Assets";

const TAU = Math.PI * 2;
const TRANSFORM_EPSILON = 1e-8;

/**
 * The authored clip owns the base performance, but rigid sport equipment owns
 * every terminal contact. The post-clip pass may rotate the two links of a
 * limb through their full reachable envelope; it never moves an oar grip,
 * stretches a ski pole, or lets a shoe leave its pedal to preserve a clip.
 * RowErg and SkiErg use the shared technique rig's elbow markers because their
 * rigid hand contacts admit two mathematically valid but anatomically opposite
 * solutions. The markers keep a rowing draw rearward and a SkiErg pull in its
 * sagittal plane; mechanically solved BikeErg knee targets choose the correct
 * leg branch. The authored clips still own the unconstrained base performance.
 */
const ARM_SOFT_ANGLE_RAD = THREE.MathUtils.degToRad(8);
const LEG_SOFT_ANGLE_RAD = THREE.MathUtils.degToRad(18);
/** Below this residual only terminal orientation needs attention. */
const CONTACT_DEADZONE_M = 0.000_05;
const SOFT_ANGLE_DEADZONE = THREE.MathUtils.degToRad(1.5);

/**
 * Radians of local curl applied to finger/thumb helpers after contact.
 * Strong enough that open mittens read as a closed grip on sculls, poles,
 * and hoods once the terminal hand is oriented to the equipment.
 */
export type ReplayV4GripCurlConfig = {
  readonly fingerCup: number;
  readonly fingerProximal: number;
  readonly fingerIntermediate: number;
  readonly fingerDistal: number;
  readonly thumbOppose: number;
  readonly thumbProximal: number;
  readonly thumbIntermediate: number;
  readonly thumbDistal: number;
};

type ReplayV4GripHelperStage = "cup" | "proximal" | "intermediate" | "distal";
type ReplayV4GripDigit = "index" | "middle" | "ring" | "pinky" | "thumb";

const GRIP_CURL_BY_SPORT: Readonly<Record<Sport, ReplayV4GripCurlConfig>> = {
  // RowErg stays relaxed at the MCP joint but closes firmly at PIP/DIP around
  // the narrow scull handle. SkiErg is the firmest cylindrical grip. BikeErg
  // still uses a restrained hood grip, but every finger must visibly enclose
  // the bar; the authored cockpit has no brake lever that would justify an
  // extended index finger.
  rower: {
    fingerCup: 0.08,
    fingerProximal: 0.75,
    fingerIntermediate: 1.25,
    fingerDistal: 0.7,
    thumbOppose: 0.82,
    thumbProximal: 0.42,
    thumbIntermediate: 0.72,
    thumbDistal: 0.44,
  },
  skierg: {
    // Thin pole shaft needs a clear wrap, so the fingers curl further than the
    // other two sports. Thumb stays mostly up the pole (light opposition) so it
    // does not fold across the knuckles. Verified on the macro grip camera —
    // see docs/visual-qa/replay-ski-equipment.md.
    fingerCup: 0.14,
    fingerProximal: 1.15,
    fingerIntermediate: 1.55,
    fingerDistal: 1.0,
    thumbOppose: 0.4,
    thumbProximal: 0.35,
    thumbIntermediate: 0.5,
    thumbDistal: 0.35,
  },
  bike: {
    fingerCup: 0.1,
    fingerProximal: 0.95,
    fingerIntermediate: 1.45,
    fingerDistal: 0.85,
    thumbOppose: 0.92,
    thumbProximal: 0.5,
    thumbIntermediate: 0.82,
    thumbDistal: 0.52,
  },
};

const FINGER_CURL_SCALE: Readonly<Record<Exclude<ReplayV4GripDigit, "thumb">, number>> = {
  index: 0.92,
  middle: 1,
  ring: 1.05,
  pinky: 1.1,
};

function gripHelperMeta(name: ReplayV4HandHelperName): {
  readonly side: -1 | 1;
  readonly digit: ReplayV4GripDigit | null;
  readonly stage: ReplayV4GripHelperStage;
} {
  const side = name.includes("Left") ? -1 : 1;
  if (name.endsWith("Fingers")) return { side, digit: null, stage: "cup" };
  const digit = name.includes("Index")
    ? "index"
    : name.includes("Middle")
      ? "middle"
      : name.includes("Ring")
        ? "ring"
        : name.includes("Pinky")
          ? "pinky"
          : "thumb";
  const stage = name.endsWith("Distal")
    ? "distal"
    : name.endsWith("Intermediate")
      ? "intermediate"
      : "proximal";
  return { side, digit, stage };
}

/**
 * Geometry-aware grip contract supplied by the sport rig. When present, the
 * digit helpers are closed against this analytic surface at install time
 * (curl angles become outputs of the equipment geometry), terminal hands
 * adopt the full equipment grip frame, and wrist twist is distributed into
 * the forearm under anatomical budgets. Without it the controller keeps the
 * fixed-curl fallback used by instances whose sport layer does not yet supply
 * a geometry contract.
 */
export interface ReplayV4HandGripContract extends HandGripSurface {
  /** Base thumb opposition (rad) bringing the thumb across the channel. */
  readonly thumbOppose: number;
  /** Far-side enclosure for palm-supported grips such as brake hoods. */
  readonly wrapFingerStages?: boolean;
}

/**
 * Wrist animation-safety budgets, relative to a derived flat-wrist reference.
 *
 * Twist beyond the wrist's 75° pronation/supination share is redistributed
 * into the forearm (the anatomically correct place for it) rather than
 * discarded, so the equipment frame is preserved while the wrist stays
 * plausible. The swing guards are calibrated from the shipped rig's own
 * measured demand envelope rather than textbook joint ranges: the authored
 * hand bone's origin and metacarpal arch put its geometric axes ~40–60° from
 * the visual flat-hand impression, so healthy sport frames measure up to
 * ~100° flexion / ~100° deviation in bone terms while looking like a normal
 * working wrist (the shipped, visually accepted SkiErg frames sit exactly in
 * that band). The guards therefore sit well above the legitimate envelope
 * and exist to reject the 180° palm/wrist flip class of solution outright;
 * the per-sport envelopes themselves are pinned by the grip tests through
 * `getWristMetrics`. These are animation limits, not medical claims.
 */
export const REPLAY_V4_WRIST_TWIST_BUDGET = THREE.MathUtils.degToRad(75);
export const REPLAY_V4_WRIST_FLEXION_BUDGET = THREE.MathUtils.degToRad(150);
export const REPLAY_V4_WRIST_DEVIATION_BUDGET = THREE.MathUtils.degToRad(150);

/**
 * SkiErg-specific wrist twist keep-cap.
 *
 * The ski clip's hand tracks are now authored on the pole-grip branch, so
 * the runtime no longer has a half-turn to redistribute (the former
 * `alignSkiArmPronation` pre-roll is deleted). What remains is ordinary
 * pronation demand as the forearm swings against a pole-locked hand: the
 * wrist keeps this much and `distributeSkiElbowTwist` moves the elbow-seam
 * excess into shoulder internal rotation. History pins the value from both
 * sides — the generic 75° budget corkscrewed the wrist (and its
 * near-half-turn residual flipped the twist⁄swing decomposition, a measured
 * 149° single-sample forearm snap), while a 0° keep pushed the whole delta
 * into the forearm and tore the wrist ring open.
 */
export const REPLAY_V4_SKI_WRIST_TWIST_KEEP = THREE.MathUtils.degToRad(30);

/**
 * Share of the residual SkiErg pronation carried as shoulder internal
 * rotation rather than forearm roll (see `distributeSkiElbowTwist`).
 * Spreading it across both joints keeps every skin seam inside an
 * authorable range instead of wringing one of them with the full amount.
 */
export const REPLAY_V4_SKI_PRONATION_SHOULDER_SHARE = 0.5;

/** Per-hand wrist metrics after the latest constrained solve (radians). */
export interface ReplayV4WristMetrics {
  /** Pronation/supination the wrist itself carries relative to rest. */
  twist: number;
  /** Flexion/extension the wrist carries about the curl axis. */
  flexion: number;
  /** Radial/ulnar deviation the wrist carries. */
  deviation: number;
  /** Axial rotation redistributed into the forearm this frame. */
  forearmTwist: number;
  /** Swing the clamp removed (0 while the grip frame is anatomically fine). */
  clampedSwing: number;
}

/** Diagnostic overlay modes for isolation of defects (PROMPT 9). */
export type ReplayV4DiagnosticMode =
  | "off"
  | "clip-only"
  | "clip-pelvis"
  | "clip-hands"
  | "full"
  | "skeleton"
  | "skin-weights"
  | "normals"
  | "unlit"
  | "shadows"
  | "wireframe";

/** Equipment contacts plus sport-specific anatomical branch targets. */
export interface ReplayV4ContactTargets {
  readonly pelvis: THREE.Object3D;
  readonly leftHand: THREE.Object3D;
  readonly rightHand: THREE.Object3D;
  readonly leftElbow: THREE.Object3D;
  readonly rightElbow: THREE.Object3D;
  readonly leftFoot: THREE.Object3D;
  readonly rightFoot: THREE.Object3D;
  readonly leftKnee: THREE.Object3D;
  readonly rightKnee: THREE.Object3D;
}

/** Narrow structural subset of StrokePose consumed by deterministic clip seeking. */
export interface ReplayV4MotionSample {
  readonly phase: number;
  readonly cycleFrac?: number;
  readonly driveFrac?: number;
}

export interface ReplayV4Offset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type ReplayV4EffectorOffsetOverrides = Readonly<
  Partial<Record<ReplayV4EffectorName, ReplayV4Offset>>
>;

export interface ReplayV4MotionInstallOptions {
  readonly sport: Sport;
  /** Athlete-local parent. Course/lane transforms remain outside this node. */
  readonly parent: THREE.Object3D;
  /** Root inspected once for procedural athlete nodes to hide after first valid solve. */
  readonly fallbackRoot?: THREE.Object3D;
  /** Ownership transfers to the controller on a successful install attempt. */
  readonly instance: ReplayV4AthleteInstance | null | undefined;
  readonly targets: ReplayV4ContactTargets;
  readonly opacity?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  /** Athlete-specific material response; independent from environment density. */
  readonly quality?: RenderQuality;
  /** Subtle tint blended into the asset's vertex colours; use white for live. */
  readonly laneColor?: THREE.ColorRepresentation;
  /** Optional bone-local overrides for authored palm/sole contact extras. */
  readonly effectorOffsets?: ReplayV4EffectorOffsetOverrides;
  /** Geometry-aware grip solve; omitted → legacy fixed-curl fallback. */
  readonly gripContract?: ReplayV4HandGripContract;
  /** Isolation mode for visual QA; default full contact-constrained solve. */
  readonly diagnosticMode?: ReplayV4DiagnosticMode;
  /**
   * Seat contract for machines the athlete sits **on** rather than in, where
   * the hip bone is not the contact surface. Supplying it enables the sit
   * correction; omitting it leaves the pelvis exactly on its target.
   *
   * All values are in the install `parent`'s local space, which is why the
   * caller owns them: the controller has no knowledge of any machine's frame.
   */
  readonly seatContract?: ReplayV4SeatContract;
}

/** Where the seat is, and how far the posterior skin trails the hip bone. */
export interface ReplayV4SeatContract {
  /** Pad top plane in parent-local space. */
  readonly padTopY: number;
  /** Signed offset from the hip bone to the lowest sit surface (negative). */
  readonly sitSurfaceOffsetY: number;
  /** How far the sit surface may sink into a soft pad. */
  readonly nestle: number;
  /** Largest correction accepted before the fit is considered broken. */
  readonly maxLift: number;
}

export interface ReplayV4MotionController {
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  readonly enabled: boolean;
  /**
   * Samples the authored clip and aligns its pelvis, but deliberately leaves
   * terminal contacts open. The renderer can use the sampled shoulder roots
   * to refine rigid RowErg grip geometry before the final contact pass.
   */
  prepare(sample: ReplayV4MotionSample): boolean;
  /** Applies the restrained terminal hand rotation before grip-path refinement. */
  orientHandsToTargets(): boolean;
  /**
   * Closes only the prepared arm chains without consuming the sampled pose.
   * RowErg uses this once between rigid-oar refinement passes so the final
   * equipment solve can observe the arm's real post-IK wrist frame.
   */
  settleHandContacts(): boolean;
  /** Restores the arm pose captured immediately before `settleHandContacts`. */
  restoreHandPoseAfterSettle(): boolean;
  /** Closes the prepared pose onto the latest equipment-contact targets. */
  constrain(): boolean;
  /**
   * Convenience one-shot path retained for isolated controller consumers.
   * The replay renderer uses prepare/refine/constrain so a rigid RowErg grip
   * can be solved from the visible skinned shoulder rather than a fallback.
   */
  update(sample: ReplayV4MotionSample): boolean;
  /** World-space shoulder joint after the latest successful prepare. */
  getShoulderWorld(side: "left" | "right", output?: THREE.Vector3): THREE.Vector3;
  /** World-space knee target for the prepared contact-constrained leg. */
  getLegJointTargetWorld(side: "left" | "right", output?: THREE.Vector3): THREE.Vector3;
  /** World-space wrist→palm contact vector after the latest prepare. */
  getHandContactOffsetWorld(side: "left" | "right", output?: THREE.Vector3): THREE.Vector3;
  /** Structural shoulder→wrist reach, excluding the terminal palm offset. */
  getArmReach(side: "left" | "right"): number;
  /** Restores the exact fallback visibility snapshot and releases lane-owned resources. */
  dispose(): void;
  /** Switch diagnostic isolation mode without reinstalling the hero. */
  setDiagnosticMode(mode: ReplayV4DiagnosticMode): void;
  /** World-space palm/sole contact point after the last constrained update. */
  getContactWorld(name: ReplayV4EffectorName, output?: THREE.Vector3): THREE.Vector3;
  /** Solved digit-contact report per side; empty without a grip contract. */
  getGripContacts(side: "left" | "right"): readonly HandDigitContactReport[];
  /** Wrist twist/swing carried after the latest constrain (per side). */
  getWristMetrics(side: "left" | "right"): ReplayV4WristMetrics;
}

interface FallbackVisibility {
  readonly object: THREE.Object3D;
  readonly visible: boolean;
}

interface ChainBinding {
  /** -1 port / left, +1 starboard / right in athlete-local space. */
  readonly side: -1 | 1;
  readonly upper: THREE.Bone;
  readonly middle: THREE.Bone;
  readonly effector: THREE.Bone;
  readonly target: THREE.Object3D;
  /** Mechanically solved branch marker; used for BikeErg knees and SkiErg elbows. */
  readonly jointTarget: THREE.Object3D;
  readonly offset: THREE.Vector3;
  /** True for hip→knee→foot chains; false for shoulder→elbow→hand. */
  readonly isLeg: boolean;
}

interface BoneRotationSnapshot {
  readonly bone: THREE.Bone;
  readonly quaternion: THREE.Quaternion;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function finiteVector(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function finiteQuaternion(value: THREE.Quaternion): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  );
}

function wrapUnit(value: number): number {
  const wrapped = value - Math.floor(value);
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function clipFraction(
  sample: ReplayV4MotionSample,
  sourceDriveEnd: number,
  authoredDriveEnd: number,
): number {
  const phaseCycle = wrapUnit(finite(sample.phase, 0) / TAU);
  const cycle = Number.isFinite(sample.cycleFrac)
    ? wrapUnit(sample.cycleFrac as number)
    : phaseCycle;
  const sourceDrive = THREE.MathUtils.clamp(finite(sourceDriveEnd, 0.4), 0.05, 0.95);
  const clipDrive = THREE.MathUtils.clamp(finite(authoredDriveEnd, 0.5), 0.05, 0.95);
  if (cycle < sourceDrive) return (cycle / sourceDrive) * clipDrive;
  return clipDrive + ((cycle - sourceDrive) / (1 - sourceDrive)) * (1 - clipDrive);
}

function isProceduralAthleteNode(object: THREE.Object3D): boolean {
  const slot: unknown = object.userData.replayAssetSlot;
  return (
    (typeof slot === "string" && slot.startsWith("athlete:")) ||
    object.userData.hideWithReplayAssets === true ||
    object.name.startsWith("athlete:") ||
    object.name === "skierg-headband"
  );
}

function collectFallbackVisibility(root: THREE.Object3D): FallbackVisibility[] {
  const fallback: FallbackVisibility[] = [];
  root.traverse((object) => {
    if (object !== root && isProceduralAthleteNode(object)) {
      fallback.push({ object, visible: object.visible });
    }
  });
  return fallback;
}

function setFallbackVisibility(fallback: readonly FallbackVisibility[], hidden: boolean): void {
  for (const state of fallback) state.object.visible = hidden ? false : state.visible;
}

interface SurfaceQualityProfile {
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly sheen: number;
  readonly sheenRoughness: number;
  readonly sheenColor: THREE.ColorRepresentation;
  readonly specularIntensity: number;
}

type SurfaceQualityProfiles = Readonly<Record<ReplayV4SurfaceRole, SurfaceQualityProfile>>;

/**
 * Quality changes are deliberately concentrated on the visible athlete.
 * Every tier shares the same geometry and contact solve; increasing quality
 * improves distinct skin, cloth, footwear, hair, and trim response rather
 * than spending all extra work on DPR or the distant venue.
 */
const ATHLETE_SURFACE_QUALITY: Readonly<Record<RenderQuality, SurfaceQualityProfiles>> = {
  low: {
    skin: {
      roughness: 0.78,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.7,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.55,
    },
    jersey: {
      roughness: 0.94,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.8,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.45,
    },
    lower: {
      roughness: 0.92,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.8,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.45,
    },
    footwear: {
      roughness: 0.78,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.7,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.55,
    },
    hair: {
      roughness: 0.8,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.75,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.36,
    },
    trim: {
      roughness: 0.7,
      metalness: 0.02,
      clearcoat: 0.01,
      clearcoatRoughness: 0.6,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.6,
    },
    eye: {
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.34,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.82,
    },
    "face-detail": {
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.7,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.5,
    },
  },
  medium: {
    skin: {
      roughness: 0.66,
      metalness: 0,
      clearcoat: 0.015,
      clearcoatRoughness: 0.55,
      sheen: 0.025,
      sheenRoughness: 0.72,
      sheenColor: 0xffd8cf,
      specularIntensity: 0.7,
    },
    jersey: {
      roughness: 0.86,
      metalness: 0,
      clearcoat: 0.005,
      clearcoatRoughness: 0.65,
      sheen: 0.08,
      sheenRoughness: 0.68,
      sheenColor: 0xc7d2fe,
      specularIntensity: 0.56,
    },
    lower: {
      roughness: 0.82,
      metalness: 0,
      clearcoat: 0.005,
      clearcoatRoughness: 0.62,
      sheen: 0.075,
      sheenRoughness: 0.7,
      sheenColor: 0xd3eef5,
      specularIntensity: 0.6,
    },
    footwear: {
      roughness: 0.62,
      metalness: 0.01,
      clearcoat: 0.045,
      clearcoatRoughness: 0.48,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.72,
    },
    hair: {
      roughness: 0.78,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.62,
      sheen: 0.005,
      sheenRoughness: 0.8,
      sheenColor: 0x5b2815,
      specularIntensity: 0.42,
    },
    trim: {
      roughness: 0.54,
      metalness: 0.035,
      clearcoat: 0.07,
      clearcoatRoughness: 0.42,
      sheen: 0.06,
      sheenRoughness: 0.62,
      sheenColor: 0xe0dcff,
      specularIntensity: 0.74,
    },
    eye: {
      roughness: 0.25,
      metalness: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.24,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.94,
    },
    "face-detail": {
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.65,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 0.58,
    },
  },
  high: {
    skin: {
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.022,
      clearcoatRoughness: 0.46,
      sheen: 0.065,
      sheenRoughness: 0.56,
      sheenColor: 0xffcdc0,
      specularIntensity: 0.84,
    },
    jersey: {
      roughness: 0.78,
      metalness: 0,
      clearcoat: 0.01,
      clearcoatRoughness: 0.46,
      sheen: 0.18,
      sheenRoughness: 0.44,
      sheenColor: 0xbfc8ff,
      specularIntensity: 0.62,
    },
    lower: {
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.008,
      clearcoatRoughness: 0.44,
      sheen: 0.3,
      sheenRoughness: 0.48,
      sheenColor: 0xc5ebf3,
      specularIntensity: 0.8,
    },
    footwear: {
      roughness: 0.36,
      metalness: 0.03,
      clearcoat: 0.18,
      clearcoatRoughness: 0.28,
      sheen: 0.03,
      sheenRoughness: 0.64,
      sheenColor: 0xffffff,
      specularIntensity: 0.96,
    },
    hair: {
      roughness: 0.74,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.55,
      sheen: 0.015,
      sheenRoughness: 0.6,
      sheenColor: 0x77391d,
      specularIntensity: 0.46,
    },
    trim: {
      roughness: 0.32,
      metalness: 0.09,
      clearcoat: 0.24,
      clearcoatRoughness: 0.26,
      sheen: 0.18,
      sheenRoughness: 0.44,
      sheenColor: 0xe1dcff,
      specularIntensity: 1,
    },
    eye: {
      roughness: 0.17,
      metalness: 0,
      clearcoat: 0.26,
      clearcoatRoughness: 0.17,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 1.04,
    },
    "face-detail": {
      roughness: 0.52,
      metalness: 0,
      clearcoat: 0.015,
      clearcoatRoughness: 0.52,
      sheen: 0.01,
      sheenRoughness: 0.9,
      sheenColor: 0xffd8cf,
      specularIntensity: 0.74,
    },
  },
  ultra: {
    skin: {
      roughness: 0.43,
      metalness: 0,
      clearcoat: 0.035,
      clearcoatRoughness: 0.38,
      sheen: 0.095,
      sheenRoughness: 0.48,
      sheenColor: 0xffc2af,
      specularIntensity: 0.94,
    },
    jersey: {
      roughness: 0.74,
      metalness: 0,
      clearcoat: 0.012,
      clearcoatRoughness: 0.36,
      sheen: 0.26,
      sheenRoughness: 0.34,
      sheenColor: 0xb3c0ff,
      specularIntensity: 0.7,
    },
    lower: {
      roughness: 0.6,
      metalness: 0,
      clearcoat: 0.01,
      clearcoatRoughness: 0.34,
      sheen: 0.46,
      sheenRoughness: 0.38,
      sheenColor: 0xb0e2ee,
      specularIntensity: 0.92,
    },
    footwear: {
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.32,
      clearcoatRoughness: 0.2,
      sheen: 0.06,
      sheenRoughness: 0.52,
      sheenColor: 0xffffff,
      specularIntensity: 1.08,
    },
    hair: {
      roughness: 0.7,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.48,
      sheen: 0.025,
      sheenRoughness: 0.5,
      sheenColor: 0x96502a,
      specularIntensity: 0.5,
    },
    trim: {
      roughness: 0.2,
      metalness: 0.14,
      clearcoat: 0.38,
      clearcoatRoughness: 0.18,
      sheen: 0.28,
      sheenRoughness: 0.36,
      sheenColor: 0xe8e2ff,
      specularIntensity: 1.08,
    },
    eye: {
      roughness: 0.1,
      metalness: 0,
      clearcoat: 0.38,
      clearcoatRoughness: 0.11,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: 0xffffff,
      specularIntensity: 1.14,
    },
    "face-detail": {
      roughness: 0.46,
      metalness: 0,
      clearcoat: 0.025,
      clearcoatRoughness: 0.44,
      sheen: 0.02,
      sheenRoughness: 0.85,
      sheenColor: 0xffd8cf,
      specularIntensity: 0.82,
    },
  },
};

/**
 * Material-resolution work belongs to the athlete, not only the venue. Low
 * keeps the authored colour regions clean and inexpensive; Medium introduces
 * a restrained procedural relief map, then High and Ultra progressively make
 * cloth weave, skin, hair, footwear and trim read under moving light.
 */
const QUALITY_DETAIL_STRENGTH: Readonly<Record<RenderQuality, number>> = {
  low: 0,
  // Progressive ladder after the Phase-A form floor: Medium first reveals
  // weave and skin variation, High sharpens micro-contrast, Ultra spends the
  // largest GPU budget on both amplitude and map resolution. Strength is
  // normalized against the Ultra peak in albedo/normal/roughness sampling.
  medium: 0.055,
  high: 0.1,
  ultra: 0.15,
};

// Map resolution rises with the selected tier so each step spends GPU budget
// on concrete athlete detail rather than only venue density or DPR.
// 128 → 256 → 512 keeps Medium readable and makes Ultra a real material jump.
const QUALITY_DETAIL_TEXTURE_SIZE: Readonly<Record<RenderQuality, number>> = {
  low: 0,
  medium: 128,
  high: 256,
  ultra: 512,
};

/** Exported for tests — production path must keep this ladder frozen. */
export const REPLAY_V4_QUALITY_DETAIL_TEXTURE_SIZE = QUALITY_DETAIL_TEXTURE_SIZE;

/** Production finger helper names — shared with the sealed GLB contract. */
export { REPLAY_V4_HAND_HELPER_NAMES };

type SurfaceDetailMapKind = "albedo" | "bump" | "normal" | "roughness";

// Peak strength used to normalize albedo/normal/roughness contrast so Medium
// and High remain visibly below Ultra rather than saturating early.
const QUALITY_DETAIL_STRENGTH_PEAK = QUALITY_DETAIL_STRENGTH.ultra;

const SURFACE_DETAIL_MULTIPLIER: Readonly<Record<ReplayV4SurfaceRole, number>> = {
  skin: 0.62,
  jersey: 1,
  lower: 0.88,
  footwear: 0.8,
  hair: 0.48,
  trim: 0.62,
  eye: 0,
  "face-detail": 0.28,
};

const SURFACE_DETAIL_REPEAT: Readonly<Record<ReplayV4SurfaceRole, readonly [number, number]>> = {
  skin: [4, 4],
  jersey: [14, 12],
  lower: [12, 14],
  footwear: [10, 10],
  hair: [22, 6],
  trim: [18, 10],
  eye: [1, 1],
  "face-detail": [5, 5],
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Deterministic, source-owned relief maps. Shared per (quality, role, kind) so
 * live+ghost Ultra lanes do not rebuild 512² maps twice; refcounted dispose
 * keeps ownership correct when a lane is released or re-styled.
 * No network request, third-party bitmap, or texture-atlas contract is added.
 */
type SharedDetailMapKey = string;

const sharedDetailMaps = new Map<
  SharedDetailMapKey,
  { readonly texture: THREE.DataTexture; refCount: number }
>();

function sharedDetailMapKey(
  quality: RenderQuality,
  role: ReplayV4SurfaceRole,
  kind: SurfaceDetailMapKind,
): SharedDetailMapKey {
  return `${quality}|${role}|${kind}`;
}

function retainSharedDetailMap(
  quality: RenderQuality,
  role: ReplayV4SurfaceRole,
  kind: SurfaceDetailMapKind,
  strength: number,
  size: number,
): THREE.DataTexture {
  const key = sharedDetailMapKey(quality, role, kind);
  const existing = sharedDetailMaps.get(key);
  if (existing) {
    existing.refCount += 1;
    return existing.texture;
  }
  const texture = createSurfaceDetailMap(role, kind, strength, size);
  texture.userData.replayV4SharedDetailMapKey = key;
  sharedDetailMaps.set(key, { texture, refCount: 1 });
  return texture;
}

function releaseDetailMap(map: THREE.Texture): void {
  const key = map.userData.replayV4SharedDetailMapKey;
  if (typeof key !== "string") {
    map.dispose();
    return;
  }
  const entry = sharedDetailMaps.get(key);
  if (!entry) return;
  // Keep shared maps alive for the process lifetime so live+ghost restyles and
  // quality switches reuse Ultra 512² maps without rebuilding or double-free.
  entry.refCount = Math.max(0, entry.refCount - 1);
}

function detailSample(role: ReplayV4SurfaceRole, x: number, y: number): number {
  const grain = ((x * 29 + y * 17 + x * y * 7) % 17) - 8;
  const stripe = Math.sin((x + y * 0.24) * Math.PI * 0.72);
  switch (role) {
    case "jersey":
      return 126 + (x % 4 === 0 || y % 5 === 0 ? 28 : -10) + grain * 0.65;
    case "lower":
      return 126 + (x % 5 === 0 || (x + y) % 7 === 0 ? 22 : -9) + grain * 0.55;
    case "footwear":
      return 126 + (((x + y * 2) % 8 < 2 ? 24 : -12) + grain * 0.45);
    case "hair":
      return 126 + stripe * 31 + grain * 0.35;
    case "trim":
      return 126 + (x % 3 === 0 ? 24 : -12) + grain * 0.4;
    case "skin":
      return 126 + grain * 0.8 + Math.sin((x * 0.61 + y * 0.37) * Math.PI) * 4;
    case "eye":
      return 126;
    case "face-detail":
      return 126 + grain * 0.22;
  }
}

function detailStrengthNorm(strength: number): number {
  return THREE.MathUtils.clamp(strength / QUALITY_DETAIL_STRENGTH_PEAK, 0, 1);
}

function normalSample(
  role: ReplayV4SurfaceRole,
  x: number,
  y: number,
  strength: number,
  size: number,
) {
  const scale = detailStrengthNorm(strength) * 1.7;
  const current = detailSample(role, x, y);
  const dx = detailSample(role, (x + 1) % size, y) - current;
  const dy = detailSample(role, x, (y + 1) % size) - current;
  return {
    r: clampByte(128 - dx * scale),
    g: clampByte(128 - dy * scale),
    b: 255,
  };
}

function albedoSample(
  role: ReplayV4SurfaceRole,
  x: number,
  y: number,
  strength: number,
): { readonly r: number; readonly g: number; readonly b: number } {
  // The vertex palette remains the source of athlete identity; this merely
  // adds progressively clearer fabric, hair, and skin variation at replay
  // distance. Skin and hair need chromatic micro-variation to avoid the wax
  // figure read produced by a perfectly grey multiplier; kit stays neutral so
  // lane identity and the reviewed vertex palette remain authoritative.
  const contrast = detailStrengthNorm(strength) * 86;
  const variation = ((detailSample(role, x, y) - 126) / 42) * contrast;
  const speckle = ((x * 47 + y * 31 + x * y * 11) % 97) / 96;
  if (role === "skin") {
    const freckle = speckle > 0.92 ? -10 * detailStrengthNorm(strength) : 0;
    return {
      r: clampByte(246 + variation * 0.56 + freckle),
      g: clampByte(238 + variation * 0.34 + freckle * 0.72),
      b: clampByte(232 + variation * 0.2 + freckle * 0.52),
    };
  }
  if (role === "face-detail") {
    return {
      r: clampByte(244 + variation * 0.24),
      g: clampByte(239 + variation * 0.18),
      b: clampByte(234 + variation * 0.14),
    };
  }
  if (role === "hair") {
    return {
      r: clampByte(238 + variation * 0.5),
      g: clampByte(231 + variation * 0.34),
      b: clampByte(224 + variation * 0.2),
    };
  }
  const neutral = clampByte(238 + variation);
  return { r: neutral, g: neutral, b: neutral };
}

function roughnessSample(
  role: ReplayV4SurfaceRole,
  x: number,
  y: number,
  strength: number,
): number {
  // Roughness needs to stay in its upper range: it modulates the authored PBR
  // profile rather than turning fabric into wet plastic. Its contrast grows
  // with the selected quality tier, so Medium, High and Ultra are visibly
  // distinct even when the camera is too far away to resolve every bump.
  const contrast = detailStrengthNorm(strength) * 58;
  return 232 + ((detailSample(role, x, y) - 126) / 42) * contrast;
}

function createSurfaceDetailMap(
  role: ReplayV4SurfaceRole,
  kind: SurfaceDetailMapKind,
  strength: number,
  size: number,
): THREE.DataTexture {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      if (kind === "normal") {
        const normal = normalSample(role, x, y, strength, size);
        pixels[offset] = normal.r;
        pixels[offset + 1] = normal.g;
        pixels[offset + 2] = normal.b;
      } else if (kind === "albedo") {
        const albedo = albedoSample(role, x, y, strength);
        pixels[offset] = albedo.r;
        pixels[offset + 1] = albedo.g;
        pixels[offset + 2] = albedo.b;
      } else {
        const sample = clampByte(
          kind === "bump" ? detailSample(role, x, y) : roughnessSample(role, x, y, strength),
        );
        pixels[offset] = sample;
        pixels[offset + 1] = sample;
        pixels[offset + 2] = sample;
      }
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  const [repeatX, repeatY] = SURFACE_DETAIL_REPEAT[role];
  texture.name = `rowplay-v4-${role}-${kind}-detail`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function surfaceRole(material: THREE.Material): ReplayV4SurfaceRole {
  const raw = material.userData.replayV4SurfaceRole;
  return typeof raw === "string" && (REPLAY_V4_SURFACE_ROLES as readonly string[]).includes(raw)
    ? (raw as ReplayV4SurfaceRole)
    : "jersey";
}

function applySurfaceQuality(
  material: THREE.Material,
  quality: RenderQuality,
  hasUv: boolean,
): void {
  if (!(material instanceof THREE.MeshPhysicalMaterial)) return;
  const role = surfaceRole(material);
  const profile = ATHLETE_SURFACE_QUALITY[quality][role];
  material.roughness = profile.roughness;
  material.metalness = profile.metalness;
  material.clearcoat = profile.clearcoat;
  material.clearcoatRoughness = profile.clearcoatRoughness;
  material.sheen = profile.sheen;
  material.sheenRoughness = profile.sheenRoughness;
  material.sheenColor.set(profile.sheenColor);
  material.specularIntensity = profile.specularIntensity;
  const qualityStep = { low: 0, medium: 1, high: 2, ultra: 3 }[quality];
  // Human-scale optics are role-specific and progressive. Hair/fabric gain
  // directional response with quality, while skin uses a warm dielectric
  // specular lobe instead of the wet clearcoat that made the old athlete look
  // like painted vinyl.
  material.ior = role === "eye" ? 1.376 : role === "skin" || role === "face-detail" ? 1.4 : 1.48;
  material.specularColor.set(
    role === "eye"
      ? 0xffffff
      : role === "skin" || role === "face-detail"
        ? new THREE.Color(0xffd8ca).lerp(new THREE.Color(0xffeee8), qualityStep / 3)
        : role === "hair"
          ? new THREE.Color(0x8a4322).lerp(new THREE.Color(0xffcfaa), qualityStep / 3)
          : 0xffffff,
  );
  material.anisotropy =
    role === "hair"
      ? [0.03, 0.1, 0.2, 0.35][qualityStep]!
      : role === "jersey" || role === "lower"
        ? [0, 0.08, 0.2, 0.34][qualityStep]!
        : role === "trim"
          ? [0, 0.04, 0.1, 0.18][qualityStep]!
          : 0;
  material.anisotropyRotation = role === "hair" ? Math.PI * 0.5 : 0;
  // Release previous maps (shared maps are refcounted). Authored source
  // textures remain template-owned and are never listed here.
  const priorMaps = material.userData.replayV4GeneratedDetailMaps;
  if (Array.isArray(priorMaps)) {
    for (const map of priorMaps) {
      if (map instanceof THREE.Texture) releaseDetailMap(map);
    }
  }
  material.map = null;
  material.bumpMap = null;
  material.normalMap = null;
  material.roughnessMap = null;
  material.normalScale.set(0, 0);
  const strength = QUALITY_DETAIL_STRENGTH[quality] * SURFACE_DETAIL_MULTIPLIER[role];
  const textureSize = QUALITY_DETAIL_TEXTURE_SIZE[quality];
  material.bumpScale = strength;
  if (hasUv && strength > 0) {
    const albedo = retainSharedDetailMap(quality, role, "albedo", strength, textureSize);
    const bump = retainSharedDetailMap(quality, role, "bump", strength, textureSize);
    const normal = retainSharedDetailMap(quality, role, "normal", strength, textureSize);
    const roughness = retainSharedDetailMap(quality, role, "roughness", strength, textureSize);
    material.map = albedo;
    material.bumpMap = bump;
    material.normalMap = normal;
    material.roughnessMap = roughness;
    const normalScale = THREE.MathUtils.clamp(strength * 8.5, 0, 1.05);
    material.normalScale.set(normalScale, normalScale);
    material.userData.replayV4GeneratedDetailMaps = [albedo, bump, normal, roughness];
  } else {
    material.userData.replayV4GeneratedDetailMaps = [];
  }
  material.userData.replayV4SurfaceDetailStrength = strength;
  material.userData.replayV4SurfaceDetailResolution = hasUv && strength > 0 ? textureSize : 0;
}

function styleInstance(
  instance: ReplayV4AthleteInstance,
  options: ReplayV4MotionInstallOptions,
): void {
  const requestedOpacity = THREE.MathUtils.clamp(finite(options.opacity ?? 1, 1), 0, 1);
  const requestedLaneColor = new THREE.Color(options.laneColor ?? 0xffffff);
  const quality = options.quality ?? "medium";
  // A saturated lane colour used as a direct multiplier destroys authored skin
  // and kit separation. Ghost identity therefore comes from a restrained cool
  // tint, not alpha: one deforming mesh contains overlapping anatomical forms,
  // and transparent triangle sorting produces disappearing limbs and torso
  // seams. Keeping the skinned body in the opaque pass makes depth deterministic.
  const ghostIntent = requestedOpacity < 0.98;
  const laneColor = new THREE.Color(0xffffff).lerp(requestedLaneColor, ghostIntent ? 0.34 : 0.14);
  const materials = Array.isArray(instance.mesh.material)
    ? instance.mesh.material
    : [instance.mesh.material];
  const uv = instance.mesh.geometry.getAttribute("uv");
  const hasUv = !!uv && uv.itemSize >= 2 && uv.count > 0;
  for (const material of materials) {
    applySurfaceQuality(material, quality, hasUv);
    material.opacity = 1;
    material.transparent = false;
    material.depthWrite = true;
    material.depthTest = true;
    material.alphaTest = 0;
    material.premultipliedAlpha = false;
    const colored = material as THREE.Material & { color?: THREE.Color };
    if (colored.color instanceof THREE.Color) colored.color.copy(laneColor);
    material.needsUpdate = true;
  }
  instance.mesh.userData.replayRequestedOpacity = requestedOpacity;
  instance.mesh.userData.replayBodyRenderMode = "opaque-depth-writing";
  instance.mesh.userData.replayV4Quality = quality;
  instance.mesh.castShadow = options.castShadow ?? true;
  instance.mesh.receiveShadow = options.receiveShadow ?? options.castShadow ?? true;
  // A moving SkinnedMesh needs either animated bounds or culling disabled. The
  // latter is deterministic, inexpensive for one hero mesh, and avoids limb pop.
  instance.mesh.frustumCulled = false;
}

function offsetFor(
  instance: ReplayV4AthleteInstance,
  name: ReplayV4EffectorName,
  overrides: ReplayV4EffectorOffsetOverrides | undefined,
): THREE.Vector3 {
  const authored = instance.effectors[name].contactOffset;
  const override = overrides?.[name];
  return override
    ? new THREE.Vector3(
        finite(override.x, authored[0]),
        finite(override.y, authored[1]),
        finite(override.z, authored[2]),
      )
    : new THREE.Vector3(authored[0], authored[1], authored[2]);
}

function requireBone(
  instance: ReplayV4AthleteInstance,
  name: keyof typeof instance.bones,
): THREE.Bone {
  const bone = instance.bones[name];
  if (!bone) throw new Error(`Replay V4 motion is missing bone: ${String(name)}`);
  return bone;
}

/**
 * Limited slerp from current toward target by at most `maxAngle` radians.
 * Avoids forcing a full equipment quaternion that corkscrews the forearm.
 */
function limitedSlerp(
  current: THREE.Quaternion,
  target: THREE.Quaternion,
  maxAngle: number,
  out: THREE.Quaternion,
): void {
  const angle = current.angleTo(target);
  if (!Number.isFinite(angle) || angle <= SOFT_ANGLE_DEADZONE) {
    out.copy(current);
    return;
  }
  const t = angle <= maxAngle ? 1 : maxAngle / angle;
  out.copy(current).slerp(target, t).normalize();
}

class InstalledReplayV4MotionController implements ReplayV4MotionController {
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;

  private active = true;
  private revealed = false;
  private disposed = false;
  private prepared = false;
  private handOrientationPrepared = false;
  private handContactsSettled = false;
  private diagnosticMode: ReplayV4DiagnosticMode;
  private readonly action: THREE.AnimationAction;
  private readonly fallback: readonly FallbackVisibility[];
  private readonly hips: THREE.Bone;
  private readonly chains: readonly ChainBinding[];
  private readonly baseRootPosition = new THREE.Vector3();
  private readonly baseRootQuaternion = new THREE.Quaternion();
  private readonly baseRootScale = new THREE.Vector3();
  /**
   * Last authored clip sample for every bone that contact correction may mutate.
   * Restoring these before seeking keeps PropertyMixer skip-writes safe.
   */
  private readonly sampledChainRotations: readonly BoneRotationSnapshot[];
  private readonly preSettleHandRotations: readonly BoneRotationSnapshot[];

  // Controller-owned scratch — live and ghost lanes never share IK state.
  private readonly targetWorld = new THREE.Vector3();
  private readonly currentWorld = new THREE.Vector3();
  private readonly targetLocal = new THREE.Vector3();
  private readonly currentLocal = new THREE.Vector3();
  private readonly rootWorld = new THREE.Vector3();
  private readonly middleWorld = new THREE.Vector3();
  private readonly effectorWorld = new THREE.Vector3();
  private readonly bendHint = new THREE.Vector3();
  private readonly solvedMiddle = new THREE.Vector3();
  private readonly solvedEnd = new THREE.Vector3();
  private readonly desiredEffectorWorld = new THREE.Vector3();
  private readonly softDesiredEffector = new THREE.Vector3();
  private readonly contactOffsetWorld = new THREE.Vector3();
  private readonly effectorWorldScale = new THREE.Vector3();
  private readonly currentDirection = new THREE.Vector3();
  private readonly desiredDirection = new THREE.Vector3();
  private readonly parentWorldQuaternion = new THREE.Quaternion();
  private readonly targetWorldQuaternion = new THREE.Quaternion();
  private readonly rootWorldQuaternion = new THREE.Quaternion();
  private readonly preservedEffectorWorldQuaternion = new THREE.Quaternion();
  private readonly deltaWorldQuaternion = new THREE.Quaternion();
  private readonly desiredWorldQuaternion = new THREE.Quaternion();
  private readonly localQuaternion = new THREE.Quaternion();
  private readonly blendedWorldQuaternion = new THREE.Quaternion();
  private readonly gripCurlQuaternion = new THREE.Quaternion();
  private readonly gripCurlSecondary = new THREE.Quaternion();
  private readonly gripAxis = new THREE.Vector3(1, 0, 0);
  private readonly wristAxisLocal = new THREE.Vector3();
  private readonly wristDelta = new THREE.Quaternion();
  private readonly wristTwist = new THREE.Quaternion();
  private readonly wristSwing = new THREE.Quaternion();
  private readonly forearmAxisLocal = new THREE.Vector3();
  private readonly forearmTwistQuaternion = new THREE.Quaternion();
  /** Rest local quaternions for optional finger helpers (identity when absent). */
  private readonly handHelpers: readonly {
    readonly bone: THREE.Bone;
    readonly rest: THREE.Quaternion;
    readonly side: -1 | 1;
    readonly digit: ReplayV4GripDigit | null;
    readonly stage: ReplayV4GripHelperStage;
  }[];
  /** Geometry-solved digit poses (helper name → flex/oppose); null = legacy curls. */
  private readonly solvedGripPoses: ReadonlyMap<
    string,
    { readonly flex: number; readonly oppose: number }
  > | null;
  private readonly gripContactsBySide: {
    left: readonly HandDigitContactReport[];
    right: readonly HandDigitContactReport[];
  } = { left: [], right: [] };
  private readonly wristMetricsBySide: { left: ReplayV4WristMetrics; right: ReplayV4WristMetrics } =
    {
      left: { twist: 0, flexion: 0, deviation: 0, forearmTwist: 0, clampedSwing: 0 },
      right: { twist: 0, flexion: 0, deviation: 0, forearmTwist: 0, clampedSwing: 0 },
    };
  /** Hand rest local rotation and forearm-local anatomy axes for wrist budgets. */
  private readonly wristRest: readonly {
    readonly side: -1 | 1;
    readonly handRest: THREE.Quaternion;
    /** Forearm long axis (twist) in the forearm's local frame. */
    readonly boneAxisLocal: THREE.Vector3;
    readonly forearmAxisLocal: THREE.Vector3;
    /** Flexion/extension axis (the hand's curl axis at rest, forearm frame). */
    readonly flexAxisLocal: THREE.Vector3;
    /** Radial/ulnar deviation axis, completing the wrist triad. */
    readonly deviationAxisLocal: THREE.Vector3;
  }[];

  constructor(
    private readonly options: ReplayV4MotionInstallOptions & { instance: ReplayV4AthleteInstance },
  ) {
    const { instance, sport, parent, targets } = options;
    this.root = instance.root;
    this.mesh = instance.mesh;
    this.hips = requireBone(instance, "v4Hips");
    this.diagnosticMode = options.diagnosticMode ?? "full";
    const timing = instance.clipTimingBySport[sport];
    if (!timing?.clip || !(timing.clip.duration > 0)) {
      throw new Error(`Replay V4 motion is missing the ${sport} clip`);
    }

    const helpers: {
      bone: THREE.Bone;
      rest: THREE.Quaternion;
      side: -1 | 1;
      digit: ReplayV4GripDigit | null;
      stage: ReplayV4GripHelperStage;
    }[] = [];
    for (const name of REPLAY_V4_HAND_HELPER_NAMES) {
      const bone = instance.skeleton.getBoneByName(name);
      if (!bone) continue;
      const meta = gripHelperMeta(name);
      helpers.push({
        bone,
        rest: bone.quaternion.clone(),
        side: meta.side,
        digit: meta.digit,
        stage: meta.stage,
      });
    }
    this.handHelpers = helpers;
    // Diagnostics only: production meshes should carry the full grip set.
    if (helpers.length === 0) {
      this.root.userData.replayV4GripHelpers = "missing";
    } else if (helpers.length < REPLAY_V4_HAND_HELPER_NAMES.length) {
      this.root.userData.replayV4GripHelpers = "partial";
    } else {
      this.root.userData.replayV4GripHelpers = "ready";
    }

    // Geometry-aware closure: solve every digit against the sport's grip
    // surface once, in hand-local rest space. Curl angles become outputs of
    // the actual equipment radius instead of per-sport constants, contact is
    // the stop condition (penetration is minimised, not forbidden — see
    // `solveHandGripClosure`), and the per-frame hot path only applies the
    // cached rotations.
    //
    // Each sport layer supplies its own surface contract; the controller
    // remains sport-neutral and only executes the requested closure policy.
    const contract = options.gripContract;
    const handLongAxes = new Map<-1 | 1, THREE.Vector3>();
    if (contract && helpers.length === REPLAY_V4_HAND_HELPER_NAMES.length) {
      const solved = new Map<string, { flex: number; oppose: number }>();
      for (const side of [-1, 1] as const) {
        const handBone = requireBone(instance, side < 0 ? "v4LeftHand" : "v4RightHand");
        const chains = collectHandDigitChains(
          handBone,
          (name) => instance.skeleton.getBoneByName(name),
          side,
        );
        const closure = solveHandGripClosure(chains, {
          side,
          surface: contract,
          thumbOppose: contract.thumbOppose,
          wrapFingerStages: contract.wrapFingerStages,
        });
        for (const pose of closure.poses) {
          solved.set(pose.helper, { flex: pose.flex, oppose: pose.oppose });
        }
        this.gripContactsBySide[side < 0 ? "left" : "right"] = closure.contacts;
        // The hand's long axis (wrist → middle-finger root) defines the flat
        // wrist the budgets measure from. Derived from the same rig data the
        // closure used, so a rebuilt asset moves the reference with it.
        const middle = chains.find((chain) => chain.digit === "middle");
        if (middle) handLongAxes.set(side, middle.joints[0]!.position.clone().normalize());
      }
      this.solvedGripPoses = solved;
      this.root.userData.replayV4GripMode = "geometry-closure";
    } else {
      this.solvedGripPoses = null;
      this.root.userData.replayV4GripMode = "legacy-curl";
    }

    this.fallback = collectFallbackVisibility(options.fallbackRoot ?? parent);
    // Contact targets are always terminal authorities. RowErg/SkiErg elbows
    // and BikeErg knees additionally select the anatomical two-bone branch.
    this.chains = [
      {
        side: -1,
        upper: requireBone(instance, "v4LeftUpperArm"),
        middle: requireBone(instance, "v4LeftForearm"),
        effector: requireBone(instance, instance.effectors.leftHand.bone),
        target: targets.leftHand,
        jointTarget: targets.leftElbow,
        offset: offsetFor(instance, "leftHand", options.effectorOffsets),
        isLeg: false,
      },
      {
        side: 1,
        upper: requireBone(instance, "v4RightUpperArm"),
        middle: requireBone(instance, "v4RightForearm"),
        effector: requireBone(instance, instance.effectors.rightHand.bone),
        target: targets.rightHand,
        jointTarget: targets.rightElbow,
        offset: offsetFor(instance, "rightHand", options.effectorOffsets),
        isLeg: false,
      },
      {
        side: -1,
        upper: requireBone(instance, "v4LeftUpperLeg"),
        middle: requireBone(instance, "v4LeftLowerLeg"),
        effector: requireBone(instance, instance.effectors.leftFoot.bone),
        target: targets.leftFoot,
        jointTarget: targets.leftKnee,
        offset: offsetFor(instance, "leftFoot", options.effectorOffsets),
        isLeg: true,
      },
      {
        side: 1,
        upper: requireBone(instance, "v4RightUpperLeg"),
        middle: requireBone(instance, "v4RightLowerLeg"),
        effector: requireBone(instance, instance.effectors.rightFoot.bone),
        target: targets.rightFoot,
        jointTarget: targets.rightKnee,
        offset: offsetFor(instance, "rightFoot", options.effectorOffsets),
        isLeg: true,
      },
    ];
    this.baseRootPosition.copy(this.root.position);
    this.baseRootQuaternion.copy(this.root.quaternion);
    this.baseRootScale.copy(this.root.scale);
    this.sampledChainRotations = this.chains.flatMap((chain) => [
      { bone: chain.upper, quaternion: chain.upper.quaternion.clone() },
      { bone: chain.middle, quaternion: chain.middle.quaternion.clone() },
      { bone: chain.effector, quaternion: chain.effector.quaternion.clone() },
    ]);
    this.preSettleHandRotations = this.chains
      .filter((chain) => !chain.isLeg)
      .flatMap((chain) => [
        { bone: chain.upper, quaternion: chain.upper.quaternion.clone() },
        { bone: chain.middle, quaternion: chain.middle.quaternion.clone() },
        { bone: chain.effector, quaternion: chain.effector.quaternion.clone() },
      ]);
    // Wrist budgets are measured against a *flat-wrist* reference, not the
    // authored bind pose: the bind hand carries its own built-in flexion, so
    // budgeting from it would spend most of the range before any equipment
    // frame was applied. The reference is the bind rotation swung so the
    // hand's long axis (wrist → middle-finger root) continues the forearm
    // bone axis — anatomical zero for flexion and deviation, with the bind
    // roll kept as the pronation zero. The bone axis toward the hand in the
    // forearm's local frame is where axial twist lives; rotating the forearm
    // about it moves neither elbow nor wrist. Flexion/extension happens
    // about the hand's curl axis (the same lateral axis the fingers flex
    // about) and radial/ulnar deviation completes the orthogonal triad.
    this.wristRest = this.chains
      .filter((chain) => !chain.isLeg)
      .map((chain) => {
        const boneAxisLocal = chain.effector.position.clone().normalize();
        const handRest = chain.effector.quaternion.clone();
        const longAxis = handLongAxes.get(chain.side);
        if (longAxis) {
          const bindLongInForearm = longAxis.clone().applyQuaternion(handRest).normalize();
          const align = new THREE.Quaternion().setFromUnitVectors(bindLongInForearm, boneAxisLocal);
          handRest.premultiply(align);
        }
        const flexAxisLocal = handCurlAxis(chain.side).applyQuaternion(handRest).normalize();
        // Orthogonalise against the twist axis so the triad is well-formed.
        flexAxisLocal.addScaledVector(boneAxisLocal, -flexAxisLocal.dot(boneAxisLocal));
        if (flexAxisLocal.lengthSq() < 1e-8) flexAxisLocal.set(1, 0, 0);
        flexAxisLocal.normalize();
        const deviationAxisLocal = new THREE.Vector3()
          .crossVectors(boneAxisLocal, flexAxisLocal)
          .normalize();
        return {
          side: chain.side,
          handRest,
          boneAxisLocal,
          forearmAxisLocal: boneAxisLocal.clone(),
          flexAxisLocal,
          deviationAxisLocal,
        };
      });

    styleInstance(instance, options);
    this.root.name = `v4-athlete-${sport}`;
    this.root.userData.replayV4Athlete = true;
    this.root.userData.replayV4Sport = sport;
    this.root.userData.replayV4Architecture = "clip-contact-constrained";
    this.mesh.userData.replayV4Athlete = true;
    this.mesh.userData.replayV4Sport = sport;
    this.root.visible = false;
    parent.add(this.root);
    instance.mixer.stopAllAction();
    this.action = instance.mixer.clipAction(timing.clip);
    this.action.setLoop(THREE.LoopRepeat, Infinity);
    this.action.clampWhenFinished = false;
    this.action.enabled = true;
    this.action.play();
  }

  get enabled(): boolean {
    return this.active && !this.disposed;
  }

  setDiagnosticMode(mode: ReplayV4DiagnosticMode): void {
    this.diagnosticMode = mode;
    this.root.userData.replayV4DiagnosticMode = mode;
    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    for (const material of materials) {
      const std = material as THREE.MeshStandardMaterial;
      if (mode === "wireframe" && "wireframe" in std) std.wireframe = true;
      else if ("wireframe" in std) std.wireframe = false;
      if (mode === "unlit" && "emissive" in std && std.color) {
        std.emissive?.copy(std.color).multiplyScalar(0.35);
      }
      material.needsUpdate = true;
    }
  }

  getContactWorld(name: ReplayV4EffectorName, output = new THREE.Vector3()): THREE.Vector3 {
    const metric = this.options.instance.effectors[name];
    const bone = this.options.instance.bones[metric.bone];
    output.set(metric.contactOffset[0], metric.contactOffset[1], metric.contactOffset[2]);
    bone.localToWorld(output);
    return output;
  }

  getGripContacts(side: "left" | "right"): readonly HandDigitContactReport[] {
    return this.gripContactsBySide[side];
  }

  getWristMetrics(side: "left" | "right"): ReplayV4WristMetrics {
    return this.wristMetricsBySide[side];
  }

  getShoulderWorld(side: "left" | "right", output = new THREE.Vector3()): THREE.Vector3 {
    const bone =
      side === "left"
        ? this.options.instance.bones.v4LeftUpperArm
        : this.options.instance.bones.v4RightUpperArm;
    return bone.getWorldPosition(output);
  }

  getLegJointTargetWorld(side: "left" | "right", output = new THREE.Vector3()): THREE.Vector3 {
    const chain = this.chains.find(
      (candidate) => candidate.isLeg && candidate.side === (side === "left" ? -1 : 1),
    );
    if (!chain) throw new Error(`Replay V4 ${side} leg chain is missing`);
    chain.upper.getWorldPosition(this.rootWorld);
    chain.middle.getWorldPosition(this.middleWorld);
    chain.effector.getWorldPosition(this.effectorWorld);
    chain.target.getWorldPosition(this.targetWorld);
    chain.jointTarget.getWorldPosition(this.bendHint);
    this.bendHint.sub(this.rootWorld);
    chain.target.getWorldQuaternion(this.targetWorldQuaternion);
    chain.effector.getWorldScale(this.effectorWorldScale);
    this.contactOffsetWorld
      .copy(chain.offset)
      .multiply(this.effectorWorldScale)
      .applyQuaternion(this.targetWorldQuaternion);
    this.desiredEffectorWorld.copy(this.targetWorld).sub(this.contactOffsetWorld);
    solveTwoBone3D(
      this.rootWorld,
      this.desiredEffectorWorld,
      this.rootWorld.distanceTo(this.middleWorld),
      this.middleWorld.distanceTo(this.effectorWorld),
      this.bendHint,
      this.solvedMiddle,
      this.solvedEnd,
    );
    return output.copy(this.solvedMiddle);
  }

  getHandContactOffsetWorld(side: "left" | "right", output = new THREE.Vector3()): THREE.Vector3 {
    const name = side === "left" ? "leftHand" : "rightHand";
    const metric = this.options.instance.effectors[name];
    const bone = this.options.instance.bones[metric.bone];
    // The refine path must measure the offset the contact solve actually
    // drives — the grip-channel override when one is active — or the rigid
    // oar-arc solve would aim the wrist at the authored palm point while the
    // position pass closes a different one.
    const chain = this.chains.find(
      (candidate) => !candidate.isLeg && candidate.side === (side === "left" ? -1 : 1),
    );
    if (chain) {
      output.copy(chain.offset);
      bone.localToWorld(output);
    } else {
      this.getContactWorld(name, output);
    }
    bone.getWorldPosition(this.currentWorld);
    return output.sub(this.currentWorld);
  }

  getArmReach(side: "left" | "right"): number {
    const metric = this.options.instance.effectors[side === "left" ? "leftHand" : "rightHand"];
    return metric.proximalLength + metric.distalLength;
  }

  prepare(sample: ReplayV4MotionSample): boolean {
    if (!this.enabled) return false;
    try {
      this.prepared = false;
      this.handOrientationPrepared = false;
      this.handContactsSettled = false;
      if (this.root.parent !== this.options.parent) {
        throw new Error("Replay V4 athlete detached from its lane parent");
      }
      const timing = this.options.instance.clipTimingBySport[this.options.sport];
      const fraction = clipFraction(sample, finite(sample.driveFrac ?? 0.4, 0.4), timing.driveEnd);
      // Every seek begins from the same authored basis.
      this.root.position.copy(this.baseRootPosition);
      this.root.quaternion.copy(this.baseRootQuaternion);
      this.root.scale.copy(this.baseRootScale);
      for (const state of this.sampledChainRotations) {
        state.bone.quaternion.copy(state.quaternion);
      }
      // Helpers are not animation tracks. Restore their bind rotations before
      // every deterministic seek so switching to clip-only cannot retain the
      // previous frame's closed grip.
      for (const helper of this.handHelpers) {
        helper.bone.quaternion.copy(helper.rest);
      }
      this.options.instance.mixer.setTime(fraction * timing.clip.duration);
      for (const state of this.sampledChainRotations) {
        state.quaternion.copy(state.bone.quaternion);
      }
      this.root.updateMatrixWorld(true);

      const mode = this.diagnosticMode;
      if (mode !== "clip-only") {
        this.alignPelvis();
        this.assertPelvisAligned();
      }

      this.prepared = true;
      return true;
    } catch (error) {
      this.root.userData.replayV4Failure =
        error instanceof Error ? error.message : "Replay V4 motion prepare failed";
      this.disable();
      return false;
    }
  }

  orientHandsToTargets(): boolean {
    if (!this.enabled || !this.prepared) return false;
    try {
      for (const chain of this.chains) {
        if (!chain.isLeg) this.softOrientEffector(chain);
      }
      this.root.updateMatrixWorld(true);
      this.handOrientationPrepared = true;
      return true;
    } catch (error) {
      this.root.userData.replayV4Failure =
        error instanceof Error ? error.message : "Replay V4 hand orientation failed";
      this.disable();
      return false;
    }
  }

  settleHandContacts(): boolean {
    if (!this.enabled || !this.prepared) return false;
    try {
      for (const state of this.preSettleHandRotations) {
        state.quaternion.copy(state.bone.quaternion);
      }
      const mode = this.diagnosticMode;
      const applyContact = mode !== "clip-pelvis" && mode !== "clip-only";
      if (applyContact) {
        for (const chain of this.chains) {
          if (!chain.isLeg) this.correctContactChain(chain);
        }
        this.root.updateMatrixWorld(true);
      }
      this.handContactsSettled = true;
      return true;
    } catch (error) {
      this.root.userData.replayV4Failure =
        error instanceof Error ? error.message : "Replay V4 hand contact settle failed";
      this.disable();
      return false;
    }
  }

  restoreHandPoseAfterSettle(): boolean {
    if (!this.enabled || !this.prepared || !this.handContactsSettled) return false;
    for (const state of this.preSettleHandRotations) {
      state.bone.quaternion.copy(state.quaternion);
    }
    this.root.updateMatrixWorld(true);
    this.handContactsSettled = false;
    return true;
  }

  constrain(): boolean {
    if (!this.enabled || !this.prepared) return false;
    try {
      const mode = this.diagnosticMode;

      const applyContact = mode !== "clip-pelvis" && mode !== "clip-only";
      if (applyContact) {
        // Visual isolation modes (and full) keep rigid contact so the hero
        // reads as equipment-connected while materials change.
        for (const chain of this.chains) this.correctContactChain(chain);
        // Curl only after contact lock — clip-only / clip-pelvis leave rest pose.
        this.applyGripHelpers();
      }

      this.root.updateMatrixWorld(true);
      if (mode !== "clip-only") this.assertPelvisAligned();
      this.options.instance.skeleton.update();
      // Re-assert every frame: procedural limb placement runs earlier in the
      // same tick and historically forced segment.visible = true.
      setFallbackVisibility(this.fallback, true);
      if (!this.revealed) {
        this.root.visible = true;
        this.revealed = true;
      }
      this.prepared = false;
      this.handOrientationPrepared = false;
      this.handContactsSettled = false;
      return true;
    } catch (error) {
      this.prepared = false;
      this.handOrientationPrepared = false;
      this.handContactsSettled = false;
      this.root.userData.replayV4Failure =
        error instanceof Error ? error.message : "Replay V4 motion constraint failed";
      this.disable();
      return false;
    }
  }

  update(sample: ReplayV4MotionSample): boolean {
    return this.prepare(sample) && this.constrain();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    try {
      this.action.stop();
    } catch {
      /* best-effort */
    }
    try {
      this.restoreFallback();
    } catch {
      /* best-effort */
    }
    this.root.visible = false;
    try {
      this.root.removeFromParent();
    } catch {
      /* best-effort */
    }
    try {
      disposeReplayV4AthleteInstance(this.options.instance);
    } catch {
      /* best-effort */
    }
  }

  private disable(): void {
    if (!this.active) return;
    this.active = false;
    this.prepared = false;
    this.handOrientationPrepared = false;
    this.handContactsSettled = false;
    this.action.stop();
    this.root.visible = false;
    this.restoreFallback();
  }

  private restoreFallback(): void {
    if (!this.revealed) return;
    setFallbackVisibility(this.fallback, false);
    this.revealed = false;
  }

  private alignPelvis(): void {
    const parent = this.root.parent;
    if (!parent) throw new Error("Replay V4 athlete has no lane parent");

    // Translation only — matching the hidden pelvis quaternion would cancel
    // the authored hip pitch/roll that makes the skin read as an animated body.
    this.options.targets.pelvis.getWorldPosition(this.targetWorld);
    this.hips.getWorldPosition(this.currentWorld);
    this.targetLocal.copy(this.targetWorld);
    this.currentLocal.copy(this.currentWorld);
    parent.worldToLocal(this.targetLocal);
    parent.worldToLocal(this.currentLocal);
    this.root.position.add(this.targetLocal).sub(this.currentLocal);
    if (!finiteVector(this.root.position)) throw new Error("Replay V4 pelvis position is invalid");
    this.root.updateMatrixWorld(true);

    // On a seat the hip bone is not the contact surface. After the clip pose
    // lands the hips on the target, lift the root so the measured posterior
    // rests on the pad instead of sinking through it (屁股穿模). Height-only
    // rig tuning is not enough once hip pitch from the clip rotates the
    // posterior relative to the fixed seat.
    const seat = this.options.seatContract;
    if (seat) this.enforceSitSurface(parent, seat);
  }

  /**
   * Keep the posterior on the seat pad. The caller supplies the pad plane and
   * the measured hip→sit offset, so clip pitch cannot drive the mesh through
   * the cushion after a pure pelvis translation align.
   */
  private enforceSitSurface(parent: THREE.Object3D, seat: ReplayV4SeatContract): void {
    this.hips.getWorldPosition(this.currentWorld);
    parent.worldToLocal(this.currentWorld);
    const sitLocalY = this.currentWorld.y + seat.sitSurfaceOffsetY;
    const lift = seat.padTopY - seat.nestle - sitLocalY;
    // Only lift out of the pad — never drag the rider down through a high clip.
    if (lift <= 1e-5) return;
    if (lift > seat.maxLift) {
      throw new Error(
        `Replay V4 seat correction of ${lift.toFixed(6)} m exceeds the ${seat.maxLift} m budget`,
      );
    }
    this.root.position.y += lift;
    if (!finiteVector(this.root.position)) {
      throw new Error("Replay V4 seat correction produced an invalid root");
    }
    this.root.updateMatrixWorld(true);
  }

  private assertPelvisAligned(): void {
    this.options.targets.pelvis.getWorldPosition(this.targetWorld);
    this.hips.getWorldPosition(this.currentWorld);
    const seat = this.options.seatContract;
    if (seat) {
      // Sit correction may raise the hip above the procedural pelvis marker
      // without changing XZ. Require horizontal lock and a bounded upward lift;
      // the ceiling is the same budget the correction itself enforces, so a
      // drifting seat fit fails here instead of quietly posing mid-air.
      const parent = this.root.parent;
      if (!parent) throw new Error("Replay V4 athlete has no lane parent");
      this.targetLocal.copy(this.targetWorld);
      this.currentLocal.copy(this.currentWorld);
      parent.worldToLocal(this.targetLocal);
      parent.worldToLocal(this.currentLocal);
      const dx = this.currentLocal.x - this.targetLocal.x;
      const dz = this.currentLocal.z - this.targetLocal.z;
      const dy = this.currentLocal.y - this.targetLocal.y;
      const horizontal = Math.hypot(dx, dz);
      if (!Number.isFinite(horizontal) || horizontal > 1e-5) {
        throw new Error(`Replay V4 seated pelvis XZ drifted by ${horizontal.toFixed(6)} m`);
      }
      if (!Number.isFinite(dy) || dy < -1e-5 || dy > seat.maxLift) {
        throw new Error(`Replay V4 seated pelvis Y lift out of range: ${dy.toFixed(6)} m`);
      }
      return;
    }
    const residual = this.currentWorld.distanceTo(this.targetWorld);
    if (!Number.isFinite(residual) || residual > 1e-5) {
      throw new Error(`Replay V4 pelvis alignment drifted by ${residual.toFixed(6)} m`);
    }
  }

  private softAngleBudget(chain: ChainBinding): number {
    return chain.isLeg ? LEG_SOFT_ANGLE_RAD : ARM_SOFT_ANGLE_RAD;
  }

  /**
   * Close the visual digits after the hand is contact-locked.
   *
   * With a grip contract, every phalanx applies its geometry-solved rotation:
   * the flex angles were closed against the actual equipment surface at
   * install, so the enclosure is collision-derived rather than styled. The
   * legacy fixed-curl table remains only for instances without a contract
   * (procedural templates and older tests).
   */
  private applyGripHelpers(): void {
    if (this.handHelpers.length === 0) return;
    if (this.solvedGripPoses) {
      for (const helper of this.handHelpers) {
        if (helper.stage === "cup") {
          // The closure is solved in the `HAND_CLOSURE_CUP` carrying posture
          // the grip channel was fitted in, so the live cup helper must hold
          // the same pose — leaving it at rest would flatten the palm the
          // solved flex angles were closed around.
          helper.bone.quaternion
            .copy(helper.rest)
            .multiply(
              this.gripCurlQuaternion.setFromAxisAngle(
                this.gripAxis.set(0, 1, 0),
                -helper.side * HAND_CLOSURE_CUP,
              ),
            );
          continue;
        }
        const solved = this.solvedGripPoses.get(helper.bone.name);
        if (!solved) continue;
        this.gripCurlSecondary.setFromAxisAngle(this.gripAxis.set(0, 0, 1), solved.oppose);
        this.gripCurlQuaternion.setFromAxisAngle(this.gripAxis.set(1, 0, 0), -solved.flex);
        helper.bone.quaternion
          .copy(helper.rest)
          .multiply(this.gripCurlSecondary)
          .multiply(this.gripCurlQuaternion);
      }
      return;
    }
    const grip = GRIP_CURL_BY_SPORT[this.options.sport];
    for (const helper of this.handHelpers) {
      this.gripCurlQuaternion.identity();
      this.gripCurlSecondary.identity();
      if (helper.stage === "cup") {
        // The stable v4*Fingers parent adds only a shallow palm cup. Individual
        // phalanges below it perform the visible cylindrical enclosure.
        this.gripCurlQuaternion.setFromAxisAngle(
          this.gripAxis.set(0, 1, 0),
          -helper.side * grip.fingerCup,
        );
      } else if (helper.digit === "thumb") {
        const flex =
          helper.stage === "proximal"
            ? grip.thumbProximal
            : helper.stage === "intermediate"
              ? grip.thumbIntermediate
              : grip.thumbDistal;
        // Blender authors helper local +X across the palm and +Z along palm
        // up. Negative X flexes into the handle; proximal Z opposition brings
        // the thumb across the fingers instead of leaving it splayed.
        this.gripCurlQuaternion.setFromAxisAngle(this.gripAxis.set(1, 0, 0), -flex);
        if (helper.stage === "proximal") {
          this.gripCurlSecondary.setFromAxisAngle(
            this.gripAxis.set(0, 0, 1),
            helper.side * grip.thumbOppose,
          );
        }
      } else {
        const scale = FINGER_CURL_SCALE[helper.digit!];
        const flex =
          helper.stage === "proximal"
            ? grip.fingerProximal
            : helper.stage === "intermediate"
              ? grip.fingerIntermediate
              : grip.fingerDistal;
        this.gripCurlQuaternion.setFromAxisAngle(this.gripAxis.set(1, 0, 0), -flex * scale);
      }
      helper.bone.quaternion
        .copy(helper.rest)
        .multiply(this.gripCurlSecondary)
        .multiply(this.gripCurlQuaternion);
    }
  }

  private usesSharedJointTarget(chain: ChainBinding): boolean {
    // Every planted/contact-driven leg needs the deterministic rig's knee
    // branch. RowErg raises both knees above the cockpit, BikeErg keeps them
    // aligned with opposed pedals, and SkiErg keeps each knee over its own ski.
    // BikeErg arms also use their explicit elbow markers: a seated cockpit has
    // a very different bend plane from the generic clip, and retaining the
    // clip-only branch makes the hands reach the bars with winged elbows.
    // Retaining the mirrored SkiErg clip plane after locking both feet allowed
    // the left and right thighs to solve through one another even though the
    // boots themselves remained correctly separated.
    if (chain.isLeg) return true;
    return (
      this.options.sport === "rower" ||
      this.options.sport === "skierg" ||
      this.options.sport === "bike"
    );
  }

  /**
   * All machine-contact chains follow their shared deterministic branch
   * markers. The rowing marker is already solved on the boat-local elbow
   * corridor (`solveRowerArm`) with the V4 arm's own proportions, so adding
   * any athlete-local lateral bias here would rotate the bend plane back out
   * of that corridor — the former `side * 0.12` "ribcage clearance" offset
   * was the measured source of the 0.27–0.30 m outboard elbow wing during
   * the arm draw. Rowing arms additionally fade the marker's authority to
   * zero at the near-straight singularity: with a long arm the marker's
   * projected plane would dictate the joint completely for no visible
   * positional gain while twisting the limb about its own axis, so the
   * authored clip's own elbow direction owns that region and the marker
   * takes over smoothly as real flexion develops.
   */
  private refreshBendHint(chain: ChainBinding): void {
    if (this.usesSharedJointTarget(chain)) {
      chain.jointTarget.getWorldPosition(this.bendHint);
      this.bendHint.sub(this.rootWorld);
    } else {
      this.bendHint.copy(this.middleWorld).sub(this.rootWorld);
    }
    if (this.bendHint.lengthSq() <= TRANSFORM_EPSILON) {
      this.bendHint.set(0, chain.isLeg ? 1 : -1, 0);
    }
  }

  /**
   * Close one rigid contact chain on top of the authored clip pose.
   *
   * Most bend planes come from the sampled clip. Machine-contact arms use the
   * deterministic shared elbow marker because a rigid grip can close on either
   * elbow branch: rowing selects the rearward draw, SkiErg the sagittal pull,
   * and BikeErg the tucked seated cockpit reach. All leg chains likewise use
   * their mechanically solved knee target so a contact-locked foot can never
   * select the opposite-side knee branch.
   */
  private correctContactChain(chain: ChainBinding): void {
    chain.upper.getWorldPosition(this.rootWorld);
    chain.middle.getWorldPosition(this.middleWorld);
    chain.effector.getWorldPosition(this.effectorWorld);
    chain.target.getWorldPosition(this.targetWorld);

    this.refreshBendHint(chain);

    this.getEffectorWorld(chain, this.currentWorld);
    const residual = this.currentWorld.distanceTo(this.targetWorld);
    if (!Number.isFinite(residual)) {
      throw new Error("Replay V4 contact residual is invalid");
    }

    if (residual <= CONTACT_DEADZONE_M) {
      this.softOrientEffector(chain);
      return;
    }

    const proximalLength = this.rootWorld.distanceTo(this.middleWorld);
    const distalLength = this.middleWorld.distanceTo(this.effectorWorld);
    if (
      !Number.isFinite(proximalLength) ||
      !Number.isFinite(distalLength) ||
      proximalLength <= TRANSFORM_EPSILON ||
      distalLength <= TRANSFORM_EPSILON
    ) {
      throw new Error("Replay V4 chain has invalid segment lengths");
    }

    if (chain.isLeg) {
      // Feet need the equipment frame re-established between position passes;
      // pedal/plate orientation changes the non-zero sole contact offset.
      this.softOrientEffector(chain);
      this.root.updateMatrixWorld(true);
      this.solvePositionTowardTarget(chain, proximalLength, distalLength);
      this.root.updateMatrixWorld(true);
      this.softOrientEffector(chain);
      this.root.updateMatrixWorld(true);
      this.solvePositionTowardTarget(chain, proximalLength, distalLength);
      this.root.updateMatrixWorld(true);
      this.softOrientEffector(chain);
      this.root.updateMatrixWorld(true);
      return;
    }

    // Arms take their grip frame first, then repeatedly close the palm
    // offset. No equipment is allowed to move or telescope to hide residual.
    // Under a grip contract the orientation is target-driven and idempotent,
    // so re-orienting to the refined oar/hood frame is exact; only the legacy
    // slerp path must keep its pre-oriented RowErg frame, whose incremental
    // blend a re-orient would invalidate.
    const legacyRowerPreOriented =
      this.options.sport === "rower" && this.handOrientationPrepared && !this.solvedGripPoses;
    if (!legacyRowerPreOriented) {
      this.softOrientEffector(chain);
      this.root.updateMatrixWorld(true);
    }
    for (let pass = 0; pass < 6; pass++) {
      this.solvePositionTowardTarget(chain, proximalLength, distalLength);
      this.root.updateMatrixWorld(true);
    }
    if (this.options.sport === "skierg") {
      // The pole-led frame moves the palm by centimetres relative to the clip
      // wrist, so frame and position are closed alternately: orient, then solve
      // position with that frame held fixed (see solvePositionTowardTarget's
      // preserve). Position has to run last — a trailing orientation set
      // rotates the contact offset and reopens the gap it just closed.
      for (let pass = 0; pass < 4; pass++) {
        this.softOrientEffector(chain);
        this.root.updateMatrixWorld(true);
        this.solvePositionTowardTarget(chain, proximalLength, distalLength);
        this.root.updateMatrixWorld(true);
      }
      if (this.options.sport === "skierg" && this.solvedGripPoses) {
        this.distributeSkiElbowTwist(chain);
      }
    }
  }

  /**
   * Post-solve shoulder share of the SkiErg pronation.
   *
   * After the passes settle, the forearm's local rotation relative to the
   * humerus carries whatever axial twist the hold demanded beyond the wrist
   * keep. Measured against the authored clip's own elbow-seam twist (the
   * clip snapshot's forearm local), the excess is rolled into the humerus
   * about its own long axis — shoulder internal rotation — and the forearm's
   * world orientation is restored, which restores every descendant including
   * the solved grip hand. Joint positions and the hand frame are bit-exact;
   * only the seam distribution changes.
   */
  private distributeSkiElbowTwist(chain: ChainBinding): void {
    const rest = this.wristRest.find((entry) => entry.side === chain.side);
    if (!rest) return;
    const snapshot = this.sampledChainRotations.find((entry) => entry.bone === chain.middle);
    if (!snapshot) return;
    this.wristDelta.copy(snapshot.quaternion).invert().multiply(chain.middle.quaternion);
    const dot =
      this.wristDelta.x * rest.forearmAxisLocal.x +
      this.wristDelta.y * rest.forearmAxisLocal.y +
      this.wristDelta.z * rest.forearmAxisLocal.z;
    let excess = 2 * Math.atan2(dot, this.wristDelta.w);
    if (excess > Math.PI) excess -= 2 * Math.PI;
    else if (excess < -Math.PI) excess += 2 * Math.PI;
    const humerusRoll = excess * REPLAY_V4_SKI_PRONATION_SHOULDER_SHARE;
    if (Math.abs(humerusRoll) < 1e-6) return;
    chain.upper.getWorldPosition(this.rootWorld);
    chain.middle.getWorldPosition(this.middleWorld);
    this.currentDirection.copy(this.middleWorld).sub(this.rootWorld);
    if (this.currentDirection.lengthSq() <= TRANSFORM_EPSILON) return;
    chain.middle.getWorldQuaternion(this.blendedWorldQuaternion);
    this.forearmTwistQuaternion.setFromAxisAngle(this.currentDirection.normalize(), humerusRoll);
    chain.upper.getWorldQuaternion(this.desiredWorldQuaternion);
    this.desiredWorldQuaternion.premultiply(this.forearmTwistQuaternion);
    this.setBoneWorldQuaternion(chain.upper, this.desiredWorldQuaternion);
    this.root.updateMatrixWorld(true);
    this.setBoneWorldQuaternion(chain.middle, this.blendedWorldQuaternion);
    this.root.updateMatrixWorld(true);
  }

  private solvePositionTowardTarget(
    chain: ChainBinding,
    proximalLength: number,
    distalLength: number,
  ): void {
    chain.upper.getWorldPosition(this.rootWorld);
    chain.middle.getWorldPosition(this.middleWorld);
    chain.effector.getWorldPosition(this.effectorWorld);
    chain.target.getWorldPosition(this.targetWorld);
    // Use the effector's current world rotation for the contact offset so palm
    // placement stays consistent with soft orient (never assumes a forced quat).
    chain.effector.getWorldQuaternion(this.rootWorldQuaternion);
    this.preservedEffectorWorldQuaternion.copy(this.rootWorldQuaternion);
    chain.effector.getWorldScale(this.effectorWorldScale);
    this.contactOffsetWorld
      .copy(chain.offset)
      .multiply(this.effectorWorldScale)
      .applyQuaternion(this.rootWorldQuaternion);
    this.desiredEffectorWorld.copy(this.targetWorld).sub(this.contactOffsetWorld);

    this.softDesiredEffector.copy(this.desiredEffectorWorld);

    const maxReach = proximalLength + distalLength - 0.002;
    const minReach = Math.abs(proximalLength - distalLength) + 0.002;
    const reach = this.softDesiredEffector.distanceTo(this.rootWorld);
    if (reach > maxReach && reach > TRANSFORM_EPSILON) {
      this.softDesiredEffector.sub(this.rootWorld).setLength(maxReach).add(this.rootWorld);
    } else if (reach < minReach && reach > TRANSFORM_EPSILON) {
      this.softDesiredEffector.sub(this.rootWorld).setLength(minReach).add(this.rootWorld);
    }

    // Refresh the desired bend plane after every parent swing. Bike knees and
    // RowErg/SkiErg elbows follow their shared mechanical branch markers;
    // other chains retain the current clip-led plane.
    this.refreshBendHint(chain);

    solveTwoBone3D(
      this.rootWorld,
      this.softDesiredEffector,
      proximalLength,
      distalLength,
      this.bendHint,
      this.solvedMiddle,
      this.solvedEnd,
    );
    this.swingBoneToward(chain.upper, chain.middle, this.solvedMiddle);
    this.root.updateMatrixWorld(true);
    chain.upper.getWorldPosition(this.rootWorld);
    chain.middle.getWorldPosition(this.middleWorld);
    this.swingBoneToward(chain.middle, chain.effector, this.solvedEnd);
    if (
      !chain.isLeg &&
      (this.options.sport === "rower" || this.options.sport === "skierg" || this.solvedGripPoses)
    ) {
      // Grip-frame hands need the wrist frame chosen by softOrientEffector to
      // survive parent-bone swings. Counter-rotate the hand after the forearm
      // solve so the palm offset remains stable; the next pass can then close
      // the rigid grip instead of chasing a contact point that moves with
      // every IK pass. This preserves the cylindrical enclosure for sculls,
      // poles, and hoods alike.
      this.root.updateMatrixWorld(true);
      this.setBoneWorldQuaternion(chain.effector, this.preservedEffectorWorldQuaternion);
    }
  }

  /**
   * Terminal orientation.
   *
   * Legs/feet always take the full equipment frame (no forearm twist chain).
   * Under a grip contract every hand also adopts the full grip-channel frame
   * — an 8° slerp measured 48–103° short of the oar and hood frames, which is
   * why fingers curled beside the equipment — and the wrist-budget pass then
   * distributes axial rotation into the forearm instead of corkscrewing the
   * wrist. Without a contract, non-SkiErg arms keep the legacy limited slerp.
   */
  private softOrientEffector(chain: ChainBinding): void {
    chain.effector.getWorldQuaternion(this.rootWorldQuaternion);
    chain.target.getWorldQuaternion(this.targetWorldQuaternion);
    if (chain.isLeg || this.options.sport === "skierg" || this.solvedGripPoses) {
      this.setBoneWorldQuaternion(chain.effector, this.targetWorldQuaternion);
      if (!chain.isLeg && this.solvedGripPoses) this.constrainWristFrame(chain);
      return;
    }
    limitedSlerp(
      this.rootWorldQuaternion,
      this.targetWorldQuaternion,
      this.softAngleBudget(chain),
      this.blendedWorldQuaternion,
    );
    this.setBoneWorldQuaternion(chain.effector, this.blendedWorldQuaternion);
  }

  /**
   * Swing–twist wrist budget, measured against the authored rest pose.
   *
   * The hand's local rotation is decomposed about the forearm-local bone
   * axis: the twist component is pronation/supination, the swing remainder
   * is flexion/deviation. Twist beyond the wrist budget rotates the forearm
   * about its own long axis instead (that axis passes through both elbow and
   * wrist, so neither joint moves), and the hand keeps only the in-budget
   * residual — the grip-channel frame the equipment demanded is preserved
   * as forearm + wrist sharing the rotation, exactly how a real forearm
   * pronates. Swing beyond its budget is clamped outright: anatomy wins over
   * perfect channel alignment, and the position passes re-close the palm.
   */
  private constrainWristFrame(chain: ChainBinding): void {
    const rest = this.wristRest.find((entry) => entry.side === chain.side);
    if (!rest) return;
    const metrics = this.wristMetricsBySide[chain.side < 0 ? "left" : "right"];

    // Deviation from rest expressed in the forearm frame: current = D · rest.
    this.wristDelta
      .copy(chain.effector.quaternion)
      .multiply(this.wristTwist.copy(rest.handRest).invert());
    this.wristAxisLocal.copy(rest.boneAxisLocal);
    const dot =
      this.wristDelta.x * this.wristAxisLocal.x +
      this.wristDelta.y * this.wristAxisLocal.y +
      this.wristDelta.z * this.wristAxisLocal.z;
    // Signed twist about the bone axis; 2·atan2(dot, w) is exact for the
    // normalized (dot·â, w) projection. Wrap to the short representation.
    let twistAngle = 2 * Math.atan2(dot, this.wristDelta.w);
    if (twistAngle > Math.PI) twistAngle -= 2 * Math.PI;
    else if (twistAngle < -Math.PI) twistAngle += 2 * Math.PI;
    this.wristTwist.setFromAxisAngle(this.wristAxisLocal, twistAngle);
    this.wristSwing
      .copy(this.wristDelta)
      .multiply(this.forearmTwistQuaternion.copy(this.wristTwist).invert());

    const twistBudget =
      this.options.sport === "skierg"
        ? REPLAY_V4_SKI_WRIST_TWIST_KEEP
        : REPLAY_V4_WRIST_TWIST_BUDGET;
    const keptTwist = THREE.MathUtils.clamp(twistAngle, -twistBudget, twistBudget);
    const excess = twistAngle - keptTwist;
    if (Math.abs(excess) > 1e-5) {
      // The forearm's long axis passes through both the elbow and the wrist,
      // so rotating the forearm about it and counter-rotating the hand keeps
      // every joint position and the world grip frame bit-exact while the
      // visible twist is shared the way a pronating forearm shares it.
      this.forearmTwistQuaternion.setFromAxisAngle(
        this.forearmAxisLocal.copy(rest.forearmAxisLocal),
        excess,
      );
      chain.middle.quaternion.multiply(this.forearmTwistQuaternion);
      this.forearmTwistQuaternion.invert();
      chain.effector.quaternion.premultiply(this.forearmTwistQuaternion);
      chain.middle.updateMatrixWorld(true);
    }

    // Split the swing into its anatomical components: flexion/extension about
    // the hand's curl axis, radial/ulnar deviation about the remaining axis.
    // Each clamps on its own budget — a healthy 55° of grip extension must
    // not be discarded because a symmetric cone lumped it with deviation.
    const swingHalf = Math.acos(THREE.MathUtils.clamp(Math.abs(this.wristSwing.w), 0, 1));
    const swingAngleFull = 2 * swingHalf;
    const swingSin = Math.sqrt(Math.max(0, 1 - this.wristSwing.w * this.wristSwing.w));
    let flexion = 0;
    let deviation = 0;
    if (swingSin > 1e-7) {
      const flip = this.wristSwing.w >= 0 ? 1 : -1;
      const scale = (swingAngleFull / swingSin) * flip;
      const vx = this.wristSwing.x * scale;
      const vy = this.wristSwing.y * scale;
      const vz = this.wristSwing.z * scale;
      flexion = vx * rest.flexAxisLocal.x + vy * rest.flexAxisLocal.y + vz * rest.flexAxisLocal.z;
      deviation =
        vx * rest.deviationAxisLocal.x +
        vy * rest.deviationAxisLocal.y +
        vz * rest.deviationAxisLocal.z;
    }
    const keptFlexion = THREE.MathUtils.clamp(
      flexion,
      -REPLAY_V4_WRIST_FLEXION_BUDGET,
      REPLAY_V4_WRIST_FLEXION_BUDGET,
    );
    const keptDeviation = THREE.MathUtils.clamp(
      deviation,
      -REPLAY_V4_WRIST_DEVIATION_BUDGET,
      REPLAY_V4_WRIST_DEVIATION_BUDGET,
    );
    const clampedSwing = Math.hypot(flexion - keptFlexion, deviation - keptDeviation);
    if (clampedSwing > 1e-5) {
      // Rebuild the in-budget swing and recompose the hand. This deliberately
      // moves the hand off the requested frame — anatomy wins — and the
      // position pass afterwards re-closes the palm with the clamped frame.
      this.wristAxisLocal
        .copy(rest.flexAxisLocal)
        .multiplyScalar(keptFlexion)
        .addScaledVector(rest.deviationAxisLocal, keptDeviation);
      const keptSwingAngle = this.wristAxisLocal.length();
      if (keptSwingAngle > 1e-7) {
        this.wristAxisLocal.multiplyScalar(1 / keptSwingAngle);
        this.wristSwing.setFromAxisAngle(this.wristAxisLocal, keptSwingAngle);
      } else {
        this.wristSwing.identity();
      }
      this.wristTwist.setFromAxisAngle(this.wristAxisLocal.copy(rest.boneAxisLocal), keptTwist);
      chain.effector.quaternion
        .copy(this.wristSwing)
        .multiply(this.wristTwist)
        .multiply(rest.handRest);
      // The recompose replaced the counter-rotation applied for the twist
      // excess above; restore it so the forearm share stays consistent.
      if (Math.abs(excess) > 1e-5) {
        chain.effector.quaternion.premultiply(this.forearmTwistQuaternion);
      }
    }

    if (!finiteQuaternion(chain.effector.quaternion)) {
      throw new Error("Replay V4 wrist constraint produced an invalid rotation");
    }
    metrics.twist = keptTwist;
    metrics.flexion = keptFlexion;
    metrics.deviation = keptDeviation;
    metrics.forearmTwist = excess;
    metrics.clampedSwing = clampedSwing;
  }

  private getEffectorWorld(chain: ChainBinding, output: THREE.Vector3): void {
    output.copy(chain.offset);
    chain.effector.localToWorld(output);
  }

  private setBoneWorldQuaternion(bone: THREE.Bone, worldQuaternion: THREE.Quaternion): void {
    const boneParent = bone.parent;
    if (!boneParent) throw new Error("Replay V4 effector bone has no parent");
    boneParent.getWorldQuaternion(this.parentWorldQuaternion);
    this.localQuaternion.copy(this.parentWorldQuaternion).invert().multiply(worldQuaternion);
    if (!finiteQuaternion(this.localQuaternion)) {
      throw new Error("Replay V4 effector rotation is invalid");
    }
    bone.quaternion.copy(this.localQuaternion).normalize();
  }

  /** Premultiply a minimal world-space swing; axial clip twist is retained. */
  private swingBoneToward(bone: THREE.Bone, endpoint: THREE.Object3D, target: THREE.Vector3): void {
    bone.getWorldPosition(this.currentWorld);
    endpoint.getWorldPosition(this.effectorWorld);
    this.currentDirection.copy(this.effectorWorld).sub(this.currentWorld);
    this.desiredDirection.copy(target).sub(this.currentWorld);
    if (
      this.currentDirection.lengthSq() <= TRANSFORM_EPSILON ||
      this.desiredDirection.lengthSq() <= TRANSFORM_EPSILON
    ) {
      // Degenerate: leave the clip rotation alone.
      return;
    }
    this.currentDirection.normalize();
    this.desiredDirection.normalize();
    const swingAngle = this.currentDirection.angleTo(this.desiredDirection);
    if (!Number.isFinite(swingAngle) || swingAngle < 1e-6) return;
    this.deltaWorldQuaternion.setFromUnitVectors(this.currentDirection, this.desiredDirection);
    bone.getWorldQuaternion(this.rootWorldQuaternion);
    this.desiredWorldQuaternion.copy(this.deltaWorldQuaternion).multiply(this.rootWorldQuaternion);
    const boneParent = bone.parent;
    if (!boneParent) throw new Error("Replay V4 chain bone has no parent");
    boneParent.getWorldQuaternion(this.parentWorldQuaternion);
    this.localQuaternion
      .copy(this.parentWorldQuaternion)
      .invert()
      .multiply(this.desiredWorldQuaternion);
    if (!finiteQuaternion(this.localQuaternion)) {
      throw new Error("Replay V4 chain rotation is invalid");
    }
    bone.quaternion.copy(this.localQuaternion).normalize();
  }
}

/**
 * Install the skinned hero path without weakening fallback behavior. A null or
 * invalid instance returns null and leaves every procedural node untouched.
 */
export function installReplayV4MotionController(
  options: ReplayV4MotionInstallOptions,
): ReplayV4MotionController | null {
  const instance = options.instance;
  if (!instance) return null;
  try {
    return new InstalledReplayV4MotionController({ ...options, instance });
  } catch {
    instance.root.visible = false;
    instance.root.removeFromParent();
    disposeReplayV4AthleteInstance(instance);
    return null;
  }
}
