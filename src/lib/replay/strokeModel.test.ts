import { describe, expect, it } from "vite-plus/test";
import type { Stroke } from "../types";
import {
  buildStrokeTimeline,
  catchTransitions,
  strokePoseAt,
  fallbackStrokePose,
} from "./strokeModel";

function stroke(t: number, d: number, spm: number, watts: number, hr = 150): Stroke {
  return { t, d, pace: 120, spm, watts, hr };
}

describe("strokeModel", () => {
  it("maps irregular Concept2 stroke intervals to one visible cycle per row", () => {
    const timeline = buildStrokeTimeline(
      [stroke(1.8, 10, 30, 180), stroke(4.4, 24, 23, 210), stroke(6.1, 36, 35, 260)],
      "rower",
      true,
    );

    const first = strokePoseAt(timeline, 0.9);
    const second = strokePoseAt(timeline, 2.6);
    const third = strokePoseAt(timeline, 5.2);

    expect(first.index).toBe(0);
    expect(first.cycleFrac).toBeCloseTo(0.5, 2);
    expect(second.index).toBe(1);
    expect(second.strokeSeconds).toBeCloseTo(2.6, 2);
    expect(third.index).toBe(2);
    expect(third.strokeSeconds).toBeCloseTo(1.7, 2);
  });

  it("normalizes interval-reset rows instead of producing backward time", () => {
    const timeline = buildStrokeTimeline(
      [stroke(5, 52, 24, 150), stroke(10, 105, 25, 170), stroke(2, 22, 30, 220)],
      "skierg",
      true,
    );

    expect(timeline.entries[2].startT).toBe(10);
    expect(timeline.entries[2].endT).toBeGreaterThan(10);
    expect(timeline.entries[2].endD).toBeGreaterThan(timeline.entries[2].startD);
    expect(strokePoseAt(timeline, 10.5).index).toBe(2);
  });

  it("skips leading and repeated non-advancing anchors instead of inventing cycles", () => {
    const timeline = buildStrokeTimeline(
      [stroke(0, 0, 30, 0), stroke(2, 10, 30, 180), stroke(2, 10, 30, 180), stroke(4, 21, 30, 190)],
      "rower",
      true,
    );

    expect(timeline.entries).toHaveLength(2);
    expect(timeline.entries.map((entry) => entry.index)).toEqual([0, 1]);
    expect(timeline.duration).toBe(4);
    expect(timeline.distance).toBe(21);
    expect(strokePoseAt(timeline, 2).index).toBe(1);
  });

  it("uses normalized sec/500m pace when inferring BikeErg distance", () => {
    const timeline = buildStrokeTimeline(
      [stroke(0, 0, 60, 0), { t: 2, d: 0, pace: 100, spm: 60, watts: 200 }],
      "bike",
      true,
    );

    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0].endD - timeline.entries[0].startD).toBeCloseTo(10, 10);
  });

  it("keeps split fallback synthetic and finite", () => {
    const timeline = buildStrokeTimeline(
      [stroke(60, 250, 0, 0), stroke(120, 500, 0, 0)],
      "rower",
      false,
    );
    const pose = strokePoseAt(timeline, 45);

    expect(pose.real).toBe(false);
    expect(Number.isFinite(pose.phase)).toBe(true);
    expect(pose.rate).toBeGreaterThan(0);
  });

  it("integrates synthetic phase continuously across changing rates", () => {
    const timeline = buildStrokeTimeline(
      [stroke(60, 250, 20, 100), stroke(120, 500, 30, 120)],
      "rower",
      false,
    );
    const before = strokePoseAt(timeline, 59.999);
    const boundary = strokePoseAt(timeline, 60);
    const after = strokePoseAt(timeline, 60.001);

    expect(boundary.phase).toBeCloseTo(20 * Math.PI * 2, 8);
    expect(boundary.phase - before.phase).toBeGreaterThan(0);
    expect(boundary.phase - before.phase).toBeLessThan(0.01);
    expect(after.phase - boundary.phase).toBeGreaterThan(0);
    expect(after.phase - boundary.phase).toBeLessThan(0.01);
  });

  it("keeps one real cycle per API row for every sport", () => {
    for (const sportName of ["rower", "skierg", "bike"] as const) {
      const timeline = buildStrokeTimeline(
        [stroke(0, 0, 30, 0), stroke(2, 10, 30, 180), stroke(4, 20, 30, 190)],
        sportName,
        true,
      );

      expect(strokePoseAt(timeline, 1).index).toBe(0);
      expect(strokePoseAt(timeline, 2).index).toBe(1);
      expect(strokePoseAt(timeline, 2).phase).toBeCloseTo(Math.PI * 2, 8);
    }
  });

  it("changes timing and restrained secondary cues for harder late rows", () => {
    const timeline = buildStrokeTimeline(
      [stroke(3, 8, 18, 90, 120), stroke(5, 25, 42, 420, 178)],
      "rower",
      true,
    );

    const low = strokePoseAt(timeline, 1.5);
    const high = strokePoseAt(timeline, 4);

    expect(high.driveFrac).toBeGreaterThan(low.driveFrac);
    expect(high.amplitude).toBeGreaterThan(low.amplitude);
    expect(high.fatigue).toBeGreaterThan(low.fatigue);
  });

  it("detects exact catch-index transitions without firing on seeks", () => {
    const timeline = buildStrokeTimeline(
      [
        stroke(2, 10, 30, 180),
        stroke(4, 20, 30, 185),
        stroke(6, 30, 30, 190),
        stroke(8, 40, 30, 195),
      ],
      "rower",
      true,
    );
    const before = strokePoseAt(timeline, 3.99);
    const after = strokePoseAt(timeline, 4);
    const seek = strokePoseAt(timeline, 8);

    expect(catchTransitions(before, after)).toBe(1);
    expect(catchTransitions(before, seek, 1)).toBe(0);
    expect(catchTransitions(after, before)).toBe(0);
  });

  it("builds a bike fallback with symmetric drive/recovery", () => {
    const pose = fallbackStrokePose("bike", Math.PI, 90);
    expect(pose.driveFrac).toBe(0.5);
    expect(pose.rate).toBe(90);
  });

  it("aggregates watts, distance-per-stroke and HR across the timeline", () => {
    // intensity/fatigue inside strokePoseAt are normalised against these
    // aggregates — assert them directly so a future regression in
    // buildStrokeTimeline's reducers can't silently distort animation
    // intensity without breaking a unit test.
    const timeline = buildStrokeTimeline(
      [stroke(2, 11, 28, 160, 140), stroke(4, 23, 30, 220, 160), stroke(6, 36, 32, 280, 178)],
      "rower",
      true,
    );

    // median of [160,220,280] = 220; peak = 280.
    expect(timeline.medianWatts).toBe(220);
    expect(timeline.peakWatts).toBe(280);
    // median DPS of [11,12,13] = 12.
    expect(timeline.medianDps).toBe(12);
    // median HR of [140,160,178] = 160; max = 178.
    expect(timeline.medianHr).toBe(160);
    expect(timeline.maxHr).toBe(178);
  });

  it("falls back to defaults when strokes carry no watts or heart rate", () => {
    const timeline = buildStrokeTimeline(
      [
        { t: 2, d: 11, pace: 120, spm: 28, watts: 0 },
        { t: 4, d: 22, pace: 120, spm: 28, watts: 0 },
      ],
      "rower",
      true,
    );

    expect(timeline.medianWatts).toBe(0);
    expect(timeline.peakWatts).toBe(0);
    // No HR → medianHr/maxHr stay at the 0 baseline.
    expect(timeline.medianHr).toBe(0);
    expect(timeline.maxHr).toBe(0);
    // medianDps is still computable from per-stroke distance deltas (both 11).
    expect(timeline.medianDps).toBe(11);
  });
});
