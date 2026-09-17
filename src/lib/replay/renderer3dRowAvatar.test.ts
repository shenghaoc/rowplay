import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { makeRowerAvatar } from "./renderer3dRowAvatar";
import { fallbackStrokePose } from "./strokeModel";

const SOURCE = readFileSync(new URL("./renderer3dRowAvatar.ts", import.meta.url), "utf8");

function snapshotTargets(avatar: ReturnType<typeof makeRowerAvatar>): number[] {
  return Object.values(avatar.v4Targets).flatMap((target) => [
    ...target.position.toArray(),
    ...target.quaternion.toArray(),
  ]);
}

describe("renderer3dRowAvatar layering", () => {
  it("builds without importing the course renderer or a sibling sport", () => {
    // Each sport avatar sits directly on `renderer3dAvatarKit` and its own
    // measurement module. Importing the course renderer would restore the
    // cycle the split removed; importing a sibling sport would put one
    // machine's geometry on another's build path.
    for (const forbidden of ["./renderer3d", "./renderer3dSkiAvatar", "./renderer3dBikeAvatar"]) {
      expect(SOURCE, `RowErg avatar must not import ${forbidden}`).not.toContain(
        `from "${forbidden}"`,
      );
    }
  });
});

describe("makeRowerAvatar", () => {
  it("builds a populated RowErg rig at every quality tier", () => {
    for (const quality of ["low", "medium", "high", "ultra"] as const) {
      const avatar = makeRowerAvatar(0x3366aa, true, 1, 16, quality);
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

  it("carries the RowErg slot the asset library swaps against", () => {
    const avatar = makeRowerAvatar(0x3366aa, true, 1, 16, "high");
    let found = false;
    avatar.group.traverse((object) => {
      if (object.userData.replayAssetSlot === "equipment:row:blade") found = true;
    });
    expect(found, "equipment:row:blade present").toBe(true);
  });

  it("returns finite motion cues across the cycle and under reduced motion", () => {
    const avatar = makeRowerAvatar(0x3366aa, true, 1, 16, "high");
    const pose = fallbackStrokePose("rower", 0.5 * Math.PI * 2);
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
    // when the rower's mutable motion state is wrong.
    const control = makeRowerAvatar(0x3366aa, true, 1, 16, "high");
    const live = makeRowerAvatar(0x3366aa, true, 1, 16, "high");
    const ghost = makeRowerAvatar(0x996633, false, 0.4, 16, "high");
    expect(live.group).not.toBe(ghost.group);
    expect(live.v4Targets).not.toBe(ghost.v4Targets);

    const livePose = fallbackStrokePose("rower", 0.25 * Math.PI * 2);
    const ghostPose = fallbackStrokePose("rower", 0.75 * Math.PI * 2);
    control.animate(0.25, false, livePose, 10);
    const expectedLiveTargets = snapshotTargets(control);
    control.animate(0.75, false, ghostPose, 90);
    expect(snapshotTargets(control)).not.toEqual(expectedLiveTargets);

    live.animate(0.25, false, livePose, 10);
    ghost.animate(0.75, false, ghostPose, 90);
    live.animate(0.25, false, livePose, 10);
    expect(snapshotTargets(live)).toEqual(expectedLiveTargets);

    const liveTargetsBeforeGhost = snapshotTargets(live);
    ghost.animate(0.1, false, fallbackStrokePose("rower", 0.1 * Math.PI * 2), 5);
    expect(snapshotTargets(live)).toEqual(liveTargetsBeforeGhost);
  });

  it("exposes live, solver-driven pre-IK hand targets", () => {
    // The rowplay-qt parity port reads these to compare its `preferred_hand_*`
    // against the web's pre-IK grip target. The rower solves the arms inside
    // animate(); resolveWorldContacts?.() is a no-op here (kept for a uniform
    // read sequence across the three avatars).
    const avatar = makeRowerAvatar(0x3366aa, true, 1, 16, "high");
    const poseA = fallbackStrokePose("rower", 0.25 * Math.PI * 2);
    avatar.animate(0.25, false, poseA, 10);
    avatar.resolveWorldContacts?.();

    const targets = avatar.v4HandTargets;
    expect(targets, "v4HandTargets exposed").toBeTruthy();
    const left = targets?.left;
    const right = targets?.right;
    for (const [name, target] of [
      ["left", left],
      ["right", right],
    ] as const) {
      expect(target, `${name} hand target present`).toBeInstanceOf(THREE.Vector3);
      for (const c of target!.toArray()) {
        expect(Number.isFinite(c), `${name} hand target finite`).toBe(true);
      }
      expect(target!.lengthSq(), `${name} hand target solved`).toBeGreaterThan(0);
    }
    // The hand marker is placed on this exact target, so the exposed pre-IK
    // target equals the point the solver actually used for the visible hand.
    expect(left!.toArray(), "left target drives the placed hand").toEqual(
      avatar.v4Targets.leftHand.position.toArray(),
    );

    // Live reference: same instance across frames, deterministic per pose.
    const leftRef = left!;
    const solvedA = leftRef.clone();
    avatar.animate(0.75, false, fallbackStrokePose("rower", 0.75 * Math.PI * 2), 90);
    expect(avatar.v4HandTargets?.left, "same Vector3 instance across frames").toBe(leftRef);
    expect(leftRef.equals(solvedA), "target moved with the pose").toBe(false);
    avatar.animate(0.25, false, poseA, 10);
    expect(leftRef.toArray(), "target is deterministic per pose").toEqual(solvedA.toArray());
  });
});
