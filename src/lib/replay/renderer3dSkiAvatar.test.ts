import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { makeSkierAvatar } from "./renderer3dSkiAvatar";
import { fallbackStrokePose } from "./strokeModel";

const SOURCE = readFileSync(new URL("./renderer3dSkiAvatar.ts", import.meta.url), "utf8");

function snapshotTargets(avatar: ReturnType<typeof makeSkierAvatar>): number[] {
  return Object.values(avatar.v4Targets).flatMap((target) => [
    ...target.position.toArray(),
    ...target.quaternion.toArray(),
  ]);
}

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
    // Observe the phase-dependent contact rig, not the avatar root: the course
    // renderer owns root placement, so `group.position` remains unchanged even
    // when the skier's mutable motion state is wrong.
    const control = makeSkierAvatar(0x3366aa, true, 1, 16, "high");
    const live = makeSkierAvatar(0x3366aa, true, 1, 16, "high");
    const ghost = makeSkierAvatar(0x996633, false, 0.4, 16, "high");
    expect(live.group).not.toBe(ghost.group);
    expect(live.v4Targets).not.toBe(ghost.v4Targets);

    const livePose = fallbackStrokePose("skierg", 0.25 * Math.PI * 2);
    const ghostPose = fallbackStrokePose("skierg", 0.75 * Math.PI * 2);
    control.animate(0.25, false, livePose, 10);
    const expectedLiveTargets = snapshotTargets(control);
    control.animate(0.75, false, ghostPose, 90);
    expect(snapshotTargets(control)).not.toEqual(expectedLiveTargets);

    live.animate(0.25, false, livePose, 10);
    ghost.animate(0.75, false, ghostPose, 90);
    live.animate(0.25, false, livePose, 10);
    expect(snapshotTargets(live)).toEqual(expectedLiveTargets);

    const liveTargetsBeforeGhost = snapshotTargets(live);
    ghost.animate(0.1, false, fallbackStrokePose("skierg", 0.1 * Math.PI * 2), 5);
    expect(snapshotTargets(live)).toEqual(liveTargetsBeforeGhost);
  });

  it("exposes live, solver-driven pre-IK hand targets", () => {
    // The rowplay-qt parity port reads these to compare its `preferred_hand_*`
    // against the web's pre-IK arm target through the pole-contact phase (the
    // post-IK `v4Targets.leftHand` is a different quantity there). SkiErg only
    // solves the pole arms in resolveWorldContacts(), so the targets are valid
    // after that pass.
    const avatar = makeSkierAvatar(0x3366aa, true, 1, 16, "high");
    // The pole solve needs the course-space (outer) transform the renderer
    // supplies, so parent the rig as the course renderer does before resolving.
    const outer = new THREE.Group();
    outer.add(avatar.group);
    outer.updateMatrixWorld(true);
    const poseA = fallbackStrokePose("skierg", 0.25 * Math.PI * 2);
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
      // A real solve wrote it; it is not the untouched zero vector.
      expect(target!.lengthSq(), `${name} hand target solved`).toBeGreaterThan(0);
    }

    // Live reference: the exposed vector is the same instance the solver mutates
    // in place, and its value tracks the actual per-pose solve deterministically
    // (a different pose moves it; returning to the pose restores it exactly).
    const leftRef = left!;
    const solvedA = leftRef.clone();
    const poseB = fallbackStrokePose("skierg", 0.75 * Math.PI * 2);
    avatar.animate(0.75, false, poseB, 90);
    avatar.resolveWorldContacts?.();
    expect(avatar.v4HandTargets?.left, "same Vector3 instance across frames").toBe(leftRef);
    expect(leftRef.equals(solvedA), "target moved with the pose").toBe(false);
    avatar.animate(0.25, false, poseA, 10);
    avatar.resolveWorldContacts?.();
    expect(leftRef.toArray(), "target is deterministic per pose").toEqual(solvedA.toArray());
  });
});
