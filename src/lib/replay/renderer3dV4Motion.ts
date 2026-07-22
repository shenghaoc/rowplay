import * as THREE from "three";
import type { Sport } from "../types";
import { solveTwoBone3D } from "./figurePose";
import {
  disposeReplayV4AthleteInstance,
  type ReplayV4AthleteInstance,
  type ReplayV4EffectorName,
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
  /** Subtle tint blended into the asset's vertex colours; use white for live. */
  readonly laneColor?: THREE.ColorRepresentation;
  /** Optional bone-local overrides for authored palm/sole contact extras. */
  readonly effectorOffsets?: ReplayV4EffectorOffsetOverrides;
  /** Isolation mode for visual QA; default full contact-constrained solve. */
  readonly diagnosticMode?: ReplayV4DiagnosticMode;
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
}

interface FallbackVisibility {
  readonly object: THREE.Object3D;
  readonly visible: boolean;
}

interface ChainBinding {
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

function styleInstance(
  instance: ReplayV4AthleteInstance,
  options: ReplayV4MotionInstallOptions,
): void {
  const requestedOpacity = THREE.MathUtils.clamp(finite(options.opacity ?? 1, 1), 0, 1);
  const requestedLaneColor = new THREE.Color(options.laneColor ?? 0xffffff);
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
  for (const material of materials) {
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

    this.fallback = collectFallbackVisibility(options.fallbackRoot ?? parent);
    // Contact targets are always terminal authorities. RowErg/SkiErg elbows
    // and BikeErg knees additionally select the anatomical two-bone branch.
    this.chains = [
      {
        upper: requireBone(instance, "v4LeftUpperArm"),
        middle: requireBone(instance, "v4LeftForearm"),
        effector: requireBone(instance, instance.effectors.leftHand.bone),
        target: targets.leftHand,
        jointTarget: targets.leftElbow,
        offset: offsetFor(instance, "leftHand", options.effectorOffsets),
        isLeg: false,
      },
      {
        upper: requireBone(instance, "v4RightUpperArm"),
        middle: requireBone(instance, "v4RightForearm"),
        effector: requireBone(instance, instance.effectors.rightHand.bone),
        target: targets.rightHand,
        jointTarget: targets.rightElbow,
        offset: offsetFor(instance, "rightHand", options.effectorOffsets),
        isLeg: false,
      },
      {
        upper: requireBone(instance, "v4LeftUpperLeg"),
        middle: requireBone(instance, "v4LeftLowerLeg"),
        effector: requireBone(instance, instance.effectors.leftFoot.bone),
        target: targets.leftFoot,
        jointTarget: targets.leftKnee,
        offset: offsetFor(instance, "leftFoot", options.effectorOffsets),
        isLeg: true,
      },
      {
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

  getShoulderWorld(side: "left" | "right", output = new THREE.Vector3()): THREE.Vector3 {
    const bone =
      side === "left"
        ? this.options.instance.bones.v4LeftUpperArm
        : this.options.instance.bones.v4RightUpperArm;
    return bone.getWorldPosition(output);
  }

  getHandContactOffsetWorld(side: "left" | "right", output = new THREE.Vector3()): THREE.Vector3 {
    const name = side === "left" ? "leftHand" : "rightHand";
    const metric = this.options.instance.effectors[name];
    const bone = this.options.instance.bones[metric.bone];
    this.getContactWorld(name, output);
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

  constrain(): boolean {
    if (!this.enabled || !this.prepared) return false;
    try {
      const mode = this.diagnosticMode;

      if (mode === "full" || mode === "clip-hands" || mode === "skeleton" || mode === "shadows") {
        for (const chain of this.chains) this.correctContactChain(chain);
      } else if (mode === "clip-pelvis" || mode === "clip-only") {
        // Pure clip (+ optional pelvis): no contact correction.
      } else {
        // Visual isolation modes still keep rigid contact so the hero reads as
        // equipment-connected while materials change.
        for (const chain of this.chains) this.correctContactChain(chain);
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
      return true;
    } catch (error) {
      this.prepared = false;
      this.handOrientationPrepared = false;
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
  }

  private assertPelvisAligned(): void {
    this.options.targets.pelvis.getWorldPosition(this.targetWorld);
    this.hips.getWorldPosition(this.currentWorld);
    const residual = this.currentWorld.distanceTo(this.targetWorld);
    if (!Number.isFinite(residual) || residual > 1e-5) {
      throw new Error(`Replay V4 pelvis alignment drifted by ${residual.toFixed(6)} m`);
    }
  }

  private softAngleBudget(chain: ChainBinding): number {
    return chain.isLeg ? LEG_SOFT_ANGLE_RAD : ARM_SOFT_ANGLE_RAD;
  }

  private usesSharedJointTarget(chain: ChainBinding): boolean {
    // Every planted/contact-driven leg needs the deterministic rig's knee
    // branch. RowErg raises both knees above the cockpit, BikeErg keeps them
    // aligned with opposed pedals, and SkiErg keeps each knee over its own ski.
    // Retaining the mirrored SkiErg clip plane after locking both feet allowed
    // the left and right thighs to solve through one another even though the
    // boots themselves remained correctly separated.
    if (chain.isLeg) return true;
    return this.options.sport === "rower" || this.options.sport === "skierg";
  }

  /**
   * Close one rigid contact chain on top of the authored clip pose.
   *
   * Most bend planes come from the sampled clip. RowErg and SkiErg are the
   * deliberate arm exceptions: a rigid grip can close on either elbow branch,
   * so the reference-backed shared marker chooses the rearward/sagittal one.
   * All leg chains likewise use their mechanically solved knee target so a
   * contact-locked foot can never select the opposite-side knee branch.
   */
  private correctContactChain(chain: ChainBinding): void {
    chain.upper.getWorldPosition(this.rootWorld);
    chain.middle.getWorldPosition(this.middleWorld);
    chain.effector.getWorldPosition(this.effectorWorld);
    chain.target.getWorldPosition(this.targetWorld);

    if (this.usesSharedJointTarget(chain)) {
      chain.jointTarget.getWorldPosition(this.bendHint);
      this.bendHint.sub(this.rootWorld);
    } else {
      this.bendHint.copy(this.middleWorld).sub(this.rootWorld);
    }
    if (this.bendHint.lengthSq() <= TRANSFORM_EPSILON) {
      this.bendHint.set(0, chain.isLeg ? 1 : -1, 0);
    }

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

    // Arms keep a restrained terminal frame, then repeatedly close the palm
    // offset. No equipment is allowed to move or telescope to hide residual.
    // The renderer pre-orients RowErg hands before refining the rigid oar arc,
    // so its wrist→palm vector is part of that exact solve. Re-orienting here
    // would invalidate the refined target and reintroduce a visible grip gap.
    if (!(this.options.sport === "rower" && this.handOrientationPrepared)) {
      this.softOrientEffector(chain);
      this.root.updateMatrixWorld(true);
    }
    for (let pass = 0; pass < 6; pass++) {
      this.solvePositionTowardTarget(chain, proximalLength, distalLength);
      this.root.updateMatrixWorld(true);
    }
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
    if (this.usesSharedJointTarget(chain)) {
      chain.jointTarget.getWorldPosition(this.bendHint);
      this.bendHint.sub(this.rootWorld);
    } else {
      this.bendHint.copy(this.middleWorld).sub(this.rootWorld);
    }
    if (this.bendHint.lengthSq() <= TRANSFORM_EPSILON) {
      this.bendHint.set(0, chain.isLeg ? 1 : -1, 0);
    }

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
    if (!chain.isLeg && this.options.sport === "rower") {
      // RowErg's long, centreline-bound reach needs the wrist frame chosen by
      // softOrientEffector to survive its parent-bone swings. Counter-rotate
      // the hand after the forearm solve so the palm offset remains stable;
      // the next pass can then close the rigid grip instead of chasing a
      // contact point that moves with every IK pass. SkiErg deliberately keeps
      // its existing pole-led terminal rotation through the vertical press.
      this.root.updateMatrixWorld(true);
      this.setBoneWorldQuaternion(chain.effector, this.preservedEffectorWorldQuaternion);
    }
  }

  /**
   * Terminal orientation.
   * Arms: limited slerp only — forced equipment quats corkscrewed forearms.
   * Legs/feet: full equipment frame is safe (no forearm twist chain) and needed
   * for sole/pedal contact with non-zero contact offsets.
   */
  private softOrientEffector(chain: ChainBinding): void {
    chain.effector.getWorldQuaternion(this.rootWorldQuaternion);
    chain.target.getWorldQuaternion(this.targetWorldQuaternion);
    if (chain.isLeg) {
      this.setBoneWorldQuaternion(chain.effector, this.targetWorldQuaternion);
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
