import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { createV4AthleteAsset, disposeV4AthleteAsset, type V4AthleteAsset } from "./rigV4";
import {
  collectReplayV4AssetTemplate,
  createReplayV4AthleteInstance,
  disposeReplayV4AssetTemplate,
  disposeReplayV4AthleteInstance,
  fetchReplayV4Asset,
  loadOptionalReplayV4Asset,
  REPLAY_V4_ASSET_PATH,
  REPLAY_V4_CLIP_NAMES,
  resetReplayV4AssetCache,
  tryCreateReplayV4AthleteInstance,
  type ReplayV4AssetTemplate,
} from "./renderer3dV4Assets";

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

function productionNamedClips(asset: V4AthleteAsset): readonly THREE.AnimationClip[] {
  return Object.values(asset.clips).map((clip) => clip.clone());
}

function releaseAuthoringMixer(asset: V4AthleteAsset): void {
  asset.mixer.stopAllAction();
  for (const clip of Object.values(asset.clips)) {
    asset.mixer.uncacheAction(clip);
    asset.mixer.uncacheClip(clip);
  }
  asset.mixer.uncacheRoot(asset.root);
}

function createTemplate(): ReplayV4AssetTemplate {
  const asset = createV4AthleteAsset();
  const clips = productionNamedClips(asset);
  releaseAuthoringMixer(asset);
  return collectReplayV4AssetTemplate(asset.root, clips, 223_960);
}

async function createGlbBytes(): Promise<ArrayBuffer> {
  installFileReaderShim();
  const asset = createV4AthleteAsset();
  try {
    const exported = await new GLTFExporter().parseAsync(asset.root, {
      binary: true,
      animations: [...productionNamedClips(asset)],
    });
    if (!(exported instanceof ArrayBuffer)) throw new Error("Expected a binary V4 test GLB");
    return exported;
  } finally {
    disposeV4AthleteAsset(asset);
  }
}

function materialAt(mesh: THREE.Mesh, index = 0): THREE.Material {
  return (Array.isArray(mesh.material) ? mesh.material[index] : mesh.material)!;
}

afterEach(() => resetReplayV4AssetCache());

describe("V4 runtime asset contract", () => {
  it("validates semantic bones and exposes all three named sport clips", () => {
    const template = createTemplate();
    try {
      expect(REPLAY_V4_ASSET_PATH).toBe("/replay-assets/rowplay-athlete-v4.glb");
      expect(template.mesh).toBeInstanceOf(THREE.SkinnedMesh);
      // Semantic joints are required; helper bones may increase the total.
      expect(template.skeleton.bones.length).toBeGreaterThanOrEqual(19);
      expect(Object.keys(template.bones)).toHaveLength(19);
      expect([...template.clips.keys()]).toEqual(Object.values(REPLAY_V4_CLIP_NAMES));
      expect(template.clipsBySport.rower.name).toBe(REPLAY_V4_CLIP_NAMES.rower);
      expect(template.clipsBySport.skierg.name).toBe(REPLAY_V4_CLIP_NAMES.skierg);
      expect(template.clipsBySport.bike.name).toBe(REPLAY_V4_CLIP_NAMES.bike);
      expect(template.clipTimingBySport.rower.driveEnd).toBe(0.38);
      expect(template.clipTimingBySport.skierg.driveEnd).toBe(0.34);
      expect(template.clipTimingBySport.bike.driveEnd).toBe(0.5);
      expect(template.effectors.leftHand.contactOffset).toEqual([-0.08, -0.01, 0.035]);
      expect(template.effectors.rightHand.contactRole).toBe("right-hand");
      expect(template.effectors.leftHand.proximalLength).toBeGreaterThan(0.3);
      expect(template.effectors.leftHand.distalLength).toBeGreaterThan(0.2);
      expect(template.effectors.leftHand.totalReach).toBeCloseTo(
        template.effectors.leftHand.proximalLength +
          template.effectors.leftHand.distalLength +
          Math.hypot(...template.effectors.leftHand.contactOffset),
      );
      expect(template.byteLength).toBe(223_960);
    } finally {
      disposeReplayV4AssetTemplate(template);
    }
  });

  it("accepts optional helper bones while requiring the semantic joint set", () => {
    const asset = createV4AthleteAsset({
      helperBones: [
        {
          name: "v4LeftForearmTwist",
          parent: "v4LeftForearm",
          position: [-0.18, -0.06, 0.03],
        },
      ],
    });
    const helper = asset.skeleton.getBoneByName("v4LeftForearmTwist");
    if (!helper) throw new Error("V4 helper bone was not authored");
    const helperIndex = asset.skeleton.bones.indexOf(helper);
    const skinIndex = asset.mesh.geometry.getAttribute("skinIndex");
    const skinWeight = asset.mesh.geometry.getAttribute("skinWeight");
    skinIndex.setXYZW(0, helperIndex, 0, 0, 0);
    skinWeight.setXYZW(0, 1, 0, 0, 0);
    skinIndex.needsUpdate = true;
    skinWeight.needsUpdate = true;
    const clips = productionNamedClips(asset);
    expect(
      clips.every((clip) => clip.tracks.every((track) => !track.name.includes(helper.name))),
    ).toBe(true);
    releaseAuthoringMixer(asset);
    // collectReplayV4AssetTemplate takes ownership of the authoring root.
    const template = collectReplayV4AssetTemplate(asset.root, clips, 223_960);
    try {
      expect(template.skeleton.bones.length).toBeGreaterThan(19);
      expect(Object.keys(template.bones)).toHaveLength(19);
      expect(template.bones.v4LeftForearm).toBeDefined();
      expect(template.skeleton.getBoneByName("v4LeftForearmTwist")).toBe(helper);
    } finally {
      disposeReplayV4AssetTemplate(template);
    }
  });

  it("rejects clips that directly animate a visual helper bone", () => {
    const asset = createV4AthleteAsset({
      helperBones: [
        {
          name: "v4LeftForearmTwist",
          parent: "v4LeftForearm",
          position: [-0.18, -0.06, 0.03],
        },
      ],
    });
    try {
      const clips = productionNamedClips(asset);
      clips[0]!.tracks[clips[0]!.tracks.length - 1] = new THREE.QuaternionKeyframeTrack(
        ".bones[v4LeftForearmTwist].quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0, 1],
      );
      releaseAuthoringMixer(asset);
      expect(() => collectReplayV4AssetTemplate(asset.root, clips, 223_960)).toThrow(
        "directly targets a visual helper bone",
      );
    } finally {
      disposeV4AthleteAsset(asset);
    }
  });

  it("rejects partial, duplicate, and malformed rig contracts", () => {
    const missingClip = createV4AthleteAsset();
    try {
      expect(() =>
        collectReplayV4AssetTemplate(missingClip.root, [productionNamedClips(missingClip)[0]!]),
      ).toThrow("exactly 3 clips");
    } finally {
      disposeV4AthleteAsset(missingClip);
    }

    const duplicateMesh = createV4AthleteAsset();
    try {
      duplicateMesh.root.add(
        new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
      );
      expect(() =>
        collectReplayV4AssetTemplate(duplicateMesh.root, productionNamedClips(duplicateMesh)),
      ).toThrow("exactly one SkinnedMesh");
    } finally {
      disposeV4AthleteAsset(duplicateMesh);
      const extra = duplicateMesh.root.children.find(
        (child) => child instanceof THREE.Mesh && child !== duplicateMesh.mesh,
      ) as THREE.Mesh | undefined;
      extra?.geometry.dispose();
      materialAt(extra!).dispose();
    }

    const missingBone = createV4AthleteAsset();
    try {
      missingBone.bones.v4LeftHand.name = "renamedLeftHand";
      expect(() =>
        collectReplayV4AssetTemplate(missingBone.root, productionNamedClips(missingBone)),
      ).toThrow("missing semantic bone: v4LeftHand");
    } finally {
      disposeV4AthleteAsset(missingBone);
    }

    const invalidTiming = createV4AthleteAsset();
    try {
      const clips = productionNamedClips(invalidTiming);
      clips[0]!.userData.replayDriveEnd = 1;
      expect(() => collectReplayV4AssetTemplate(invalidTiming.root, clips)).toThrow(
        "invalid replayDriveEnd",
      );
    } finally {
      disposeV4AthleteAsset(invalidTiming);
    }
  });

  it("creates independent live and ghost skeletons, mixers, and material state", () => {
    const template = createTemplate();
    const sourceMaterial = materialAt(template.mesh);
    sourceMaterial.opacity = 0.82;
    sourceMaterial.transparent = true;
    sourceMaterial.depthWrite = false;
    template.mesh.renderOrder = 3;

    const live = createReplayV4AthleteInstance(template);
    const ghost = createReplayV4AthleteInstance(template);
    try {
      expect(live.root).not.toBe(ghost.root);
      expect(live.mesh).not.toBe(ghost.mesh);
      expect(live.skeleton).not.toBe(ghost.skeleton);
      expect(live.bones.v4LeftForearm).not.toBe(ghost.bones.v4LeftForearm);
      expect(live.mixer).not.toBe(ghost.mixer);
      expect(live.mesh.geometry).not.toBe(template.mesh.geometry);
      expect(ghost.mesh.geometry).not.toBe(template.mesh.geometry);
      expect(live.mesh.geometry).not.toBe(ghost.mesh.geometry);

      const liveMaterial = materialAt(live.mesh);
      const ghostMaterial = materialAt(ghost.mesh);
      expect(liveMaterial).not.toBe(ghostMaterial);
      expect(liveMaterial).not.toBe(sourceMaterial);
      expect({
        opacity: liveMaterial.opacity,
        transparent: liveMaterial.transparent,
        depthWrite: liveMaterial.depthWrite,
      }).toEqual({ opacity: 0.82, transparent: true, depthWrite: false });
      ghostMaterial.opacity = 0.28;
      ghostMaterial.depthWrite = true;
      expect(liveMaterial.opacity).toBe(0.82);
      expect(liveMaterial.depthWrite).toBe(false);
      expect(sourceMaterial.opacity).toBe(0.82);

      expect(live.mesh.castShadow).toBe(template.mesh.castShadow);
      expect(live.mesh.receiveShadow).toBe(template.mesh.receiveShadow);
      expect(live.mesh.frustumCulled).toBe(template.mesh.frustumCulled);
      expect(live.mesh.renderOrder).toBe(3);

      const clip = live.clipsBySport.rower;
      live.mixer.clipAction(clip).play();
      ghost.mixer.clipAction(ghost.clipsBySport.rower).play();
      live.mixer.setTime(0.09);
      ghost.mixer.setTime(0.52);
      expect(live.bones.v4LeftForearm.quaternion.toArray()).not.toEqual(
        ghost.bones.v4LeftForearm.quaternion.toArray(),
      );

      ghost.bones.v4LeftHand.rotation.y = 0.7;
      expect(live.bones.v4LeftHand.rotation.y).not.toBe(ghost.bones.v4LeftHand.rotation.y);
      expect(template.bones.v4LeftHand.rotation.y).not.toBe(ghost.bones.v4LeftHand.rotation.y);
    } finally {
      disposeReplayV4AthleteInstance(live);
      disposeReplayV4AthleteInstance(ghost);
      disposeReplayV4AssetTemplate(template);
    }
  });

  it("defers shared geometry disposal until every lane releases its clone", () => {
    const template = createTemplate();
    const instance = createReplayV4AthleteInstance(template);
    const sourceMaterial = materialAt(template.mesh);
    const instanceMaterial = materialAt(instance.mesh);
    const geometryDispose = vi.spyOn(template.mesh.geometry, "dispose");
    const sourceMaterialDispose = vi.spyOn(sourceMaterial, "dispose");
    const instanceMaterialDispose = vi.spyOn(instanceMaterial, "dispose");
    const instanceGeometryDispose = vi.spyOn(instance.mesh.geometry, "dispose");
    const instanceSkeletonDispose = vi.spyOn(instance.skeleton, "dispose");

    disposeReplayV4AssetTemplate(template);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(sourceMaterialDispose).not.toHaveBeenCalled();
    expect(tryCreateReplayV4AthleteInstance(template)).toBeNull();

    disposeReplayV4AthleteInstance(instance);
    expect(instanceMaterialDispose).toHaveBeenCalledTimes(1);
    expect(instanceGeometryDispose).toHaveBeenCalledTimes(1);
    expect(instanceSkeletonDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(sourceMaterialDispose).toHaveBeenCalledTimes(1);

    disposeReplayV4AthleteInstance(instance);
    disposeReplayV4AssetTemplate(template);
    expect(instanceMaterialDispose).toHaveBeenCalledTimes(1);
    expect(instanceGeometryDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it("round-trips through GLTFLoader and retries after an optional-load failure", async () => {
    const bytes = await createGlbBytes();
    const direct = await fetchReplayV4Asset(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(url).toContain(REPLAY_V4_ASSET_PATH);
      return new Response(bytes, { status: 200 });
    });
    try {
      expect(direct.byteLength).toBe(bytes.byteLength);
      expect(direct.mesh).toBeInstanceOf(THREE.SkinnedMesh);
      expect(direct.clips.size).toBe(3);
    } finally {
      disposeReplayV4AssetTemplate(direct);
    }

    const fetchImpl = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    expect(await loadOptionalReplayV4Asset(fetchImpl)).toBeNull();
    const retry = await loadOptionalReplayV4Asset(fetchImpl);
    expect(retry).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
