import * as THREE from "three";

type Point3 = readonly [number, number, number];

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Solve two-bone IK: given a root joint, a mid joint hint, and an end
 * effector target, compute rotations for the upper and lower bones.
 */
export function solveTwoBoneIK(
  root: Point3,
  midHint: Point3,
  target: Point3,
  upperLen: number,
  lowerLen: number,
): { midPos: THREE.Vector3; upperQuat: THREE.Quaternion; lowerQuat: THREE.Quaternion } {
  const rootV = _vA.set(root[0], root[1], root[2]);
  const targetV = _vB.set(target[0], target[1], target[2]);
  const hintV = _vC.set(midHint[0], midHint[1], midHint[2]);

  const rootToTarget = targetV.clone().sub(rootV);

  // Clamp: if target is beyond reach, stretch fully
  const maxReach = upperLen + lowerLen - 0.001;
  if (rootToTarget.length() > maxReach) {
    rootToTarget.normalize().multiplyScalar(maxReach);
    targetV.copy(rootV).add(rootToTarget);
  }

  // Law of cosines: angle at root for the upper bone
  const a = upperLen;
  const b = lowerLen;
  const c = rootToTarget.length();
  const cosAngleAtRoot = (a * a + c * c - b * b) / (2 * a * c);
  const angleAtRoot = Math.acos(Math.max(-1, Math.min(1, cosAngleAtRoot)));

  // Direction from root to target
  const dir = _dir.copy(rootToTarget).normalize();

  // Compute the plane of the IK chain using the mid hint
  const rootToHint = hintV.clone().sub(rootV);
  const planeNormal = new THREE.Vector3().crossVectors(dir, rootToHint);
  if (planeNormal.lengthSq() < 0.0001) {
    // Hint is collinear with root→target; use a fallback up vector
    planeNormal.crossVectors(dir, _up);
    if (planeNormal.lengthSq() < 0.0001) {
      planeNormal.crossVectors(dir, new THREE.Vector3(1, 0, 0));
    }
  }
  planeNormal.normalize();

  // Rotate the direction by angleAtRoot around the plane normal to get
  // the upper bone direction
  const upperDir = dir.clone().applyAxisAngle(planeNormal, -angleAtRoot).normalize();

  // Mid joint position
  const midPos = rootV.clone().add(upperDir.multiplyScalar(upperLen));

  // Lower bone direction: mid → target
  const lowerDir = targetV.clone().sub(midPos).normalize();

  // Compute quaternions: rotate from default up to bone direction
  const defaultDir = new THREE.Vector3(0, 1, 0);
  const upperQuat = _qA.setFromUnitVectors(defaultDir, upperDir);
  const lowerQuat = _qB.setFromUnitVectors(defaultDir, lowerDir);

  return {
    midPos,
    upperQuat: upperQuat.clone(),
    lowerQuat: lowerQuat.clone(),
  };
}

/**
 * Compute a look-at quaternion for a bone that should face a target direction.
 * Assumes the bone's default forward is +Z.
 */
export function lookAtRotation(from: Point3, to: Point3, up: Point3 = [0, 1, 0]): THREE.Quaternion {
  const pos = _vA.set(from[0], from[1], from[2]);
  const tgt = _vB.set(to[0], to[1], to[2]);
  const upV = _vC.set(up[0], up[1], up[2]);
  const mat = new THREE.Matrix4().lookAt(pos, tgt, upV);
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}

/**
 * Find a bone by name, trying with and without mixamorig prefix.
 */
export function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  const prefixed = `mixamorig:${name}`;
  let found: THREE.Bone | null = null;
  root.traverse((obj) => {
    if (found) return;
    if (obj instanceof THREE.Bone && (obj.name === name || obj.name === prefixed)) {
      found = obj;
    }
  });
  return found;
}

/**
 * Per-frame bone targets extracted from the existing IK system.
 */
export interface BoneTargets {
  /** Hip/root position */
  hip: Point3;
  /** Torso layback angle (radians, 0 = upright) */
  torsoLayback: number;
  /** Per-side arm targets */
  arms: {
    side: number;
    shoulder: Point3;
    elbow: Point3;
    hand: Point3;
  }[];
  /** Per-side leg targets */
  legs: {
    side: number;
    hip: Point3;
    knee: Point3;
    foot: Point3;
  }[];
  /** Head look-at direction (optional) */
  headTarget?: Point3;
}

/**
 * Drives a GLTF skeleton from IK target positions each frame.
 */
export class BoneMapper {
  private bones = new Map<string, THREE.Bone>();

  constructor(root: THREE.Object3D) {
    // Cache standard Mixamo bone names
    const names = [
      "Hips",
      "Spine",
      "Spine1",
      "Spine2",
      "LeftArm",
      "LeftForeArm",
      "LeftHand",
      "RightArm",
      "RightForeArm",
      "RightHand",
      "LeftUpLeg",
      "LeftLeg",
      "LeftFoot",
      "RightUpLeg",
      "RightLeg",
      "RightFoot",
      "Neck",
      "Head",
    ];
    for (const name of names) {
      const bone = findBone(root, name);
      if (bone) this.bones.set(name, bone);
    }
  }

  /** Get a cached bone by name (for testing). */
  getBone(name: string): THREE.Bone | null {
    return this.bones.get(name) ?? null;
  }

  /** Apply IK targets to the skeleton bones. */
  applyPose(targets: BoneTargets): void {
    // Hips: direct position
    const hips = this.bones.get("Hips");
    if (hips) {
      hips.position.set(targets.hip[0], targets.hip[1], targets.hip[2]);
    }

    // Spine: distribute layback across spine bones
    const spine = this.bones.get("Spine");
    const spine1 = this.bones.get("Spine1");
    if (spine) spine.rotation.x = targets.torsoLayback * 0.5;
    if (spine1) spine1.rotation.x = targets.torsoLayback * 0.5;

    // Arms: two-bone IK per side
    for (const arm of targets.arms) {
      const prefix = arm.side < 0 ? "Left" : "Right";
      const upperBone = this.bones.get(`${prefix}Arm`);
      const lowerBone = this.bones.get(`${prefix}ForeArm`);
      if (!upperBone || !lowerBone) continue;

      const result = solveTwoBoneIK(
        arm.shoulder,
        arm.elbow,
        arm.hand,
        0.28, // approximate upper arm length
        0.26, // approximate forearm length
      );
      upperBone.quaternion.copy(result.upperQuat);
      lowerBone.quaternion.copy(result.lowerQuat);
    }

    // Legs: two-bone IK per side
    for (const leg of targets.legs) {
      const prefix = leg.side < 0 ? "Left" : "Right";
      const upperBone = this.bones.get(`${prefix}UpLeg`);
      const lowerBone = this.bones.get(`${prefix}Leg`);
      if (!upperBone || !lowerBone) continue;

      const result = solveTwoBoneIK(
        leg.hip,
        leg.knee,
        leg.foot,
        0.4, // approximate thigh length
        0.38, // approximate shin length
      );
      upperBone.quaternion.copy(result.upperQuat);
      lowerBone.quaternion.copy(result.lowerQuat);
    }

    // Head: look-at
    if (targets.headTarget) {
      const head = this.bones.get("Head");
      if (head) {
        const headPos: Point3 = [head.position.x, head.position.y, head.position.z];
        head.quaternion.copy(lookAtRotation(headPos, targets.headTarget));
      }
    }
  }
}
