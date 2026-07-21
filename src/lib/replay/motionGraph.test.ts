import { describe, expect, it } from "vite-plus/test";
import type { Sport } from "../types";
import {
  createBikeMotionGraphScratch,
  createRowerMotionGraphScratch,
  createSkierMotionGraphScratch,
  sampleBikeMotionGraphInto,
  sampleBikeMotionGraph,
  sampleMotionGraph,
  sampleRowerMotionGraphInto,
  sampleRowerMotionGraph,
  sampleSkierMotionGraphInto,
  sampleSkierMotionGraph,
  SKI_ELBOW_LOAD_CYCLE,
  SKI_POLE_APPROACH_START_CYCLE,
  SKI_POLE_OFF_CYCLE,
  SKI_POLE_RELEASE_START_CYCLE,
  SKI_PREPLANT_START_CYCLE,
  type MotionChannel,
} from "./motionGraph";
import { fallbackStrokePose, type StrokePose } from "./strokeModel";

const TAU = Math.PI * 2;

function poseAt(sport: Sport, cycle: number, intensity = 0.65): StrokePose {
  const rate = sport === "bike" ? 92 : sport === "skierg" ? 34 : 30;
  const normalizedCycle = ((cycle % 1) + 1) % 1;
  // `fallbackStrokePose` caps its public fractional field at 0.999999 for
  // timeline safety. The graph is phase-authoritative, so retain a true
  // near-wrap phase here to exercise continuity on both sides of 2π.
  return {
    ...fallbackStrokePose(sport, cycle * TAU, rate),
    phase: cycle * TAU,
    cycleFrac: normalizedCycle,
    intensity,
  };
}

function expectFiniteChannel(channel: MotionChannel): void {
  expect(Number.isFinite(channel.value)).toBe(true);
  expect(Number.isFinite(channel.velocity)).toBe(true);
  expect(Number.isFinite(channel.acceleration)).toBe(true);
}

function numericLeaves(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(numericLeaves);
}

function objectNodes(value: unknown): object[] {
  if (!value || typeof value !== "object") return [];
  return [value, ...Object.values(value).flatMap(objectNodes)];
}

describe("motionGraph", () => {
  it("is deterministic and discriminated for all three sports", () => {
    const rowPose = poseAt("rower", 0.31);
    expect(sampleMotionGraph("rower", rowPose)).toEqual(sampleMotionGraph("rower", rowPose));
    expect(sampleMotionGraph("rower", rowPose).sport).toBe("rower");
    expect(sampleMotionGraph("skierg", poseAt("skierg", 0.31)).sport).toBe("skierg");
    expect(sampleMotionGraph("bike", poseAt("bike", 0.31)).sport).toBe("bike");
  });

  it("exposes cadence-derived phase derivatives and safely normalizes malformed poses", () => {
    const pose = {
      ...poseAt("rower", 0.25),
      phase: Number.NaN,
      cycleFrac: Number.NaN,
      strokeSeconds: Number.POSITIVE_INFINITY,
      driveFrac: Number.NaN,
      intensity: Number.NaN,
    };
    const graph = sampleRowerMotionGraph(pose);
    expect(graph.timing.cycle).toBe(0);
    expect(graph.timing.secondsPerCycle).toBeCloseTo(60 / 28, 10);
    expect(graph.timing.phaseVelocity).toBeCloseTo(TAU / graph.timing.secondsPerCycle, 10);
    expect(graph.timing.phaseAcceleration).toBe(0);
    for (const value of numericLeaves(graph)) expect(Number.isFinite(value)).toBe(true);
  });

  it("sequences RowErg legs, spine, shoulders, and hands with overlap", () => {
    const driveFraction = poseAt("rower", 0).driveFrac;
    const earlyDrive = sampleRowerMotionGraph(poseAt("rower", driveFraction * 0.5));
    expect(earlyDrive.body.legExtension.value).toBeGreaterThan(earlyDrive.body.spineHinge.value);
    expect(earlyDrive.body.spineHinge.value).toBeGreaterThan(earlyDrive.body.armDraw.value);
    expect(earlyDrive.body.shoulderSet.value).toBeGreaterThan(earlyDrive.body.armDraw.value);
    expect(earlyDrive.body.handleTravel.value).toBeGreaterThan(earlyDrive.body.armDraw.value);

    const recovery = sampleRowerMotionGraph(
      poseAt("rower", driveFraction + (1 - driveFraction) * 0.25),
    );
    expect(recovery.body.armDraw.value).toBeLessThan(recovery.body.spineHinge.value);
    expect(recovery.body.spineHinge.value).toBeLessThan(recovery.body.legExtension.value);
    expect(recovery.body.pelvisTravel.value).toBeCloseTo(recovery.body.seatTravel.value, 12);
    expect(recovery.body.torsoReach.value + recovery.body.spineHinge.value).toBeCloseTo(1, 12);
  });

  it("keeps RowErg endpoints and equipment envelopes C2-flat at phase boundaries", () => {
    const driveFraction = poseAt("rower", 0).driveFrac;
    const epsilon = 1e-9;
    const beforeCatch = sampleRowerMotionGraph(poseAt("rower", 1 - epsilon));
    const atCatch = sampleRowerMotionGraph(poseAt("rower", 0));
    const afterCatch = sampleRowerMotionGraph(poseAt("rower", epsilon));
    const beforeFinish = sampleRowerMotionGraph(poseAt("rower", driveFraction - epsilon));
    const atFinish = sampleRowerMotionGraph(poseAt("rower", driveFraction));
    const afterFinish = sampleRowerMotionGraph(poseAt("rower", driveFraction + epsilon));

    for (const channel of [
      atCatch.body.legExtension,
      atCatch.body.spineHinge,
      atCatch.body.armDraw,
      atCatch.contacts.bladeWater,
      atCatch.contacts.bladeFeather,
      atFinish.body.legExtension,
      atFinish.body.spineHinge,
      atFinish.body.armDraw,
    ]) {
      expect(channel.velocity).toBeCloseTo(0, 9);
      expect(channel.acceleration).toBeCloseTo(0, 7);
    }

    for (const key of ["legExtension", "spineHinge", "armDraw"] as const) {
      expect(atCatch.body[key].value).toBeCloseTo(beforeCatch.body[key].value, 9);
      expect(atCatch.body[key].value).toBeCloseTo(afterCatch.body[key].value, 9);
      expect(atFinish.body[key].value).toBeCloseTo(beforeFinish.body[key].value, 9);
      expect(atFinish.body[key].value).toBeCloseTo(afterFinish.body[key].value, 9);
    }
  });

  it("publishes the measured short-plant and flex-to-extension double-pole sequence", () => {
    for (const cycle of [0, 0.06, 0.14, SKI_POLE_RELEASE_START_CYCLE]) {
      const graph = sampleSkierMotionGraph(poseAt("skierg", cycle));
      expect(graph.contacts.polePlant.value, `plant at cycle ${cycle}`).toBe(1);
      expect(graph.contacts.poleGrip.value).toBe(1);
    }

    const beforeRelease = sampleSkierMotionGraph(poseAt("skierg", SKI_POLE_RELEASE_START_CYCLE));
    const duringRelease = sampleSkierMotionGraph(
      poseAt("skierg", (SKI_POLE_RELEASE_START_CYCLE + SKI_POLE_OFF_CYCLE) * 0.5),
    );
    const afterRelease = sampleSkierMotionGraph(poseAt("skierg", SKI_POLE_OFF_CYCLE));
    expect(beforeRelease.contacts.polePlant.velocity).toBeCloseTo(0, 9);
    expect(beforeRelease.contacts.polePlant.acceleration).toBeCloseTo(0, 7);
    expect(duringRelease.contacts.polePlant.value).toBeGreaterThan(0);
    expect(duringRelease.contacts.polePlant.value).toBeLessThan(1);
    expect(afterRelease.contacts.polePlant.value).toBe(0);

    const loadedElbow = sampleSkierMotionGraph(poseAt("skierg", SKI_ELBOW_LOAD_CYCLE));
    const poleOff = sampleSkierMotionGraph(poseAt("skierg", SKI_POLE_OFF_CYCLE));
    const recovery = sampleSkierMotionGraph(poseAt("skierg", 0.58));
    expect(loadedElbow.body.elbowLoad.value).toBeCloseTo(1, 12);
    expect(poleOff.body.elbowLoad.value).toBe(0);
    expect(poleOff.body.armExtension.value).toBe(1);
    expect(poleOff.body.poleSweep.value).toBe(1);
    expect(poleOff.body.poleFlight.value).toBe(0);
    expect(recovery.body.poleFlight.value).toBe(1);
    expect(recovery.body.poleLift.value).toBeGreaterThan(0.8);
    expect(recovery.contacts.polePlant.value).toBe(0);
  });

  it("keeps SkiErg plant, release, and cycle-seam envelopes C2-flat", () => {
    for (const cycle of [
      SKI_POLE_RELEASE_START_CYCLE,
      SKI_POLE_OFF_CYCLE,
      SKI_PREPLANT_START_CYCLE,
      0,
    ]) {
      const channel = sampleSkierMotionGraph(poseAt("skierg", cycle)).contacts.polePlant;
      expect(channel.velocity, `velocity at ${cycle}`).toBeCloseTo(0, 9);
      expect(channel.acceleration, `acceleration at ${cycle}`).toBeCloseTo(0, 7);
    }
    const beforeSeam = sampleSkierMotionGraph(poseAt("skierg", 1 - 1e-9));
    const atSeam = sampleSkierMotionGraph(poseAt("skierg", 0));
    expect(beforeSeam.contacts.polePlant.value).toBeCloseTo(atSeam.contacts.polePlant.value, 9);
    expect(beforeSeam.body.poleFlight.value).toBeCloseTo(atSeam.body.poleFlight.value, 9);

    // The renderer switches from the previous to the next snow anchor here.
    // Flight weight must be exactly one and C2-flat so the handoff contributes
    // zero position, velocity, or acceleration to the visible basket.
    const approach = sampleSkierMotionGraph(poseAt("skierg", SKI_POLE_APPROACH_START_CYCLE));
    expect(approach.body.poleFlight.value).toBe(1);
    expect(approach.body.poleFlight.velocity).toBe(0);
    expect(approach.body.poleFlight.acceleration).toBe(0);
  });

  it("keeps BikeErg pedal endpoints opposed, circular, and mechanically locked", () => {
    const start = sampleBikeMotionGraph(poseAt("bike", 0));
    const quarter = sampleBikeMotionGraph(poseAt("bike", 0.25));
    const half = sampleBikeMotionGraph(poseAt("bike", 0.5));

    expect(start.crank.angle).toBeCloseTo(0, 12);
    expect(start.rightPedal.rotation.angle).toBeCloseTo(Math.PI, 12);
    expect(start.leftPedal.legExtension.value).toBeCloseTo(half.rightPedal.legExtension.value, 12);
    expect(start.rightPedal.legExtension.value).toBeCloseTo(half.leftPedal.legExtension.value, 12);
    expect(quarter.leftPedal.drive.value).toBeCloseTo(1, 12);
    expect(quarter.rightPedal.drive.value).toBeCloseTo(0, 12);
    expect(start.leftPedal.pedalLock.value).toBe(1);
    expect(start.rightPedal.pedalLock.value).toBe(1);
    expect(start.contacts.handlebarGrip.value).toBe(1);
    expect(start.body.pelvisRock.value).toBeCloseTo(start.body.hipRock.value, 12);

    for (const channel of [
      start.body.torsoSway,
      start.body.hipRock,
      start.body.spineLean,
      start.body.shoulderCounterRotation,
      start.body.headStabilization,
      start.leftPedal.legExtension,
      start.leftPedal.ankleFlex,
      start.leftPedal.drive,
    ]) {
      expectFiniteChannel(channel);
    }
  });

  it("is phase-continuous through the BikeErg crank wrap", () => {
    const epsilon = 1e-9;
    const exactStart = sampleBikeMotionGraph(poseAt("bike", 0));
    const exactWrap = sampleBikeMotionGraph(poseAt("bike", 1));
    const before = sampleBikeMotionGraph(poseAt("bike", 1 - epsilon));
    const after = sampleBikeMotionGraph(poseAt("bike", epsilon));

    expect(exactWrap.crank.sin).toBeCloseTo(exactStart.crank.sin, 12);
    expect(exactWrap.crank.cos).toBeCloseTo(exactStart.crank.cos, 12);
    // Samples on opposite sides of a smooth wrap necessarily have opposite
    // infinitesimal sine signs; their separation is bounded by 2π·2ε.
    expect(Math.abs(before.crank.sin - after.crank.sin)).toBeLessThan(1e-5);
    expect(before.crank.cos).toBeCloseTo(after.crank.cos, 10);
    for (const key of ["torsoSway", "hipRock", "spineLean", "headStabilization"] as const) {
      expect(before.body[key].value).toBeCloseTo(after.body[key].value, 6);
      expect(before.body[key].velocity).toBeCloseTo(after.body[key].velocity, 6);
      expect(before.body[key].acceleration).toBeCloseTo(after.body[key].acceleration, 4);
    }
    expect(before.leftPedal.legExtension.value).toBeCloseTo(after.leftPedal.legExtension.value, 12);
    expect(before.leftPedal.legExtension.velocity).toBeCloseTo(
      after.leftPedal.legExtension.velocity,
      6,
    );
  });

  it("fills caller-owned graph trees without changing sampled choreography", () => {
    const row = createRowerMotionGraphScratch();
    const skier = createSkierMotionGraphScratch();
    const bike = createBikeMotionGraphScratch();
    const rowNodes = objectNodes(row);
    const skierNodes = objectNodes(skier);
    const bikeNodes = objectNodes(bike);

    for (const cycle of [0, 0.003, 0.19, 0.38, 0.61, 0.999]) {
      const rowPose = poseAt("rower", cycle);
      const skierPose = poseAt("skierg", cycle);
      const bikePose = poseAt("bike", cycle);
      expect(sampleRowerMotionGraphInto(rowPose, row)).toBe(row);
      expect(sampleSkierMotionGraphInto(skierPose, skier)).toBe(skier);
      expect(sampleBikeMotionGraphInto(bikePose, bike)).toBe(bike);
      expect(row).toEqual(sampleRowerMotionGraph(rowPose));
      expect(skier).toEqual(sampleSkierMotionGraph(skierPose));
      expect(bike).toEqual(sampleBikeMotionGraph(bikePose));
    }

    for (const [before, after] of [
      [rowNodes, objectNodes(row)],
      [skierNodes, objectNodes(skier)],
      [bikeNodes, objectNodes(bike)],
    ]) {
      expect(after).toHaveLength(before.length);
      for (const [index, node] of before.entries()) expect(after[index]).toBe(node);
    }
  });
});
