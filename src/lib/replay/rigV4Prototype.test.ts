import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createV4AthletePrototype,
  disposeV4AthletePrototype,
  sampleV4AthletePrototype,
  V4_BONE_NAMES,
  V4_CLIP_NAME,
  V4_CYCLE_SECONDS,
} from "./rigV4Prototype";

/** GLTFExporter uses the browser FileReader surface, including in Node tests. */
function installFileReaderShim(): void {
  if ("FileReader" in globalThis) return;
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;

    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }

    readAsDataURL(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      });
    }
  }
  Object.assign(globalThis, { FileReader: NodeFileReader });
}

function quaternionSnapshot(bone: THREE.Bone): readonly number[] {
  return [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w];
}

function firstVertexForBone(mesh: THREE.SkinnedMesh, bone: number): number {
  const indices = mesh.geometry.getAttribute("skinIndex");
  const weights = mesh.geometry.getAttribute("skinWeight");
  for (let index = 0; index < indices.count; index++) {
    for (let influence = 0; influence < indices.itemSize; influence++) {
      if (
        indices.getComponent(index, influence) === bone &&
        weights.getComponent(index, influence) > 0.95
      ) {
        return index;
      }
    }
  }
  throw new Error(`No strong vertex influence found for bone ${bone}`);
}

describe("V4 skinned-athlete prototype", () => {
  it("authors one fully weighted generic athlete with a conventional skeleton", () => {
    const prototype = createV4AthletePrototype();
    try {
      expect(prototype.mesh).toBeInstanceOf(THREE.SkinnedMesh);
      expect(prototype.mesh.skeleton).toBe(prototype.skeleton);
      expect(prototype.skeleton.bones.map((bone) => bone.name)).toEqual(V4_BONE_NAMES);
      expect(prototype.metrics.bones).toBe(V4_BONE_NAMES.length);
      expect(prototype.metrics.vertices).toBeGreaterThan(2_000);
      expect(prototype.metrics.triangles).toBeGreaterThan(3_000);
      expect(prototype.metrics.materialSlots).toBe(1);

      const skinIndex = prototype.mesh.geometry.getAttribute("skinIndex");
      const skinWeight = prototype.mesh.geometry.getAttribute("skinWeight");
      expect(skinIndex.itemSize).toBe(4);
      expect(skinWeight.itemSize).toBe(4);
      expect(skinIndex.count).toBe(prototype.metrics.vertices);
      for (let index = 0; index < skinWeight.count; index++) {
        const sum =
          skinWeight.getX(index) +
          skinWeight.getY(index) +
          skinWeight.getZ(index) +
          skinWeight.getW(index);
        expect(sum).toBeCloseTo(1, 6);
      }
    } finally {
      disposeV4AthletePrototype(prototype);
    }
  });

  it("seeks deterministic skeleton poses with AnimationMixer.setTime", () => {
    const prototype = createV4AthletePrototype();
    try {
      expect(prototype.clip.name).toBe(V4_CLIP_NAME);
      expect(prototype.clip.duration).toBe(V4_CYCLE_SECONDS);
      expect(prototype.clip.validate()).toBe(true);
      expect(prototype.metrics.clipTracks).toBeGreaterThanOrEqual(12);
      expect(prototype.clip.tracks.every((track) => track.name.includes(".bones["))).toBe(true);

      sampleV4AthletePrototype(prototype, 0.09);
      const catchQuaternion = quaternionSnapshot(prototype.bones.v4LeftForearm);
      const leftHandVertex = firstVertexForBone(
        prototype.mesh,
        prototype.skeleton.bones.indexOf(prototype.bones.v4LeftHand),
      );
      const sourcePosition = new THREE.Vector3().fromBufferAttribute(
        prototype.mesh.geometry.getAttribute("position"),
        leftHandVertex,
      );
      const catchVertex = prototype.mesh.applyBoneTransform(leftHandVertex, sourcePosition.clone());

      sampleV4AthletePrototype(prototype, 0.52);
      const finishQuaternion = quaternionSnapshot(prototype.bones.v4LeftForearm);
      const finishVertex = prototype.mesh.applyBoneTransform(
        leftHandVertex,
        sourcePosition.clone(),
      );
      expect(finishQuaternion).not.toEqual(catchQuaternion);
      expect(finishVertex.distanceTo(catchVertex)).toBeGreaterThan(0.04);

      sampleV4AthletePrototype(prototype, 0.52);
      const repeatedQuaternion = quaternionSnapshot(prototype.bones.v4LeftForearm);
      const repeatedVertex = prototype.mesh.applyBoneTransform(
        leftHandVertex,
        sourcePosition.clone(),
      );
      expect(repeatedQuaternion).toEqual(finishQuaternion);
      expect(repeatedVertex.toArray()).toEqual(finishVertex.toArray());
    } finally {
      disposeV4AthletePrototype(prototype);
    }
  });

  it("exports an animated GLB that round-trips as a real skinned mesh", async () => {
    installFileReaderShim();
    const prototype = createV4AthletePrototype();
    try {
      const exported = await new GLTFExporter().parseAsync(prototype.root, {
        binary: true,
        animations: [prototype.clip],
      });
      if (!(exported instanceof ArrayBuffer)) {
        throw new Error("V4 prototype exporter did not return a binary GLB");
      }
      expect(exported.byteLength).toBeGreaterThan(100_000);

      const gltf = await new Promise<{
        readonly scene: THREE.Group;
        readonly animations: THREE.AnimationClip[];
      }>((resolve, reject) => {
        new GLTFLoader().parse(exported, "", resolve, reject);
      });
      const loadedMeshes: THREE.SkinnedMesh[] = [];
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) loadedMeshes.push(object);
      });
      expect(loadedMeshes).toHaveLength(1);
      const [loadedMesh] = loadedMeshes;
      expect(loadedMesh).toBeDefined();
      expect(gltf.animations).toHaveLength(1);
      expect(gltf.animations[0]?.name).toBe(V4_CLIP_NAME);
      expect(gltf.animations[0]?.tracks.length).toBe(prototype.clip.tracks.length);
      expect(loadedMesh?.geometry.getAttribute("skinWeight").itemSize).toBe(4);

      const loadedForearm = loadedMesh?.skeleton.getBoneByName("v4LeftForearm");
      expect(loadedForearm).toBeDefined();
      const loadedMixer = new THREE.AnimationMixer(gltf.scene);
      loadedMixer.clipAction(gltf.animations[0]!).play();
      loadedMixer.setTime(0.09);
      const loadedCatch = quaternionSnapshot(loadedForearm!);
      loadedMixer.setTime(0.52);
      expect(quaternionSnapshot(loadedForearm!)).not.toEqual(loadedCatch);
      loadedMixer.stopAllAction();
      loadedMixer.uncacheRoot(gltf.scene);
    } finally {
      disposeV4AthletePrototype(prototype);
    }
  });
});
