import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { makeSkierAvatar } from "./renderer3dSkiAvatar";
import { fallbackStrokePose } from "./strokeModel";

const SOURCE = readFileSync(new URL("./renderer3dSkiAvatar.ts", import.meta.url), "utf8");

describe("renderer3dSkiAvatar layering", () => {
  it("builds without importing the course renderer or a sibling sport", () => {
    // Each sport avatar sits directly on `renderer3dAvatarKit` and its own
    // measurement module. Importing the course renderer would restore the
    // cycle the split removed; importing a sibling sport would put one
    // machine's geometry on another's build path.
    for (const forbidden of ["./renderer3d", "./renderer3dRowAvatar", "./renderer3dBikeAvatar"]) {
      expect(SOURCE, `SkiErg avatar must not import ${forbidden}`).not.toContain(
        `from "${forbidden}"`,
      );
    }
  });
});

describe("makeSkierAvatar", () => {
  it("builds a populated SkiErg rig at every quality tier", () => {
    for (const quality of ["low", "medium", "high", "ultra"] as const) {
      const avatar = makeSkierAvatar(0x3366aa, true, 1, 16, quality);
      expect(avatar.group, `${quality} group`).toBeInstanceOf(THREE.Group);
      let meshes = 0;
      avatar.group.traverse((object) => {
        if (object instanceof THREE.Mesh) meshes += 1;
      });
      expect(meshes, `${quality} builds geometry`).toBeGreaterThan(10);
      expect(avatar.assetMaterialResolver, `${quality} resolves asset materials`).toBeTypeOf(
        "function",
      );
      expect(avatar.v4Targets, `${quality} exposes contact targets`).toBeTruthy();
    }
  });

  it("carries the SkiErg slot the asset library swaps against", () => {
    const avatar = makeSkierAvatar(0x3366aa, true, 1, 16, "high");
    let found = false;
    avatar.group.traverse((object) => {
      if (object.userData.replayAssetSlot === "equipment:ski:pole-grip") found = true;
    });
    expect(found, "equipment:ski:pole-grip present").toBe(true);
  });

  it("returns finite motion cues across the cycle and under reduced motion", () => {
    const avatar = makeSkierAvatar(0x3366aa, true, 1, 16, "high");
    const pose = fallbackStrokePose("skierg", 0.5 * Math.PI * 2);
    for (let step = 0; step <= 8; step++) {
      const phase = step / 8;
      for (const reduceMotion of [false, true]) {
        const cues = avatar.animate(phase, reduceMotion, pose, phase * 100);
        for (const [key, value] of Object.entries(cues)) {
          expect(Number.isFinite(value), `${key} finite at ${phase} reduced=${reduceMotion}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("keeps live and ghost rigs independent", () => {
    // Sampling scratch is retained per avatar; a shared graph would let the
    // ghost lane's phase leak into the live athlete.
    const live = makeSkierAvatar(0x3366aa, true, 1, 16, "high");
    const ghost = makeSkierAvatar(0x996633, false, 0.4, 16, "high");
    expect(live.group).not.toBe(ghost.group);
    expect(live.v4Targets).not.toBe(ghost.v4Targets);
    const pose = fallbackStrokePose("skierg", 0.25 * Math.PI * 2);
    live.animate(0.25, false, pose, 10);
    ghost.animate(0.75, false, fallbackStrokePose("skierg", 0.75 * Math.PI * 2), 90);
    live.animate(0.25, false, pose, 10);
    const livePosition = live.group.position.clone();
    ghost.animate(0.1, false, fallbackStrokePose("skierg", 0.1 * Math.PI * 2), 5);
    expect(live.group.position.distanceTo(livePosition)).toBeLessThan(1e-9);
  });
});
