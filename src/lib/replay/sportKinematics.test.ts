import { describe, expect, it } from "vite-plus/test";
import type { Sport } from "../types";
import { fallbackStrokePose, type StrokePose } from "./strokeModel";
import {
  sampleBikeMotionGraph,
  sampleRowerMotionGraph,
  sampleSkierMotionGraph,
} from "./motionGraph";
import { solveBikeKinematics, solveRowerKinematics, solveSkierKinematics } from "./sportKinematics";

const TAU = Math.PI * 2;

function poseAt(sport: Sport, cycleFrac: number, intensity = 0.5): StrokePose {
  const rate = sport === "bike" ? 90 : sport === "skierg" ? 36 : 30;
  return { ...fallbackStrokePose(sport, cycleFrac * TAU, rate), intensity };
}

function expectUnit(value: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(1);
}

describe("sportKinematics", () => {
  it("projects the shared motion graph instead of maintaining a second technique model", () => {
    const rowPose = poseAt("rower", 0.23, 0.72);
    const rowGraph = sampleRowerMotionGraph(rowPose);
    const row = solveRowerKinematics(rowPose);
    expect(row.legExtension).toBe(rowGraph.body.legExtension.value);
    expect(row.bodySwing).toBe(rowGraph.body.spineHinge.value);
    expect(row.armDraw).toBe(rowGraph.body.armDraw.value);
    expect(row.bladeDepth).toBe(rowGraph.contacts.bladeWater.value);
    expect(row.bladeFeather).toBe(rowGraph.contacts.bladeFeather.value);

    const skiPose = poseAt("skierg", 0.2, 0.72);
    const skiGraph = sampleSkierMotionGraph(skiPose);
    const ski = solveSkierKinematics(skiPose);
    expect(ski.armPress).toBe(skiGraph.body.armPress.value);
    expect(ski.hipHinge).toBe(skiGraph.body.pelvisHinge.value);
    expect(ski.kneeFlex).toBe(skiGraph.body.kneeFlex.value);
    expect(ski.poleContact).toBe(skiGraph.contacts.polePlant.value);

    const bikePose = poseAt("bike", 0.23, 0.72);
    const bikeGraph = sampleBikeMotionGraph(bikePose);
    const bike = solveBikeKinematics(bikePose);
    expect(bike.crankAngle).toBe(bikeGraph.crank.angle);
    expect(bike.anklePitchLeft).toBeCloseTo(-0.05 + bikeGraph.leftPedal.ankleFlex.value * 0.3, 12);
    expect(bike.anklePitchRight).toBeCloseTo(
      -0.05 + bikeGraph.rightPedal.ankleFlex.value * 0.3,
      12,
    );
  });

  it("sequences rowing legs-body-arms on drive and hands-body-slide on recovery", () => {
    const driveFrac = poseAt("rower", 0).driveFrac;
    const drive = solveRowerKinematics(poseAt("rower", driveFrac * 0.5));
    expect(drive.legExtension).toBeGreaterThan(drive.bodySwing);
    expect(drive.bodySwing).toBeGreaterThan(drive.armDraw);

    const recovery = solveRowerKinematics(poseAt("rower", driveFrac + (1 - driveFrac) * 0.25));
    expect(recovery.armDraw).toBeLessThan(recovery.bodySwing);
    expect(recovery.bodySwing).toBeLessThan(recovery.legExtension);
  });

  it("sequences the SkiErg press and rebound without joint snaps", () => {
    const driveFrac = poseAt("skierg", 0).driveFrac;
    const press = solveSkierKinematics(poseAt("skierg", driveFrac * 0.35));
    expect(press.armPress).toBeGreaterThan(press.hipHinge);
    expect(press.hipHinge).toBeGreaterThan(press.kneeFlex);

    const beforeFinish = solveSkierKinematics(poseAt("skierg", driveFrac - 1e-7));
    const afterFinish = solveSkierKinematics(poseAt("skierg", driveFrac + 1e-7));
    expect(Math.abs(beforeFinish.armPress - afterFinish.armPress)).toBeLessThan(1e-6);
    expect(Math.abs(beforeFinish.hipHinge - afterFinish.hipHinge)).toBeLessThan(1e-6);
    expect(Math.abs(beforeFinish.kneeFlex - afterFinish.kneeFlex)).toBeLessThan(1e-6);

    const recovery = solveSkierKinematics(poseAt("skierg", driveFrac + (1 - driveFrac) * 0.25));
    expect(recovery.armPress).toBeLessThan(recovery.hipHinge);
    expect(recovery.hipHinge).toBeLessThan(recovery.kneeFlex);
    expect(recovery.rebound).toBeGreaterThan(0);
  });

  it("plants and releases SkiErg poles with C1 contact velocity", () => {
    const driveFrac = poseAt("skierg", 0).driveFrac;
    const recoveryFrac = 1 - driveFrac;
    const epsilon = 1e-5;
    const contactAtCycle = (cycle: number) =>
      solveSkierKinematics(poseAt("skierg", cycle)).poleContact;

    // Each boundary has zero velocity on both sides: lift-off and touch-down
    // are no longer eased with a nonzero-velocity curve that makes the stick
    // visibly snap through the snow.
    // The shared technique graph enters the plant at 0.5% of the drive,
    // reaches a full brace at 18%, holds it throughout the loaded pull, then
    // starts its C2 release at 84% and clears the snow 8% into recovery.
    for (const boundary of [
      driveFrac * 0.005,
      driveFrac * 0.18,
      driveFrac * 0.84,
      driveFrac + recoveryFrac * 0.08,
    ]) {
      const before = contactAtCycle(boundary - epsilon);
      const atBoundary = contactAtCycle(boundary);
      const after = contactAtCycle(boundary + epsilon);
      const incomingVelocity = (atBoundary - before) / epsilon;
      const outgoingVelocity = (after - atBoundary) / epsilon;

      expect(Math.abs(incomingVelocity), `incoming contact velocity at ${boundary}`).toBeLessThan(
        0.02,
      );
      expect(Math.abs(outgoingVelocity), `outgoing contact velocity at ${boundary}`).toBeLessThan(
        0.02,
      );
      expect(
        Math.abs(outgoingVelocity - incomingVelocity),
        `contact velocity continuity at ${boundary}`,
      ).toBeLessThan(0.02);
    }

    expect(contactAtCycle(0)).toBe(0);
    // The basket is fully braced against the snow while the press develops and
    // peaks; this is the visual anchor that makes the skier's forward drive
    // read as propulsion rather than a pair of swinging sticks.
    for (const progress of [0.18, 0.4, 0.62, 0.72, 0.8]) {
      expect(contactAtCycle(driveFrac * progress), `full plant at ${progress}`).toBe(1);
    }
    expect(contactAtCycle(driveFrac * 0.9)).toBeGreaterThan(0);
    expect(contactAtCycle(driveFrac * 0.9)).toBeLessThan(1);
    expect(contactAtCycle(driveFrac)).toBeGreaterThan(0);
    expect(contactAtCycle(driveFrac + recoveryFrac * 0.08)).toBe(0);
  });

  it("keeps all normalized sport channels finite and bounded", () => {
    for (let step = 0; step < 100; step++) {
      const cycleFrac = step / 100;
      const rower = solveRowerKinematics(poseAt("rower", cycleFrac, step / 99));
      expectUnit(rower.legExtension);
      expectUnit(rower.bodySwing);
      expectUnit(rower.armDraw);
      expectUnit(rower.bladeDepth);
      expectUnit(rower.bladeFeather);
      expect(Math.abs(rower.surge)).toBeLessThanOrEqual(1);
      expect(Math.abs(rower.vertical)).toBeLessThanOrEqual(1);

      const skier = solveSkierKinematics(poseAt("skierg", cycleFrac, step / 99));
      expectUnit(skier.armPress);
      expectUnit(skier.hipHinge);
      expectUnit(skier.kneeFlex);
      expectUnit(skier.poleContact);
      expectUnit(skier.poleSweep);
      expectUnit(skier.rebound);
      expect(Math.abs(skier.surge)).toBeLessThanOrEqual(1);

      const bike = solveBikeKinematics(poseAt("bike", cycleFrac, step / 99));
      for (const value of Object.values(bike)) expect(Number.isFinite(value)).toBe(true);
      expect(bike.crankAngle).toBeGreaterThanOrEqual(0);
      expect(bike.crankAngle).toBeLessThan(TAU);
      expect(Math.abs(bike.torsoSway)).toBeLessThanOrEqual(0.08);
      expect(Math.abs(bike.hipRock)).toBeLessThanOrEqual(0.05);
      expect(bike.anklePitchLeft).toBeGreaterThanOrEqual(-0.24);
      expect(bike.anklePitchLeft).toBeLessThanOrEqual(0.14);
      expect(bike.anklePitchRight).toBeGreaterThanOrEqual(-0.24);
      expect(bike.anklePitchRight).toBeLessThanOrEqual(0.14);
    }
  });

  it("uses intensity only for restrained secondary motion", () => {
    const low = solveRowerKinematics(poseAt("rower", 0.2, 0));
    const high = solveRowerKinematics(poseAt("rower", 0.2, 1));
    expect(high.legExtension).toBe(low.legExtension);
    expect(high.bodySwing).toBe(low.bodySwing);
    expect(high.armDraw).toBe(low.armDraw);
    expect(high.bladeDepth).toBe(low.bladeDepth);
    expect(Math.abs(high.surge - low.surge)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(high.vertical - low.vertical)).toBeLessThanOrEqual(0.1);
  });

  it("can reuse caller-owned outputs in renderer hot paths", () => {
    const rower = solveRowerKinematics(poseAt("rower", 0));
    const skier = solveSkierKinematics(poseAt("skierg", 0));
    const bike = solveBikeKinematics(poseAt("bike", 0));

    expect(solveRowerKinematics(poseAt("rower", 0.25), rower)).toBe(rower);
    expect(solveSkierKinematics(poseAt("skierg", 0.25), skier)).toBe(skier);
    expect(solveBikeKinematics(poseAt("bike", 0.25), bike)).toBe(bike);
  });

  it("keeps BikeErg cranks continuous with opposite ankle articulation", () => {
    const start = solveBikeKinematics(poseAt("bike", 0));
    const half = solveBikeKinematics(poseAt("bike", 0.5));
    const wrapped = solveBikeKinematics({ ...poseAt("bike", 0), phase: TAU });

    expect(start.crankAngle).toBeCloseTo(0, 10);
    expect(wrapped.crankAngle).toBeCloseTo(0, 10);
    expect(start.anklePitchLeft).toBeCloseTo(half.anklePitchRight, 10);
    expect(start.anklePitchRight).toBeCloseTo(half.anklePitchLeft, 10);
    expect(Math.abs(start.torsoSway)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(half.hipRock)).toBeLessThanOrEqual(0.05);

    const beforeWrap = solveBikeKinematics(poseAt("bike", 1 - 1e-7));
    const afterWrap = solveBikeKinematics(poseAt("bike", 1e-7));
    expect(Math.abs(Math.sin(beforeWrap.crankAngle) - Math.sin(afterWrap.crankAngle))).toBeLessThan(
      1e-5,
    );
    expect(Math.abs(Math.cos(beforeWrap.crankAngle) - Math.cos(afterWrap.crankAngle))).toBeLessThan(
      2e-6,
    );
    expect(Math.abs(beforeWrap.torsoSway - afterWrap.torsoSway)).toBeLessThan(1e-5);
    expect(Math.abs(beforeWrap.hipRock - afterWrap.hipRock)).toBeLessThan(1e-5);
    expect(Math.abs(beforeWrap.anklePitchLeft - afterWrap.anklePitchLeft)).toBeLessThan(1e-5);
    expect(Math.abs(beforeWrap.anklePitchRight - afterWrap.anklePitchRight)).toBeLessThan(1e-5);
  });

  it("starts the drive smoothly without a joint snap at the catch", () => {
    const epsilon = 1e-5;
    const atCatch = solveRowerKinematics(poseAt("rower", 0));
    const justBefore = solveRowerKinematics(poseAt("rower", 1 - epsilon));
    const justAfter = solveRowerKinematics(poseAt("rower", epsilon));
    const incomingVelocity = (atCatch.legExtension - justBefore.legExtension) / epsilon;
    const outgoingVelocity = (justAfter.legExtension - atCatch.legExtension) / epsilon;
    // Both sides approach rest at the catch. This guards velocity continuity,
    // not merely the positional continuity that a hard ease-out also passes.
    expect(Math.abs(incomingVelocity)).toBeLessThan(0.02);
    expect(Math.abs(outgoingVelocity)).toBeLessThan(0.02);
    expect(Math.abs(outgoingVelocity - incomingVelocity)).toBeLessThan(0.02);
    expect(atCatch.legExtension).toBe(0);
    expect(atCatch.bodySwing).toBe(0);
    expect(atCatch.armDraw).toBe(0);
  });

  it("finishes the drive fully extended before recovery folds the joints", () => {
    const driveFrac = poseAt("rower", 0).driveFrac;
    const atFinish = solveRowerKinematics(poseAt("rower", driveFrac - 1e-7));
    expect(atFinish.legExtension).toBeGreaterThan(0.98);
    expect(atFinish.bodySwing).toBeGreaterThan(0.98);
    expect(atFinish.armDraw).toBeGreaterThan(0.98);
  });

  it("keeps articulated joint velocity continuous across the drive finish", () => {
    const driveFrac = poseAt("rower", 0).driveFrac;
    const epsilon = 1e-5;
    const before = solveRowerKinematics(poseAt("rower", driveFrac - epsilon));
    const atFinish = solveRowerKinematics(poseAt("rower", driveFrac));
    const after = solveRowerKinematics(poseAt("rower", driveFrac + epsilon));

    for (const joint of ["legExtension", "bodySwing", "armDraw"] as const) {
      const incomingVelocity = (atFinish[joint] - before[joint]) / epsilon;
      const outgoingVelocity = (after[joint] - atFinish[joint]) / epsilon;
      expect(Math.abs(incomingVelocity), `${joint} incoming`).toBeLessThan(0.05);
      expect(Math.abs(outgoingVelocity), `${joint} outgoing`).toBeLessThan(0.05);
      expect(Math.abs(outgoingVelocity - incomingVelocity), `${joint} continuity`).toBeLessThan(
        0.05,
      );
    }
  });
});
