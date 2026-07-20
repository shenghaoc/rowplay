import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { V4_BONE_NAMES } from "./rigV4";

type V4Contract = {
  readonly mesh: {
    readonly triangles: number;
  };
  readonly animation: {
    readonly clips: readonly { readonly name: string; readonly durationSeconds: number }[];
  };
};

async function loadUsdAthlete() {
  const [assetBytes, contractText] = await Promise.all([
    readFile("static/replay-assets/rowplay-athlete-v4.usdz"),
    readFile("static/replay-assets/rowplay-athlete-v4.contract.json", "utf8"),
  ]);
  const contract = JSON.parse(contractText) as V4Contract;
  const buffer = assetBytes.buffer.slice(
    assetBytes.byteOffset,
    assetBytes.byteOffset + assetBytes.byteLength,
  );
  const group = new USDLoader().parse(buffer);
  const skinned: THREE.SkinnedMesh[] = [];
  group.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(object as THREE.SkinnedMesh);
  });
  return { assetBytes, contract, group, skinned };
}

function cloneUsdAthleteInstance(group: THREE.Group): THREE.Group {
  const instance = clone(group) as THREE.Group;
  instance.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
  });
  return instance;
}

describe("RowPlay V4 USDZ native handoff", () => {
  it("loads as the same one-skinned-athlete contract in Three.js", async () => {
    const { assetBytes, contract, skinned } = await loadUsdAthlete();
    const decoded = assetBytes.toString("latin1");

    expect(decoded).not.toContain("http://");
    expect(decoded).not.toContain("https://");
    expect(decoded).not.toContain("file://");
    expect(decoded).not.toContain("/Users/");
    expect(skinned).toHaveLength(1);

    const mesh = skinned[0];
    expect(mesh.skeleton.bones.map((bone) => bone.name)).toEqual([...V4_BONE_NAMES]);
    const position = mesh.geometry.getAttribute("position");
    const skinIndex = mesh.geometry.getAttribute("skinIndex");
    const skinWeight = mesh.geometry.getAttribute("skinWeight");
    expect(position).toBeDefined();
    expect(skinIndex?.count).toBe(position.count);
    expect(skinWeight?.count).toBe(position.count);

    let triangleCount = position.count / 3;
    const index = mesh.geometry.getIndex();
    if (index) triangleCount = index.count / 3;
    expect(triangleCount).toBe(contract.mesh.triangles);

    for (let vertex = 0; vertex < skinWeight.count; vertex++) {
      const sum =
        skinWeight.getX(vertex) +
        skinWeight.getY(vertex) +
        skinWeight.getZ(vertex) +
        skinWeight.getW(vertex);
      expect(Number.isFinite(sum)).toBe(true);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-5);
      for (let component = 0; component < 4; component++) {
        expect(skinIndex.getComponent(vertex, component)).toBeGreaterThanOrEqual(0);
        expect(skinIndex.getComponent(vertex, component)).toBeLessThan(V4_BONE_NAMES.length);
      }
    }

    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    expect(box).not.toBeNull();
    expect(
      [box!.min.x, box!.min.y, box!.min.z, box!.max.x, box!.max.y, box!.max.z].every(
        Number.isFinite,
      ),
    ).toBe(true);
    expect(box!.max.x - box!.min.x).toBeGreaterThan(0.45);
    expect(box!.max.z - box!.min.z).toBeGreaterThan(1.6);

    for (const bone of mesh.skeleton.bones) {
      expect(bone.matrix.elements.every(Number.isFinite)).toBe(true);
      expect(bone.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    }

    const animationNames = contract.animation.clips.map((clip) => clip.name);
    expect(animationNames).toEqual([
      "rowplay-v4-row-cycle",
      "rowplay-v4-ski-cycle",
      "rowplay-v4-bike-cycle",
    ]);
  });

  it("clones without sharing mutable skeleton or material state", async () => {
    const { group } = await loadUsdAthlete();
    const first = cloneUsdAthleteInstance(group);
    const second = cloneUsdAthleteInstance(group);
    const firstSkins: THREE.SkinnedMesh[] = [];
    const secondSkins: THREE.SkinnedMesh[] = [];
    first.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) firstSkins.push(object as THREE.SkinnedMesh);
    });
    second.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh)
        secondSkins.push(object as THREE.SkinnedMesh);
    });
    expect(firstSkins).toHaveLength(1);
    expect(secondSkins).toHaveLength(1);
    expect(firstSkins[0].skeleton).not.toBe(secondSkins[0].skeleton);
    expect(firstSkins[0].skeleton.bones[0]).not.toBe(secondSkins[0].skeleton.bones[0]);
    expect(firstSkins[0].material).not.toBe(secondSkins[0].material);
  });
});
