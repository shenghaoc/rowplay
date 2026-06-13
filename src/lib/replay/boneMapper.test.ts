import { describe, it, expect } from "vite-plus/test";
import * as THREE from "three";
import { solveTwoBoneIK, lookAtRotation, BoneMapper, findBone } from "./boneMapper";

describe("solveTwoBoneIK", () => {
  it("produces a valid mid joint position for a straight reach", () => {
    const result = solveTwoBoneIK(
      [0, 0, 0], // root
      [0, -0.3, 0], // mid hint (hanging down)
      [0, -0.5, 0], // target straight down
      0.28, // upper len
      0.26, // lower len
    );
    // Mid position should be between root and target
    expect(result.midPos.y).toBeLessThan(0);
    expect(result.midPos.y).toBeGreaterThan(-0.5);
    // Quaternions should be valid (not NaN)
    expect(result.upperQuat.length()).toBeCloseTo(1, 3);
    expect(result.lowerQuat.length()).toBeCloseTo(1, 3);
  });

  it("clamps when target is beyond reach", () => {
    const result = solveTwoBoneIK(
      [0, 0, 0],
      [0, -0.3, 0],
      [0, -2, 0], // way beyond reach
      0.28,
      0.26,
    );
    // Should not produce NaN
    expect(Number.isFinite(result.midPos.length())).toBe(true);
    expect(result.upperQuat.length()).toBeCloseTo(1, 3);
  });

  it("handles collinear root-target-hint", () => {
    const result = solveTwoBoneIK([0, 0, 0], [0, -0.3, 0], [0, -0.5, 0], 0.28, 0.26);
    expect(Number.isFinite(result.midPos.length())).toBe(true);
  });
});

describe("lookAtRotation", () => {
  it("produces a valid quaternion", () => {
    const q = lookAtRotation([0, 0, 0], [0, 0, 1]);
    expect(q.length()).toBeCloseTo(1, 3);
  });
});

describe("BoneMapper", () => {
  function makeFakeSkeleton(): THREE.Object3D {
    const root = new THREE.Group();
    const bones = [
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
    for (const name of bones) {
      const bone = new THREE.Bone();
      bone.name = `mixamorig:${name}`;
      root.add(bone);
    }
    return root;
  }

  it("finds bones by name", () => {
    const root = makeFakeSkeleton();
    const mapper = new BoneMapper(root);
    expect(mapper.getBone("Hips")).toBeInstanceOf(THREE.Bone);
    expect(mapper.getBone("LeftArm")).toBeInstanceOf(THREE.Bone);
    expect(mapper.getBone("Nonexistent")).toBeNull();
  });

  it("applyPose does not throw", () => {
    const root = makeFakeSkeleton();
    const mapper = new BoneMapper(root);
    expect(() => {
      mapper.applyPose({
        hip: [0, 0.9, 0],
        torsoLayback: -0.2,
        arms: [
          {
            side: -1,
            shoulder: [-0.26, 0.8, 0.02],
            elbow: [-0.24, 0.6, 0.06],
            hand: [-0.18, 0.72, 0.58],
          },
          {
            side: 1,
            shoulder: [0.26, 0.8, 0.02],
            elbow: [0.24, 0.6, 0.06],
            hand: [0.18, 0.72, 0.58],
          },
        ],
        legs: [
          {
            side: -1,
            hip: [-0.12, 0.38, -0.14],
            knee: [-0.14, 0.3, 0.1],
            foot: [-0.12, 0.28, 0.7],
          },
          {
            side: 1,
            hip: [0.12, 0.38, -0.14],
            knee: [0.14, 0.3, 0.1],
            foot: [0.12, 0.28, 0.7],
          },
        ],
      });
    }).not.toThrow();
  });
});
