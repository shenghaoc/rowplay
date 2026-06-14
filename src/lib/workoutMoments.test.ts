import { describe, expect, it } from "vite-plus/test";
import { analyzeWorkoutMoments } from "./workoutMoments";
import type { Split, Stroke, WorkoutDetail } from "./types";

function detail(overrides: Partial<WorkoutDetail> = {}): WorkoutDetail {
  const strokes =
    overrides.strokes ??
    strokesFromPaces([120, 120, 112, 112, 112, 122, 126, 126, 118, 116, 114, 114]);
  return {
    id: 1,
    date: "2026-06-01",
    sport: "rower",
    distance: strokes.at(-1)?.d ?? 2000,
    time: strokes.at(-1)?.t ?? 720,
    pace: 120,
    strokeRate: 24,
    hasStrokeData: true,
    workoutType: "Test",
    strokes,
    splits: [],
    isInterval: false,
    ...overrides,
  };
}

function strokesFromPaces(paces: number[], step = 30): Stroke[] {
  let d = 0;
  return paces.map((pace, i) => {
    if (i > 0) d += (step / pace) * 500;
    return {
      t: i * step,
      d,
      pace,
      spm: i % 3 === 0 ? 26 : 24,
      watts: 2.8 / Math.pow(pace / 500, 3),
      hr: 140 + i,
    };
  });
}

function intervalSplits(): Split[] {
  return [
    { index: 0, distance: 500, time: 110, pace: 110, spm: 28, restTime: 60 },
    { index: 1, distance: 500, time: 116, pace: 116, spm: 27, restTime: 60 },
    { index: 2, distance: 500, time: 108, pace: 108, spm: 29, restTime: 60 },
  ];
}

describe("analyzeWorkoutMoments", () => {
  it("finds sustained, slower, efficient, and finish moments for a single piece", () => {
    const report = analyzeWorkoutMoments(detail());
    expect(report.lowResolution).toBe(false);
    expect(report.moments.map((m) => m.kind)).toContain("best-sustained");
    expect(report.moments.map((m) => m.kind)).toContain("slower-patch");
    expect(report.moments.map((m) => m.kind)).toContain("finish-trend");
  });

  it("does not require heart-rate data", () => {
    const d = detail({
      strokes: strokesFromPaces([120, 118, 116, 114, 112]).map(({ hr: _hr, ...s }) => s),
    });
    const report = analyzeWorkoutMoments(d);
    expect(report.moments.length).toBeGreaterThan(0);
    expect(report.moments.every((m) => m.avgHr == null)).toBe(true);
  });

  it("marks split-derived workouts as low resolution", () => {
    const report = analyzeWorkoutMoments(detail({ hasStrokeData: false }));
    expect(report.lowResolution).toBe(true);
    expect(report.moments.length).toBeGreaterThan(0);
  });

  it("adds fastest and slowest rep moments for interval workouts", () => {
    const report = analyzeWorkoutMoments(
      detail({
        isInterval: true,
        splits: intervalSplits(),
        strokes: strokesFromPaces([110, 110, 116, 116, 108, 108], 55),
      }),
    );
    expect(report.moments.map((m) => m.kind)).toContain("best-rep");
    expect(report.moments.map((m) => m.kind)).toContain("slowest-rep");
  });

  it("excludes rest splits from interval rep moments", () => {
    const report = analyzeWorkoutMoments(
      detail({
        isInterval: true,
        splits: [...intervalSplits(), { index: 3, distance: 0, time: 90, pace: 240, isRest: true }],
        strokes: strokesFromPaces([110, 110, 116, 116, 108, 108], 55),
      }),
    );
    const slowest = report.moments.find((m) => m.kind === "slowest-rep");
    expect(slowest?.avgPace).toBe(116);
  });

  it("accounts for rest splits between work splits when computing seek edges", () => {
    const splits: Split[] = [
      { index: 0, distance: 500, time: 110, pace: 110, spm: 28, restTime: 60 },
      { index: 1, distance: 0, time: 90, pace: 0, isRest: true },
      { index: 2, distance: 500, time: 116, pace: 116, spm: 27, restTime: 60 },
      { index: 3, distance: 500, time: 108, pace: 108, spm: 29, restTime: 0 },
    ];
    const report = analyzeWorkoutMoments(
      detail({
        isInterval: true,
        splits,
        strokes: strokesFromPaces([110, 110, 116, 116, 108, 108], 55),
      }),
    );
    const best = report.moments.find((m) => m.kind === "best-rep");
    expect(best).toBeDefined();
    // Rep 2 (index 2 in workSplits) = pace 108, fastest.
    // Edges built from stroke timestamps using work-only cumulative time:
    //   strokes: t=[0, 55, 110, 165, 220, 275]
    //   edges[0]: t=0→110 (work split 0, cumWorkTime=0)
    //   edges[1]: t=110→220 (work split 2, cumWorkTime=110)
    //   edges[2]: t=275→275 (work split 3, cumWorkTime=226, clamped to last stroke)
    // Seek times use the replay clock (stroke timestamps), not split cumulative time.
    expect(best!.startTime).toBe(275);
    expect(best!.endTime).toBe(275);
  });

  it("returns an empty safe report for insufficient samples", () => {
    const report = analyzeWorkoutMoments(
      detail({ strokes: [strokesFromPaces([120])[0]], splits: [] }),
    );
    expect(report.moments).toEqual([]);
  });
});
