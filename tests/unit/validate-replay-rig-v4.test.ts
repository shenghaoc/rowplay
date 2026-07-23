import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { disposeV4AthleteAsset, createV4AthleteAsset } from "../../src/lib/replay/rigV4";

const execFileAsync = promisify(execFile);

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
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(
          buffer,
        ).toString("base64")}`;
        this.onloadend?.();
      });
    }
  }
  Object.assign(globalThis, { FileReader: NodeFileReader });
}

describe("V4 GLB build validator", () => {
  it("accepts a skinned visual helper while retaining semantic-only animation", async () => {
    installFileReaderShim();
    const directory = await mkdtemp(join(tmpdir(), "rowplay-v4-helper-validator-"));
    const output = join(directory, "rowplay-athlete-v4-helper.glb");
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
      const helper = asset.skeleton.getBoneByName("v4LeftForearmTwist");
      if (!helper) throw new Error("V4 helper bone was not authored");
      const helperIndex = asset.skeleton.bones.indexOf(helper);
      const skinIndex = asset.mesh.geometry.getAttribute("skinIndex");
      const skinWeight = asset.mesh.geometry.getAttribute("skinWeight");
      const position = asset.mesh.geometry.getAttribute("position");
      const uvs = new Float32Array(position.count * 2);
      for (let vertex = 0; vertex < position.count; vertex++) {
        // The helper fixture exercises the same reviewed UV contract as the
        // production asset without making its synthetic geometry depend on
        // Blender's smart-project layout.
        uvs[vertex * 2] = (position.getX(vertex) + 1) * 0.5;
        uvs[vertex * 2 + 1] = (position.getY(vertex) + 1) * 0.5;
      }
      asset.mesh.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      skinIndex.setXYZW(0, helperIndex, 0, 0, 0);
      skinWeight.setXYZW(0, 1, 0, 0, 0);
      skinIndex.needsUpdate = true;
      skinWeight.needsUpdate = true;

      const glb = await new GLTFExporter().parseAsync(asset.root, {
        binary: true,
        animations: Object.values(asset.clips),
      });
      if (!(glb instanceof ArrayBuffer)) throw new Error("V4 exporter did not return a GLB");
      await writeFile(output, new Uint8Array(glb));

      const { stdout } = await execFileAsync(process.execPath, [
        "scripts/validate-replay-rig-v4.mjs",
        output,
      ]);
      expect(stdout).toContain("20 bones (1 helpers)");
      expect(stdout).toContain("3 clips");
    } finally {
      disposeV4AthleteAsset(asset);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
