/**
 * Build the isolated V4 skeletal-rig proof as a local GLB.
 *
 * This is intentionally not part of `build:replay-assets`, the runtime loader,
 * or the deployed renderer. Run it only with Node's type-strip loader:
 *
 *   node --experimental-strip-types scripts/build-replay-rig-v4.mjs
 *
 * An optional first argument replaces the output path. The default is a
 * clearly-labelled prototype artifact under `static/replay-assets/`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createV4AthletePrototype,
  disposeV4AthletePrototype,
  V4_CLIP_NAME,
  V4_RIG_NAME,
} from "../src/lib/replay/rigV4Prototype.ts";

const DEFAULT_OUTPUT = "static/replay-assets/rowplay-rig-v4-prototype.glb";
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

const prototype = createV4AthletePrototype();
try {
  const glb = await new GLTFExporter().parseAsync(prototype.root, {
    binary: true,
    animations: [prototype.clip],
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
  if (parsed.animations.length !== 1 || parsed.animations[0]?.name !== V4_CLIP_NAME) {
    throw new Error("V4 GLB did not preserve its deterministic animation clip");
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
        ...prototype.metrics,
        loadedSkinnedMeshes: loadedSkins.length,
        animation: {
          name: parsed.animations[0]?.name,
          tracks: parsed.animations[0]?.tracks.length,
          durationSeconds: parsed.animations[0]?.duration,
        },
      },
      null,
      2,
    ),
  );
} finally {
  disposeV4AthletePrototype(prototype);
}
