import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createV4AthleteAsset,
  disposeV4AthleteAsset,
  sampleV4AthleteAsset,
  V4_BONE_NAMES,
  V4_CLIP_NAMES,
  V4_CONTACT_OFFSETS,
  V4_CONTACT_ROLES,
  V4_CYCLE_SECONDS,
  V4_DRIVE_END,
  V4_PHASE_SCHEMAS,
  type V4BoneName,
  type V4ContactBoneName,
  type V4Sport,
} from "./rigV4";

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

function connectedComponentSizes(geometry: THREE.BufferGeometry): readonly number[] {
  const index = geometry.getIndex();
  if (!index) throw new Error("V4 geometry must be indexed");
  const vertexCount = geometry.getAttribute("position").count;
  const parent = Array.from({ length: vertexCount }, (_, vertex) => vertex);
  const find = (vertex: number): number => {
    let root = vertex;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[vertex] !== vertex) {
      const next = parent[vertex]!;
      parent[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    union(a, b);
    union(b, c);
  }
  const sizes = new Map<number, number>();
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const root = find(vertex);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  return [...sizes.values()].sort((left, right) => right - left);
}

function jointWeightSamples(
  mesh: THREE.SkinnedMesh,
  proximal: V4BoneName,
  distal: V4BoneName,
): readonly number[] {
  const proximalIndex = mesh.skeleton.bones.findIndex((bone) => bone.name === proximal);
  const distalIndex = mesh.skeleton.bones.findIndex((bone) => bone.name === distal);
  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const skinWeight = mesh.geometry.getAttribute("skinWeight");
  const values = new Set<number>();
  for (let vertex = 0; vertex < skinIndex.count; vertex++) {
    let proximalWeight = 0;
    let distalWeight = 0;
    for (let influence = 0; influence < 4; influence++) {
      const bone = skinIndex.getComponent(vertex, influence);
      const weight = skinWeight.getComponent(vertex, influence);
      if (bone === proximalIndex) proximalWeight += weight;
      if (bone === distalIndex) distalWeight += weight;
    }
    if (proximalWeight > 0 && distalWeight > 0) {
      values.add(Number(proximalWeight.toFixed(3)));
    }
  }
  return [...values].sort((left, right) => left - right);
}

function influencedVertexIndices(
  mesh: THREE.SkinnedMesh,
  names: readonly V4BoneName[],
): readonly number[] {
  const accepted = new Set(
    names.map((name) => mesh.skeleton.bones.findIndex((bone) => bone.name === name)),
  );
  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const skinWeight = mesh.geometry.getAttribute("skinWeight");
  const result: number[] = [];
  for (let vertex = 0; vertex < skinIndex.count; vertex++) {
    for (let influence = 0; influence < 4; influence++) {
      if (
        accepted.has(skinIndex.getComponent(vertex, influence)) &&
        skinWeight.getComponent(vertex, influence) > 0.01
      ) {
        result.push(vertex);
        break;
      }
    }
  }
  return result;
}

function skinnedBounds(mesh: THREE.SkinnedMesh, vertices: readonly number[]): THREE.Box3 {
  const position = mesh.geometry.getAttribute("position");
  const point = new THREE.Vector3();
  const bounds = new THREE.Box3();
  for (const vertex of vertices) {
    point.fromBufferAttribute(position, vertex);
    mesh.applyBoneTransform(vertex, point);
    expect(point.toArray().every(Number.isFinite)).toBe(true);
    bounds.expandByPoint(point);
  }
  return bounds;
}

describe("V4 production skinned athlete", () => {
  it("authors one detailed generic athlete with stable bones, contacts and material semantics", () => {
    const asset = createV4AthleteAsset();
    try {
      expect(asset.mesh).toBeInstanceOf(THREE.SkinnedMesh);
      expect(asset.mesh.skeleton).toBe(asset.skeleton);
      expect(asset.skeleton.bones.map((bone) => bone.name)).toEqual(V4_BONE_NAMES);
      expect(asset.metrics).toMatchObject({
        bones: 19,
        clips: 3,
        clipTracks: 60,
        contactEffectors: 4,
        materialSlots: 1,
      });
      expect(asset.metrics.vertices).toBeGreaterThan(4_500);
      expect(asset.metrics.triangles).toBeGreaterThan(8_500);
      expect(asset.mesh.castShadow).toBe(true);
      expect(asset.mesh.receiveShadow).toBe(true);
      expect(asset.mesh.frustumCulled).toBe(false);

      const material = asset.mesh.material;
      expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(Array.isArray(material)).toBe(false);
      if (!(material instanceof THREE.MeshPhysicalMaterial)) throw new Error("invalid material");
      expect(material.vertexColors).toBe(true);
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);

      const skinIndex = asset.mesh.geometry.getAttribute("skinIndex");
      const skinWeight = asset.mesh.geometry.getAttribute("skinWeight");
      expect(skinIndex.itemSize).toBe(4);
      expect(skinWeight.itemSize).toBe(4);
      expect(skinIndex.count).toBe(asset.metrics.vertices);
      for (let vertex = 0; vertex < skinWeight.count; vertex++) {
        let sum = 0;
        for (let influence = 0; influence < 4; influence++) {
          const bone = skinIndex.getComponent(vertex, influence);
          const weight = skinWeight.getComponent(vertex, influence);
          expect(Number.isInteger(bone)).toBe(true);
          expect(bone).toBeGreaterThanOrEqual(0);
          expect(bone).toBeLessThan(V4_BONE_NAMES.length);
          expect(Number.isFinite(weight)).toBe(true);
          expect(weight).toBeGreaterThanOrEqual(0);
          sum += weight;
        }
        expect(sum).toBeCloseTo(1, 6);
      }

      for (const boneName of Object.keys(V4_CONTACT_OFFSETS) as V4ContactBoneName[]) {
        const bone = asset.bones[boneName];
        const marker = asset.effectors[boneName];
        expect(bone.userData.replayContactRole).toBe(V4_CONTACT_ROLES[boneName]);
        expect(bone.userData.replayContactOffset).toEqual(V4_CONTACT_OFFSETS[boneName]);
        expect(marker.name).toBe(`${boneName}Contact`);
        expect(marker.parent).toBe(bone);
        expect(marker.position.toArray()).toEqual(V4_CONTACT_OFFSETS[boneName]);
      }

      const leftReach =
        asset.bones.v4LeftForearm.position.length() +
        asset.bones.v4LeftHand.position.length() +
        new THREE.Vector3(...V4_CONTACT_OFFSETS.v4LeftHand).length();
      expect(leftReach).toBeGreaterThan(0.85);
      expect(leftReach).toBeLessThan(0.87);
    } finally {
      disposeV4AthleteAsset(asset);
    }
  });

  it("uses five closed major lofts and genuine joint-weight gradients", () => {
    const asset = createV4AthleteAsset();
    try {
      const components = connectedComponentSizes(asset.mesh.geometry);
      // Five continuous silhouette components (axial body/head, two complete
      // arms, two complete legs/shoes) plus nine deliberate shallow details.
      expect(components).toHaveLength(14);
      expect(components.filter((size) => size >= 380)).toHaveLength(6);

      const elbow = jointWeightSamples(asset.mesh, "v4LeftUpperArm", "v4LeftForearm");
      const knee = jointWeightSamples(asset.mesh, "v4LeftUpperLeg", "v4LeftLowerLeg");
      expect(elbow.length).toBeGreaterThanOrEqual(4);
      expect(elbow[0]).toBeLessThanOrEqual(0.2);
      expect(elbow.at(-1)).toBeGreaterThanOrEqual(0.75);
      expect(knee.length).toBeGreaterThanOrEqual(4);
      expect(knee[0]).toBeLessThanOrEqual(0.2);
      expect(knee.at(-1)).toBeGreaterThanOrEqual(0.75);

      const armVertices = influencedVertexIndices(asset.mesh, [
        "v4LeftUpperArm",
        "v4LeftForearm",
        "v4LeftHand",
      ]);
      sampleV4AthleteAsset(asset, "rower", V4_DRIVE_END.rower);
      const flexedSize = skinnedBounds(asset.mesh, armVertices).getSize(new THREE.Vector3());
      expect(flexedSize.length()).toBeGreaterThan(0.45);
      expect(Math.min(flexedSize.x, flexedSize.y, flexedSize.z)).toBeGreaterThan(0.03);
    } finally {
      disposeV4AthleteAsset(asset);
    }
  });

  it("provides distinct loop-safe sport clips with exact drive landmarks", () => {
    const asset = createV4AthleteAsset();
    try {
      expect(Object.keys(asset.clips)).toEqual(["rower", "skier", "bike"]);
      const driveSignatures = new Map<V4Sport, readonly number[]>();
      for (const sport of Object.keys(asset.clips) as V4Sport[]) {
        const clip = asset.clips[sport];
        expect(clip.name).toBe(V4_CLIP_NAMES[sport]);
        expect(clip.duration).toBe(V4_CYCLE_SECONDS);
        expect(clip.validate()).toBe(true);
        expect(clip.tracks).toHaveLength(20);
        expect(clip.userData).toMatchObject({
          replayRigVersion: 4,
          replaySport: sport,
          replayDriveEnd: V4_DRIVE_END[sport],
          replayPhaseSchema: V4_PHASE_SCHEMAS[sport],
        });
        for (const track of clip.tracks) {
          expect(track.name).toContain(".bones[");
          expect(
            Array.from(track.times).some((time) => Math.abs(time - V4_DRIVE_END[sport]) < 1e-5),
          ).toBe(true);
          const itemSize = track.getValueSize();
          const first = Array.from(track.values.slice(0, itemSize));
          const last = Array.from(track.values.slice(-itemSize));
          expect(last).toEqual(first);
          expect(Array.from(track.values).every(Number.isFinite)).toBe(true);
        }

        sampleV4AthleteAsset(asset, sport, 0);
        const catchPose = quaternionSnapshot(asset.bones.v4LeftForearm);
        sampleV4AthleteAsset(asset, sport, V4_DRIVE_END[sport]);
        const drive = quaternionSnapshot(asset.bones.v4LeftForearm);
        expect(drive).not.toEqual(catchPose);
        driveSignatures.set(sport, drive);

        sampleV4AthleteAsset(asset, sport, V4_DRIVE_END[sport]);
        expect(quaternionSnapshot(asset.bones.v4LeftForearm)).toEqual(drive);
      }
      expect(driveSignatures.get("rower")).not.toEqual(driveSignatures.get("skier"));
      expect(driveSignatures.get("skier")).not.toEqual(driveSignatures.get("bike"));
      expect(driveSignatures.get("bike")).not.toEqual(driveSignatures.get("rower"));
    } finally {
      disposeV4AthleteAsset(asset);
    }
  });

  it("exports a local three-clip GLB that round-trips with skin and contact extras", async () => {
    installFileReaderShim();
    const asset = createV4AthleteAsset();
    try {
      const exported = await new GLTFExporter().parseAsync(asset.root, {
        binary: true,
        animations: Object.values(asset.clips),
      });
      if (!(exported instanceof ArrayBuffer)) throw new Error("V4 exporter did not return GLB");
      expect(exported.byteLength).toBeGreaterThan(300_000);

      const gltf = await new Promise<{
        readonly scene: THREE.Group;
        readonly animations: THREE.AnimationClip[];
      }>((resolve, reject) => new GLTFLoader().parse(exported, "", resolve, reject));
      const loadedMeshes: THREE.SkinnedMesh[] = [];
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) loadedMeshes.push(object);
      });
      expect(loadedMeshes).toHaveLength(1);
      const loadedMesh = loadedMeshes[0]!;
      expect(loadedMesh.skeleton.bones.map((bone) => bone.name)).toEqual(V4_BONE_NAMES);
      expect(loadedMesh.geometry.getAttribute("skinWeight").itemSize).toBe(4);
      expect(loadedMesh.geometry.getAttribute("color").itemSize).toBe(3);
      expect(gltf.animations.map((clip) => clip.name)).toEqual(Object.values(V4_CLIP_NAMES));
      for (const [index, sport] of (Object.keys(V4_CLIP_NAMES) as V4Sport[]).entries()) {
        const clip = gltf.animations[index]!;
        expect(clip.userData.replaySport).toBe(sport);
        expect(clip.userData.replayDriveEnd).toBe(V4_DRIVE_END[sport]);
      }
      for (const boneName of Object.keys(V4_CONTACT_OFFSETS) as V4ContactBoneName[]) {
        const bone = loadedMesh.skeleton.getBoneByName(boneName);
        expect(bone?.userData.replayContactRole).toBe(V4_CONTACT_ROLES[boneName]);
        expect(bone?.userData.replayContactOffset).toEqual(V4_CONTACT_OFFSETS[boneName]);
        expect(bone?.getObjectByName(`${boneName}Contact`)).toBeDefined();
      }

      const mixer = new THREE.AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) {
        mixer.stopAllAction();
        const action = mixer.clipAction(clip).play();
        mixer.setTime(0);
        const bone = loadedMesh.skeleton.getBoneByName("v4LeftForearm")!;
        const start = quaternionSnapshot(bone);
        const driveEnd = clip.userData.replayDriveEnd;
        if (typeof driveEnd !== "number") throw new Error("loaded clip lost drive metadata");
        mixer.setTime(driveEnd);
        expect(quaternionSnapshot(bone)).not.toEqual(start);
        action.stop();
        mixer.uncacheAction(clip);
      }
      mixer.uncacheRoot(gltf.scene);
    } finally {
      disposeV4AthleteAsset(asset);
    }
  });
});
