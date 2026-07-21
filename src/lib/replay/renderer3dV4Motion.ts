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
const CONTACT_TOLERANCE_METERS = 0.015;
const CONTACT_ANGLE_TOLERANCE = THREE.MathUtils.degToRad(0.5);

/** The procedural rig remains authoritative for these equipment contacts. */
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
}

export interface ReplayV4MotionController {
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  readonly enabled: boolean;
  /** Samples the clip, aligns the pelvis, then corrects all four contact chains. */
  update(sample: ReplayV4MotionSample): boolean;
  /** Restores the exact fallback visibility snapshot and releases lane-owned resources. */
  dispose(): void;
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
  readonly bendTarget: THREE.Object3D;
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
  const opacity = THREE.MathUtils.clamp(finite(options.opacity ?? 1, 1), 0, 1);
  const requestedLaneColor = new THREE.Color(options.laneColor ?? 0xffffff);
  // A saturated lane colour used as a direct multiplier destroys authored skin
  // and kit separation. Keep identity legibility, then bias a translucent ghost
  // just enough to distinguish it at a glance.
  const laneColor = new THREE.Color(0xffffff).lerp(requestedLaneColor, opacity < 1 ? 0.26 : 0.14);
  const materials = Array.isArray(instance.mesh.material)
    ? instance.mesh.material
    : [instance.mesh.material];
  for (const material of materials) {
    material.opacity = opacity;
    material.transparent = opacity < 1;
    material.depthWrite = opacity >= 0.98;
    const colored = material as THREE.Material & { color?: THREE.Color };
    if (colored.color instanceof THREE.Color) colored.color.copy(laneColor);
    material.needsUpdate = true;
  }
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

class InstalledReplayV4MotionController implements ReplayV4MotionController {
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;

  private active = true;
  private revealed = false;
  private disposed = false;
  private readonly action: THREE.AnimationAction;
  private readonly fallback: readonly FallbackVisibility[];
  private readonly hips: THREE.Bone;
  private readonly chains: readonly ChainBinding[];
  private readonly baseRootPosition = new THREE.Vector3();
  private readonly baseRootQuaternion = new THREE.Quaternion();
  private readonly baseRootScale = new THREE.Vector3();
  /**
   * Last authored clip sample for every bone that IK mutates. Three.js keeps
   * an internal two-buffer PropertyMixer cache and skips writing a binding
   * when two consecutive samples are equal. Restoring these sampled values
   * before seeking makes that optimisation safe: a same-time seek starts from
   * the authored pose rather than the previous frame's post-IK rotations.
   */
  private readonly sampledChainRotations: readonly BoneRotationSnapshot[];

  // All update scratch is controller-owned. Live and ghost lanes therefore
  // share neither matrices nor IK state, and the hot path creates no objects.
  private readonly targetWorld = new THREE.Vector3();
  private readonly currentWorld = new THREE.Vector3();
  private readonly targetLocal = new THREE.Vector3();
  private readonly currentLocal = new THREE.Vector3();
  private readonly rootWorld = new THREE.Vector3();
  private readonly middleWorld = new THREE.Vector3();
  private readonly effectorWorld = new THREE.Vector3();
  private readonly bendWorld = new THREE.Vector3();
  private readonly bendHint = new THREE.Vector3();
  private readonly oracleBendHint = new THREE.Vector3();
  private readonly solvedMiddle = new THREE.Vector3();
  private readonly solvedEnd = new THREE.Vector3();
  private readonly desiredEffectorWorld = new THREE.Vector3();
  private readonly contactOffsetWorld = new THREE.Vector3();
  private readonly effectorWorldScale = new THREE.Vector3();
  private readonly currentDirection = new THREE.Vector3();
  private readonly desiredDirection = new THREE.Vector3();
  private readonly parentWorldQuaternion = new THREE.Quaternion();
  private readonly targetWorldQuaternion = new THREE.Quaternion();
  private readonly rootWorldQuaternion = new THREE.Quaternion();
  private readonly deltaWorldQuaternion = new THREE.Quaternion();
  private readonly desiredWorldQuaternion = new THREE.Quaternion();
  private readonly localQuaternion = new THREE.Quaternion();

  constructor(
    private readonly options: ReplayV4MotionInstallOptions & { instance: ReplayV4AthleteInstance },
  ) {
    const { instance, sport, parent, targets } = options;
    this.root = instance.root;
    this.mesh = instance.mesh;
    this.hips = requireBone(instance, "v4Hips");
    const timing = instance.clipTimingBySport[sport];
    if (!timing?.clip || !(timing.clip.duration > 0)) {
      throw new Error(`Replay V4 motion is missing the ${sport} clip`);
    }

    this.fallback = collectFallbackVisibility(options.fallbackRoot ?? parent);
    this.chains = [
      {
        upper: requireBone(instance, "v4LeftUpperArm"),
        middle: requireBone(instance, "v4LeftForearm"),
        effector: requireBone(instance, instance.effectors.leftHand.bone),
        target: targets.leftHand,
        bendTarget: targets.leftElbow,
        offset: offsetFor(instance, "leftHand", options.effectorOffsets),
        isLeg: false,
      },
      {
        upper: requireBone(instance, "v4RightUpperArm"),
        middle: requireBone(instance, "v4RightForearm"),
        effector: requireBone(instance, instance.effectors.rightHand.bone),
        target: targets.rightHand,
        bendTarget: targets.rightElbow,
        offset: offsetFor(instance, "rightHand", options.effectorOffsets),
        isLeg: false,
      },
      {
        upper: requireBone(instance, "v4LeftUpperLeg"),
        middle: requireBone(instance, "v4LeftLowerLeg"),
        effector: requireBone(instance, instance.effectors.leftFoot.bone),
        target: targets.leftFoot,
        bendTarget: targets.leftKnee,
        offset: offsetFor(instance, "leftFoot", options.effectorOffsets),
        isLeg: true,
      },
      {
        upper: requireBone(instance, "v4RightUpperLeg"),
        middle: requireBone(instance, "v4RightLowerLeg"),
        effector: requireBone(instance, instance.effectors.rightFoot.bone),
        target: targets.rightFoot,
        bendTarget: targets.rightKnee,
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

  update(sample: ReplayV4MotionSample): boolean {
    if (!this.enabled) return false;
    try {
      if (this.root.parent !== this.options.parent) {
        throw new Error("Replay V4 athlete detached from its lane parent");
      }
      const timing = this.options.instance.clipTimingBySport[this.options.sport];
      const fraction = clipFraction(sample, finite(sample.driveFrac ?? 0.4, 0.4), timing.driveEnd);
      // Every seek begins from the same authored basis. AnimationMixer writes
      // tracked bones next; this reset also makes sparse clips deterministic.
      this.root.position.copy(this.baseRootPosition);
      this.root.quaternion.copy(this.baseRootQuaternion);
      this.root.scale.copy(this.baseRootScale);
      for (const state of this.sampledChainRotations) {
        state.bone.quaternion.copy(state.quaternion);
      }
      this.options.instance.mixer.setTime(fraction * timing.clip.duration);
      // Capture before IK overwrites the chain. If PropertyMixer skips an
      // unchanged clip sample, the restored authored values above are already
      // correct and are captured unchanged.
      for (const state of this.sampledChainRotations) {
        state.quaternion.copy(state.bone.quaternion);
      }
      this.root.updateMatrixWorld(true);
      this.alignPelvis();
      this.assertPelvisAligned();
      for (const chain of this.chains) this.solveChain(chain);
      this.root.updateMatrixWorld(true);
      this.assertPelvisAligned();
      this.options.instance.skeleton.update();
      // Re-assert every frame: procedural limb placement runs earlier in the
      // same tick and historically forced segment.visible = true, which would
      // otherwise resurrect the V3 arm/leg tubes beside the skinned hero.
      setFallbackVisibility(this.fallback, true);
      if (!this.revealed) {
        this.root.visible = true;
        this.revealed = true;
      }
      return true;
    } catch (error) {
      this.root.userData.replayV4Failure =
        error instanceof Error ? error.message : "Replay V4 motion update failed";
      this.disable();
      return false;
    }
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

    // The lane parent already supplies course heading. Only align translation:
    // matching the hidden pelvis quaternion here would algebraically cancel the
    // authored hip pitch/roll that makes the skin read as an animated body.
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

  private solveChain(chain: ChainBinding): void {
    chain.upper.getWorldPosition(this.rootWorld);
    chain.middle.getWorldPosition(this.middleWorld);
    chain.effector.getWorldPosition(this.effectorWorld);
    chain.target.getWorldPosition(this.targetWorld);
    chain.bendTarget.getWorldPosition(this.bendWorld);

    // Equipment contacts are procedural-authoritative. The clip still supplies
    // a useful bend plane for free limbs, but crank-locked bike legs and the
    // long SkiErg double-pole press must follow the procedural oracle closely
    // or the joint flips / stalls in front of the body.
    this.bendHint.copy(this.middleWorld).sub(this.rootWorld);
    this.oracleBendHint.copy(this.bendWorld).sub(this.rootWorld);
    const sport = this.options.sport;
    // Arms and bike legs are equipment-locked: trust the procedural oracle bend
    // plane so clip elbows cannot chicken-wing or flip forward of the grips.
    const oracleWeight = chain.isLeg
      ? sport === "bike"
        ? 0.92
        : 0.55
      : sport === "skierg"
        ? 0.88
        : 0.82;
    const clipWeight = 1 - oracleWeight;
    if (this.oracleBendHint.lengthSq() > TRANSFORM_EPSILON) {
      this.oracleBendHint.normalize();
      if (this.bendHint.lengthSq() > TRANSFORM_EPSILON) {
        this.bendHint
          .normalize()
          .multiplyScalar(clipWeight)
          .addScaledVector(this.oracleBendHint, oracleWeight);
      } else {
        this.bendHint.copy(this.oracleBendHint);
      }
    } else if (this.bendHint.lengthSq() <= TRANSFORM_EPSILON) {
      this.bendHint.set(0, chain.isLeg ? 1 : -1, 0);
    }

    // Procedural hand/shoe targets carry the equipment contact frame. Solve
    // the wrist/ankle origin first, then orient the terminal bone so the
    // authored palm/sole offset lands on the contact without twisting free.
    chain.target.getWorldQuaternion(this.targetWorldQuaternion);
    chain.effector.getWorldScale(this.effectorWorldScale);
    this.contactOffsetWorld
      .copy(chain.offset)
      .multiply(this.effectorWorldScale)
      .applyQuaternion(this.targetWorldQuaternion);
    this.desiredEffectorWorld.copy(this.targetWorld).sub(this.contactOffsetWorld);

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

    solveTwoBone3D(
      this.rootWorld,
      this.desiredEffectorWorld,
      proximalLength,
      distalLength,
      this.bendHint,
      this.solvedMiddle,
      this.solvedEnd,
    );
    this.swingBoneToward(chain.upper, chain.middle, this.solvedMiddle);
    this.root.updateMatrixWorld(true);
    this.swingBoneToward(chain.middle, chain.effector, this.solvedEnd);
    this.root.updateMatrixWorld(true);
    this.setBoneWorldQuaternion(chain.effector, this.targetWorldQuaternion);
    this.root.updateMatrixWorld(true);
    this.getEffectorWorld(chain, this.effectorWorld);
    chain.target.getWorldPosition(this.targetWorld);
    if (this.effectorWorld.distanceTo(this.targetWorld) > CONTACT_TOLERANCE_METERS) {
      throw new Error("Replay V4 contact lies outside the authored limb reach");
    }
    chain.effector.getWorldQuaternion(this.rootWorldQuaternion);
    chain.target.getWorldQuaternion(this.targetWorldQuaternion);
    if (this.rootWorldQuaternion.angleTo(this.targetWorldQuaternion) > CONTACT_ANGLE_TOLERANCE) {
      throw new Error("Replay V4 contact frame could not be resolved");
    }
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
      throw new Error("Replay V4 chain direction is degenerate");
    }
    this.currentDirection.normalize();
    this.desiredDirection.normalize();
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
