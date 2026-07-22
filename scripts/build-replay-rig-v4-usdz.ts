import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_BLENDER_BIN = "/Applications/Blender.app/Contents/MacOS/blender";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function replayRigV4BlenderBin(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment.BLENDER_BIN?.trim();
  return configured || DEFAULT_BLENDER_BIN;
}

export function buildReplayRigV4Usdz(blender = replayRigV4BlenderBin()): void {
  const result = spawnSync(
    blender,
    [
      "--background",
      "--python",
      resolve(REPOSITORY_ROOT, "scripts/build-replay-rig-v4-usdz.py"),
      "--",
      "--input",
      resolve(REPOSITORY_ROOT, "static/replay-assets/rowplay-athlete-v4.glb"),
      "--output",
      resolve(REPOSITORY_ROOT, "static/replay-assets/rowplay-athlete-v4.usdz"),
    ],
    { stdio: "inherit" },
  );
  if (result.error) {
    throw new Error(`Unable to launch Blender at ${blender}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new Error(`Blender USDZ export failed with status ${result.status ?? "unknown"}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildReplayRigV4Usdz();
}
