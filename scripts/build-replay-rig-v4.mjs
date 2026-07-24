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
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createV4AthleteAsset,
  disposeV4AthleteAsset,
  V4_ASSET_FILENAME,
  V4_BONE_DEFINITIONS,
  V4_BONE_NAMES,
  V4_CLIP_NAMES,
  V4_CONTACT_OFFSETS,
  V4_DRIVE_END,
  V4_RIG_NAME,
} from "../src/lib/replay/rigV4.ts";

const DEFAULT_OUTPUT = `static/replay-assets/${V4_ASSET_FILENAME}`;
const output = resolve(process.argv[2] ?? DEFAULT_OUTPUT);
const BLENDER_GENERATOR = resolve("scripts/build-replay-athlete-v4-blender.py");
const DEFAULT_BLENDER = "/Applications/Blender.app/Contents/MacOS/blender";
const SOURCE_DESCRIPTION = "repository-authored Blender 5 production skinned athlete";

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
  const payload = ArrayBuffer.isView(bytes)
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes;
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(payload, "", resolve, reject);
  });
}

function onlySkinnedMesh(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.isSkinnedMesh) meshes.push(object);
    else if (object.isMesh)
      throw new Error(`Blender source contains an unskinned mesh: ${object.name}`);
  });
  if (meshes.length !== 1) {
    throw new Error(`Blender source must contain one SkinnedMesh, received ${meshes.length}`);
  }
  return meshes[0];
}

function topologicallyOrderHelperBones(helperBones) {
  const ordered = [];
  const resolvedNames = new Set(V4_BONE_NAMES);
  let pending = [...helperBones];
  while (pending.length > 0) {
    const unresolved = [];
    let added = 0;
    for (const helper of pending) {
      if (!resolvedNames.has(helper.parent)) {
        unresolved.push(helper);
        continue;
      }
      ordered.push(helper);
      resolvedNames.add(helper.name);
      added++;
    }
    if (added === 0) {
      throw new Error(
        `Blender V4 helper hierarchy is cyclic or disconnected: ${unresolved
          .map((helper) => `${helper.name}->${helper.parent}`)
          .join(", ")}`,
      );
    }
    pending = unresolved;
  }
  return ordered;
}

function remapBlenderGeometry(sourceMesh) {
  const geometry = sourceMesh.geometry.clone();
  if (!geometry.index) throw new Error("Blender V4 source must remain indexed");
  // UVs are deliberately retained even though the portable GLB owns no bitmap
  // textures. Runtime material clones use them for deterministic, per-instance
  // surface relief at medium and above quality tiers.
  const requiredAttributes = ["position", "normal", "color", "uv", "skinIndex", "skinWeight"];
  for (const name of requiredAttributes) {
    if (!geometry.getAttribute(name)) throw new Error(`Blender V4 source is missing ${name}`);
  }
  const unexpected = Object.keys(geometry.attributes).filter(
    (name) => !requiredAttributes.includes(name),
  );
  if (unexpected.length > 0) {
    throw new Error(`Blender V4 source has unreviewed attributes: ${unexpected.join(", ")}`);
  }

  const sourceBones = sourceMesh.skeleton.bones;
  const sourceBoneNames = sourceBones.map((bone) => bone.name);
  const semanticNames = new Set(V4_BONE_NAMES);
  if (
    sourceBoneNames.length < V4_BONE_NAMES.length ||
    new Set(sourceBoneNames).size !== sourceBoneNames.length ||
    V4_BONE_NAMES.some((name) => !sourceBoneNames.includes(name))
  ) {
    throw new Error(`Blender V4 source skeleton drifted: ${sourceBoneNames.join(", ")}`);
  }

  const sourceByName = new Map(sourceBones.map((bone) => [bone.name, bone]));
  for (const definition of V4_BONE_DEFINITIONS) {
    const sourceBone = sourceByName.get(definition.name);
    if (!sourceBone) throw new Error(`Blender V4 source is missing ${definition.name}`);
    if (definition.parent) {
      if (sourceBone.parent?.name !== definition.parent) {
        throw new Error(`Blender V4 semantic hierarchy drifted at ${definition.name}`);
      }
    } else if (sourceBone.parent?.isBone) {
      throw new Error(`Blender V4 semantic root ${definition.name} must not have a bone parent`);
    }
  }

  const helperBones = sourceBones
    .filter((bone) => !semanticNames.has(bone.name))
    .map((bone) => {
      const parent = bone.parent;
      if (!parent?.isBone || !sourceByName.has(parent.name)) {
        throw new Error(`Blender V4 helper ${bone.name} must have a skin-joint parent`);
      }
      const position = bone.position.toArray();
      const rotationQuaternion = bone.quaternion.toArray();
      const scale = bone.scale.toArray();
      if (![...position, ...rotationQuaternion, ...scale].every(Number.isFinite)) {
        throw new Error(`Blender V4 helper ${bone.name} has a non-finite rest transform`);
      }
      return { name: bone.name, parent: parent.name, position, rotationQuaternion, scale };
    });

  const orderedHelperBones = topologicallyOrderHelperBones(helperBones);
  // Semantic joints remain the stable leading section of the final Skeleton;
  // visual helpers follow in deterministic hierarchy order so skin indices can
  // be remapped without exposing helpers to replay motion code.
  const targetBoneNames = [...V4_BONE_NAMES, ...orderedHelperBones.map((bone) => bone.name)];
  const targetIndex = new Map(targetBoneNames.map((name, index) => [name, index]));
  const sourceToTarget = sourceBoneNames.map((name) => targetIndex.get(name));
  const skinIndex = geometry.getAttribute("skinIndex");
  const remapped = new Uint16Array(skinIndex.count * 4);
  for (let vertex = 0; vertex < skinIndex.count; vertex++) {
    for (let influence = 0; influence < 4; influence++) {
      const sourceIndex = skinIndex.getComponent(vertex, influence);
      const mappedIndex = sourceToTarget[sourceIndex];
      if (!Number.isInteger(mappedIndex)) {
        throw new Error(`Blender V4 source uses invalid joint ${sourceIndex} at vertex ${vertex}`);
      }
      remapped[vertex * 4 + influence] = mappedIndex;
    }
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(remapped, 4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, sourceBoneNames, helperBones: orderedHelperBones };
}

function disposeParsedSource(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
    object.skeleton?.dispose();
  });
  root.removeFromParent();
}

async function buildBlenderGeometry() {
  const scratch = await mkdtemp(join(tmpdir(), "rowplay-v4-blender-"));
  const sourcePath = join(scratch, "rowplay-athlete-v4-blender-source.glb");
  const blender = process.env.BLENDER_BIN || DEFAULT_BLENDER;
  try {
    const result = spawnSync(
      blender,
      ["--background", "--python", BLENDER_GENERATOR, "--", "--output", sourcePath],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Blender V4 authoring failed with exit code ${result.status}`);
    }
    const sourceBytes = await readFile(sourcePath);
    const source = await parseGlb(sourceBytes);
    const sourceMesh = onlySkinnedMesh(source.scene);
    const { geometry, sourceBoneNames, helperBones } = remapBlenderGeometry(sourceMesh);
    const sourceMetrics = {
      blenderBytes: sourceBytes.byteLength,
      vertices: geometry.getAttribute("position").count,
      triangles: geometry.index.count / 3,
      sourceBoneOrder: sourceBoneNames,
      helperBones: helperBones.map((bone) => bone.name),
    };
    disposeParsedSource(source.scene);
    return { geometry, helperBones, sourceMetrics };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const { geometry: blenderGeometry, helperBones, sourceMetrics } = await buildBlenderGeometry();
const asset = createV4AthleteAsset({ helperBones });
try {
  asset.mesh.geometry.dispose();
  asset.mesh.geometry = blenderGeometry;
  asset.mesh.normalizeSkinWeights();
  asset.root.userData.source = SOURCE_DESCRIPTION;
  asset.root.userData.authoringTool = "Blender 5.2 LTS";
  asset.root.userData.authoringScript = "scripts/build-replay-athlete-v4-blender.py";
  asset.root.userData.generator = "scripts/build-replay-rig-v4.mjs";
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
  const expectedBoneNames = [...V4_BONE_NAMES, ...helperBones.map((bone) => bone.name)];
  if (JSON.stringify(loadedBoneNames) !== JSON.stringify(expectedBoneNames)) {
    throw new Error("V4 GLB did not preserve the stable semantic and helper skeleton order");
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
        source: SOURCE_DESCRIPTION,
        mesh: V4_RIG_NAME,
        boneCount: asset.skeleton.bones.length,
        vertices: asset.mesh.geometry.getAttribute("position").count,
        triangles: asset.mesh.geometry.index.count / 3,
        clips: Object.keys(asset.clips).length,
        clipTracks: Object.values(asset.clips).reduce(
          (count, clip) => count + clip.tracks.length,
          0,
        ),
        contactEffectors: Object.keys(asset.effectors).length,
        materialSlots: Array.isArray(asset.mesh.material) ? asset.mesh.material.length : 1,
        blenderSource: sourceMetrics,
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
