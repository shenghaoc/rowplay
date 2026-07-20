/**
 * Build the production repository-authored V4 skeletal athlete as a local GLB.
 *
 * Run it with Node's type-strip loader:
 *
 *   node --experimental-strip-types scripts/build-replay-rig-v4.mjs
 *
 * An optional first argument replaces the output path. The default is a
 * versioned production artifact under `static/replay-assets/`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createV4AthleteAsset,
  disposeV4AthleteAsset,
  V4_ASSET_FILENAME,
  V4_BONE_NAMES,
  V4_CLIP_NAMES,
  V4_CONTACT_OFFSETS,
  V4_DRIVE_END,
  V4_RIG_NAME,
} from "../src/lib/replay/rigV4.ts";

const DEFAULT_OUTPUT = `static/replay-assets/${V4_ASSET_FILENAME}`;
const output = resolve(process.argv[2] ?? DEFAULT_OUTPUT);

// GLTFExporter has a browser FileReader dependency. Node's Blob has equivalent
// byte access, so the adapter remains local, deterministic and dependency-free.
globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

function parseGlb(bytes) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes, "", resolve, reject);
  });
}

const asset = createV4AthleteAsset();
try {
  const glb = await new GLTFExporter().parseAsync(asset.root, {
    binary: true,
    animations: Object.values(asset.clips),
  });
  if (!(glb instanceof ArrayBuffer)) throw new Error("V4 exporter did not produce a binary GLB");

  const parsed = await parseGlb(glb);
  const loadedSkins = [];
  parsed.scene.traverse((object) => {
    if (object.isSkinnedMesh) loadedSkins.push(object);
  });
  if (loadedSkins.length !== 1) {
    throw new Error(`V4 GLB must round-trip as one SkinnedMesh, received ${loadedSkins.length}`);
  }
  const expectedClipNames = Object.values(V4_CLIP_NAMES);
  if (
    parsed.animations.length !== expectedClipNames.length ||
    parsed.animations.some((clip, index) => clip.name !== expectedClipNames[index])
  ) {
    throw new Error("V4 GLB did not preserve its three ordered deterministic clips");
  }
  if (
    parsed.animations.some(
      (clip) => clip.userData.replayDriveEnd !== V4_DRIVE_END[clip.userData.replaySport],
    )
  ) {
    throw new Error("V4 GLB did not preserve normalized drive-boundary metadata");
  }
  const loadedBoneNames = loadedSkins[0].skeleton.bones.map((bone) => bone.name);
  if (JSON.stringify(loadedBoneNames) !== JSON.stringify(V4_BONE_NAMES)) {
    throw new Error("V4 GLB did not preserve the exact stable skeleton order");
  }
  for (const [boneName, offset] of Object.entries(V4_CONTACT_OFFSETS)) {
    const bone = loadedSkins[0].skeleton.getBoneByName(boneName);
    if (JSON.stringify(bone?.userData.replayContactOffset) !== JSON.stringify(offset)) {
      throw new Error(`V4 GLB did not preserve ${boneName} contact metadata`);
    }
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, new Uint8Array(glb));
  console.log(
    JSON.stringify(
      {
        output,
        bytes: glb.byteLength,
        source: "repository-authored procedural skinned mesh",
        mesh: V4_RIG_NAME,
        ...asset.metrics,
        loadedSkinnedMeshes: loadedSkins.length,
        bones: loadedBoneNames,
        contactOffsets: V4_CONTACT_OFFSETS,
        animations: parsed.animations.map((clip) => ({
          name: clip.name,
          sport: clip.userData.replaySport,
          driveEnd: clip.userData.replayDriveEnd,
          tracks: clip.tracks.length,
          durationSeconds: clip.duration,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  disposeV4AthleteAsset(asset);
}
