import { describe, expect, it } from "vite-plus/test";
import { computeDpsTrend, movingAverage } from "./dpsTrend";
import { workout } from "../../tests/unit/fixtures";

describe("computeDpsTrend", () => {
  it("computes raw DPS from distance and stroke count", () => {
    const points = computeDpsTrend([
      workout({ id: 1, distance: 10_000, strokeCount: 500, pace: 120 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]!.rawDps).toBe(20);
  });

  it("keeps normDps equal to rawDps when pace matches reference pace", () => {
    const points = computeDpsTrend([
      workout({ id: 1, date: "2026-05-01 06:00:00", distance: 2000, strokeCount: 100, pace: 120 }),
      workout({ id: 2, date: "2026-05-02 06:00:00", distance: 2000, strokeCount: 100, pace: 130 }),
      workout({ id: 3, date: "2026-05-03 06:00:00", distance: 2000, strokeCount: 100, pace: 140 }),
    ]);
    const mid = points.find((p) => p.workoutId === 2)!;
    expect(mid.rawDps).toBe(20);
    expect(mid.normDps).toBeCloseTo(mid.rawDps, 5);
  });

  it("excludes workouts without stroke count", () => {
    const points = computeDpsTrend([
      workout({ id: 1, strokeCount: 500 }),
      workout({ id: 2, strokeCount: undefined }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]!.workoutId).toBe(1);
  });

  it("excludes workouts with non-positive pace", () => {
    const points = computeDpsTrend([workout({ id: 1, strokeCount: 500, pace: 0 })]);
    expect(points).toHaveLength(0);
  });

  it("returns empty output for empty input", () => {
    expect(computeDpsTrend([])).toEqual([]);
  });

  it("filters by sport when provided", () => {
    const points = computeDpsTrend(
      [
        workout({ id: 1, sport: "rower", strokeCount: 500 }),
        workout({ id: 2, sport: "bike", strokeCount: 500 }),
      ],
      "rower",
    );
    expect(points).toHaveLength(1);
    expect(points[0]!.sport).toBe("rower");
  });
});

describe("movingAverage", () => {
  it("returns empty output for empty input", () => {
    expect(movingAverage([], "rawDps", 3)).toEqual([]);
  });

  it("computes a centred mean for the middle point", () => {
    const points = computeDpsTrend([
      workout({ id: 1, date: "2026-05-01 06:00:00", distance: 1000, strokeCount: 100, pace: 120 }),
      workout({ id: 2, date: "2026-05-02 06:00:00", distance: 2000, strokeCount: 100, pace: 120 }),
      workout({ id: 3, date: "2026-05-03 06:00:00", distance: 3000, strokeCount: 100, pace: 120 }),
      workout({ id: 4, date: "2026-05-04 06:00:00", distance: 4000, strokeCount: 100, pace: 120 }),
      workout({ id: 5, date: "2026-05-05 06:00:00", distance: 5000, strokeCount: 100, pace: 120 }),
    ]);
    const ma = movingAverage(points, "rawDps", 3);
    expect(ma[2]!.value).toBeCloseTo(30, 5);
  });
});
