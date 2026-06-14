import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { createRiggedAvatar, BONE_COUNT, BoneIdx } from "./avatarMesh";

describe("createRiggedAvatar", () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x336699 });

  it("returns a THREE.SkinnedMesh instance", () => {
    const mesh = createRiggedAvatar(material);
    expect(mesh).toBeInstanceOf(THREE.SkinnedMesh);
  });

  it("has a skeleton with the correct bone count", () => {
    const mesh = createRiggedAvatar(material);
    expect(mesh.skeleton).toBeDefined();
    expect(mesh.skeleton.bones.length).toBe(BONE_COUNT);
  });

  it("names the bones per the spec", () => {
    const mesh = createRiggedAvatar(material);
    const names = mesh.skeleton.bones.map((b) => b.name);
    expect(names).toEqual([
      "Hips",
      "Spine",
      "Chest",
      "Neck",
      "Head",
      "LeftUpLeg",
      "LeftLeg",
      "LeftFoot",
      "RightUpLeg",
      "RightLeg",
      "RightFoot",
      "LeftArm",
      "LeftForeArm",
      "LeftHand",
      "RightArm",
      "RightForeArm",
      "RightHand",
    ]);
  });

  it("has valid skin weights (non-negative, sum to ~1 per vertex)", () => {
    const mesh = createRiggedAvatar(material);
    const geo = mesh.geometry;
    const weights = geo.attributes.skinWeight as THREE.BufferAttribute;
    const count = weights.count;

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const w0 = weights.getX(i);
      const w1 = weights.getY(i);
      const w2 = weights.getZ(i);
      const w3 = weights.getW(i);

      // All weights are non-negative
      expect(w0).toBeGreaterThanOrEqual(0);
      expect(w1).toBeGreaterThanOrEqual(0);
      expect(w2).toBeGreaterThanOrEqual(0);
      expect(w3).toBeGreaterThanOrEqual(0);

      // Weights sum to ~1 (float tolerance)
      const sum = w0 + w1 + w2 + w3;
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    }
  });

  it("has valid skin indices (all within bone range)", () => {
    const mesh = createRiggedAvatar(material);
    const geo = mesh.geometry;
    const indices = geo.attributes.skinIndex as THREE.BufferAttribute;
    const count = indices.count;

    for (let i = 0; i < count; i++) {
      for (let c = 0; c < 4; c++) {
        const idx = indices.getComponent(i, c);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(BONE_COUNT);
      }
    }
  });

  it("has a non-empty geometry with position and normal attributes", () => {
    const mesh = createRiggedAvatar(material);
    const geo = mesh.geometry;

    expect(geo.attributes.position).toBeDefined();
    expect(geo.attributes.normal).toBeDefined();
    expect(geo.attributes.position.count).toBeGreaterThan(100);
  });

  it("has Hips as the root bone (child of the mesh)", () => {
    const mesh = createRiggedAvatar(material);
    const hips = mesh.skeleton.bones[BoneIdx.Hips];
    // After mesh.add(bones[0]), the root bone's parent is the mesh itself
    expect(hips.parent).toBe(mesh);
  });

  it("positions hips at the expected bind-pose height", () => {
    const mesh = createRiggedAvatar(material);
    const hips = mesh.skeleton.bones[BoneIdx.Hips];
    const worldPos = new THREE.Vector3();
    hips.getWorldPosition(worldPos);
    expect(worldPos.y).toBeCloseTo(0.95, 1);
  });

  it("uses the provided material on the mesh", () => {
    const mesh = createRiggedAvatar(material);
    expect(mesh.material).toBe(material);
  });
});
