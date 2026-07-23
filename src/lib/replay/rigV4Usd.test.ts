import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { V4_BONE_NAMES } from "./rigV4";

type V4Contract = {
  readonly mesh: {
    readonly triangles: number;
  };
  readonly bones: {
    readonly semanticCount: number;
    readonly semanticOrderedNames: readonly string[];
    readonly totalCount: number;
    readonly helperCount: number;
    readonly helperNames: readonly string[];
  };
  readonly animation: {
    readonly clips: readonly {
      readonly sport: string;
      readonly name: string;
      readonly durationSeconds: number;
    }[];
  };
};

const SEMANTIC_BONE_NAMES = new Set<string>(V4_BONE_NAMES);

function sortedNames(names: readonly string[]): string[] {
  return [...names].sort((left, right) => left.localeCompare(right));
}

// Blender USDZ parse + skin validation is multi-second on CI runners after the
// production mesh density increase. Keep a single shared load and a wide budget.
const USDZ_TEST_TIMEOUT_MS = 30_000;

let assetBytes: Buffer;
let contract: V4Contract;
let group: THREE.Group;
let skinned: THREE.SkinnedMesh[];

beforeAll(async () => {
  const [bytes, contractText] = await Promise.all([
    readFile("static/replay-assets/rowplay-athlete-v4.usdz"),
    readFile("static/replay-assets/rowplay-athlete-v4.contract.json", "utf8"),
  ]);
  assetBytes = bytes;
  contract = JSON.parse(contractText) as V4Contract;
  // Materialize a definite ArrayBuffer: Node Buffer.buffer may be SharedArrayBuffer.
  const arrayBuffer = Uint8Array.from(assetBytes).buffer;
  group = new USDLoader().parse(arrayBuffer);
  skinned = [];
  group.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(object as THREE.SkinnedMesh);
  });
}, USDZ_TEST_TIMEOUT_MS);

function cloneUsdAthleteInstance(source: THREE.Group): THREE.Group {
  const instance = clone(source) as THREE.Group;
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
  it(
    "loads as the same one-skinned-athlete contract in Three.js",
    () => {
      const decoded = assetBytes.toString("latin1");

      expect(decoded).not.toContain("http://");
      expect(decoded).not.toContain("https://");
      expect(decoded).not.toContain("file://");
      expect(decoded).not.toContain("/Users/");
      expect(skinned).toHaveLength(1);

      const mesh = skinned[0]!;
      const boneNames = mesh.skeleton.bones.map((bone) => bone.name);
      expect(boneNames.filter((name) => SEMANTIC_BONE_NAMES.has(name))).toEqual([...V4_BONE_NAMES]);
      expect(new Set(boneNames).size).toBe(boneNames.length);
      expect(contract.bones.semanticCount).toBe(V4_BONE_NAMES.length);
      expect(contract.bones.semanticOrderedNames).toEqual([...V4_BONE_NAMES]);
      expect(contract.bones.totalCount).toBe(boneNames.length);
      expect(contract.bones.helperCount).toBe(boneNames.length - V4_BONE_NAMES.length);
      expect(sortedNames(contract.bones.helperNames)).toEqual(
        sortedNames(boneNames.filter((name) => !SEMANTIC_BONE_NAMES.has(name))),
      );
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

      // Aggregate validation: per-vertex expect() is far too slow on denser
      // Blender meshes under CI time budgets.
      let weightError = 0;
      let indexError = 0;
      for (let vertex = 0; vertex < skinWeight.count; vertex++) {
        const sum =
          skinWeight.getX(vertex) +
          skinWeight.getY(vertex) +
          skinWeight.getZ(vertex) +
          skinWeight.getW(vertex);
        if (!Number.isFinite(sum) || Math.abs(sum - 1) >= 1e-5) weightError++;
        for (let component = 0; component < 4; component++) {
          const bone = skinIndex.getComponent(vertex, component);
          if (bone < 0 || bone >= boneNames.length) indexError++;
        }
      }
      expect(weightError, "vertices with non-unit skin weights").toBe(0);
      expect(indexError, "vertices with out-of-range skin indices").toBe(0);

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
      expect(contract.animation.clips.map((clip) => clip.sport)).toEqual([
        "rower",
        "skierg",
        "bike",
      ]);
    },
    USDZ_TEST_TIMEOUT_MS,
  );

  it(
    "clones without sharing mutable skeleton or material state",
    () => {
      const first = cloneUsdAthleteInstance(group);
      const second = cloneUsdAthleteInstance(group);
      const firstSkins: THREE.SkinnedMesh[] = [];
      const secondSkins: THREE.SkinnedMesh[] = [];
      first.traverse((object) => {
        if ((object as THREE.SkinnedMesh).isSkinnedMesh)
          firstSkins.push(object as THREE.SkinnedMesh);
      });
      second.traverse((object) => {
        if ((object as THREE.SkinnedMesh).isSkinnedMesh)
          secondSkins.push(object as THREE.SkinnedMesh);
      });
      expect(firstSkins).toHaveLength(1);
      expect(secondSkins).toHaveLength(1);
      expect(firstSkins[0]!.skeleton).not.toBe(secondSkins[0]!.skeleton);
      expect(firstSkins[0]!.skeleton.bones[0]).not.toBe(secondSkins[0]!.skeleton.bones[0]);
      expect(firstSkins[0]!.material).not.toBe(secondSkins[0]!.material);
    },
    USDZ_TEST_TIMEOUT_MS,
  );
});
