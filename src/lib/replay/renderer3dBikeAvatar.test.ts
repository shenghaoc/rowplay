import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { makeBikeAvatar } from "./renderer3dBikeAvatar";
import { fallbackStrokePose } from "./strokeModel";

const SOURCE = readFileSync(new URL("./renderer3dBikeAvatar.ts", import.meta.url), "utf8");

function snapshotTargets(avatar: ReturnType<typeof makeBikeAvatar>): number[] {
  return Object.values(avatar.v4Targets).flatMap((target) => [
    ...target.position.toArray(),
    ...target.quaternion.toArray(),
  ]);
}

describe("renderer3dBikeAvatar layering", () => {
  it("builds without importing the course renderer or a sibling sport", () => {
    // Each sport avatar sits directly on `renderer3dAvatarKit` and its own
    // measurement module. Importing the course renderer would restore the
    // cycle the split removed; importing a sibling sport would put one
    // machine's geometry on another's build path.
    for (const forbidden of ["./renderer3d", "./renderer3dRowAvatar", "./renderer3dSkiAvatar"]) {
      expect(SOURCE, `BikeErg avatar must not import ${forbidden}`).not.toContain(
        `from "${forbidden}"`,
      );
    }
  });
});

describe("makeBikeAvatar", () => {
  it("builds a populated BikeErg rig at every quality tier", () => {
    // BikeErg consumes quality through the controller-owned body-segment
    // ladder rather than a separate quality argument.
    const tiers = [
      ["low", 10],
      ["medium", 14],
      ["high", 18],
      ["ultra", 24],
    ] as const;
    const vertexCounts: number[] = [];
    for (const [quality, bodySegments] of tiers) {
      const avatar = makeBikeAvatar(0x3366aa, true, 1, bodySegments);
      expect(avatar.group, `${quality} group`).toBeInstanceOf(THREE.Group);
      let meshes = 0;
      let vertices = 0;
      avatar.group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          meshes += 1;
          vertices += object.geometry.getAttribute("position")?.count ?? 0;
        }
      });
      expect(meshes, `${quality} builds geometry`).toBeGreaterThan(10);
      vertexCounts.push(vertices);
      expect(avatar.assetMaterialResolver, `${quality} resolves asset materials`).toBeTypeOf(
        "function",
      );
      expect(avatar.v4Targets, `${quality} exposes contact targets`).toBeTruthy();
    }
    expect(vertexCounts).toEqual([...vertexCounts].sort((a, b) => a - b));
    expect(new Set(vertexCounts).size).toBe(tiers.length);
  });

  it("carries the BikeErg slot the asset library swaps against", () => {
    const avatar = makeBikeAvatar(0x3366aa, true, 1, 16);
    let found = false;
    avatar.group.traverse((object) => {
      if (object.userData.replayAssetSlot === "equipment:bike:saddle") found = true;
    });
    expect(found, "equipment:bike:saddle present").toBe(true);
  });

  it("returns finite motion cues across the cycle and under reduced motion", () => {
    const avatar = makeBikeAvatar(0x3366aa, true, 1, 16);
    const pose = fallbackStrokePose("bike", 0.5 * Math.PI * 2);
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
    // Observe the phase-dependent contact rig, not the avatar root: the course
    // renderer owns root placement, so `group.position` remains unchanged even
    // when the cyclist's mutable motion state is wrong.
    const control = makeBikeAvatar(0x3366aa, true, 1, 16);
    const live = makeBikeAvatar(0x3366aa, true, 1, 16);
    const ghost = makeBikeAvatar(0x996633, false, 0.4, 16);
    expect(live.group).not.toBe(ghost.group);
    expect(live.v4Targets).not.toBe(ghost.v4Targets);

    const livePose = fallbackStrokePose("bike", 0.25 * Math.PI * 2);
    const ghostPose = fallbackStrokePose("bike", 0.75 * Math.PI * 2);
    control.animate(0.25, false, livePose, 10);
    const expectedLiveTargets = snapshotTargets(control);
    control.animate(0.75, false, ghostPose, 90);
    expect(snapshotTargets(control)).not.toEqual(expectedLiveTargets);

    live.animate(0.25, false, livePose, 10);
    ghost.animate(0.75, false, ghostPose, 90);
    live.animate(0.25, false, livePose, 10);
    expect(snapshotTargets(live)).toEqual(expectedLiveTargets);

    const liveTargetsBeforeGhost = snapshotTargets(live);
    ghost.animate(0.1, false, fallbackStrokePose("bike", 0.1 * Math.PI * 2), 5);
    expect(snapshotTargets(live)).toEqual(liveTargetsBeforeGhost);
  });
});
