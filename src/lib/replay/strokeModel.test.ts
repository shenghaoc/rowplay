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

  it("widens high-rate/high-power envelopes compared with low-rate rows", () => {
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
      [
        stroke(2, 11, 28, 160, 140),
        stroke(4, 23, 30, 220, 160),
        stroke(6, 36, 32, 280, 178),
      ],
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
