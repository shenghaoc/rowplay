import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_BLENDER_BIN, replayRigV4BlenderBin } from "../../scripts/build-replay-rig-v4-usdz";

describe("V4 USDZ Blender launcher", () => {
  it("uses BLENDER_BIN when contributors configure a custom executable", () => {
    expect(replayRigV4BlenderBin({ BLENDER_BIN: "/opt/blender-5/blender" })).toBe(
      "/opt/blender-5/blender",
    );
  });

  it("falls back to the documented macOS Blender application", () => {
    expect(replayRigV4BlenderBin({})).toBe(DEFAULT_BLENDER_BIN);
    expect(replayRigV4BlenderBin({ BLENDER_BIN: "   " })).toBe(DEFAULT_BLENDER_BIN);
  });
});
