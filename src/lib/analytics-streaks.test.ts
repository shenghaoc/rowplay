import { describe, expect, it } from "vite-plus/test";
import { trainingStreaks, trainingStreakStats, weeklyConsistency } from "./analytics";
import { workout } from "../../tests/unit/fixtures";

function dayWorkout(id: number, day: string) {
  return workout({ id, date: `${day} 06:00:00` });
}

describe("trainingStreaks", () => {
  it("returns zeros when there are no active days", () => {
    expect(trainingStreaks([], "2026-01-10")).toEqual({ current: 0, longest: 0 });
  });

  it("counts consecutive calendar days including year and leap-day boundaries", () => {
    expect(trainingStreaks(["2025-12-31", "2026-01-01", "2026-01-02"], "2026-01-02")).toEqual({
      current: 3,
      longest: 3,
    });
    expect(trainingStreaks(["2024-02-28", "2024-02-29", "2024-03-01"], "2024-03-01")).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it("keeps the current streak when the athlete trained yesterday but not yet today", () => {
    expect(trainingStreaks(["2026-01-08", "2026-01-09"], "2026-01-10")).toEqual({
      current: 2,
      longest: 2,
    });
  });

  it("resets the current streak after two rest days while preserving longest", () => {
    expect(trainingStreaks(["2026-01-01", "2026-01-02", "2026-01-03"], "2026-01-05")).toEqual({
      current: 0,
      longest: 3,
    });
  });
});

describe("weeklyConsistency", () => {
  it("reports eight empty weeks for no activity", () => {
    expect(weeklyConsistency([], "2026-01-31")).toEqual({ activeWeeks: 0, totalWeeks: 8 });
  });

  it("counts a week as active when any day in that 7-day window has a session", () => {
    const stats = weeklyConsistency(
      [dayWorkout(1, "2026-01-31"), dayWorkout(2, "2026-01-18")],
      "2026-01-31",
    );
    expect(stats.totalWeeks).toBe(8);
    expect(stats.activeWeeks).toBe(2);
  });

  it("ignores sessions after the lookback end day", () => {
    expect(weeklyConsistency([dayWorkout(1, "2026-02-01")], "2026-01-31").activeWeeks).toBe(0);
  });

  it("accepts a precomputed set of active day keys", () => {
    expect(weeklyConsistency(new Set(["2026-01-31"]), "2026-01-31", 1)).toEqual({
      activeWeeks: 1,
      totalWeeks: 1,
    });
  });
});

describe("trainingStreakStats", () => {
  it("reports null daysSinceLastSession when history is empty", () => {
    const stats = trainingStreakStats([], "2026-01-10");
    expect(stats).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      daysSinceLastSession: null,
      weeklyConsistency: { activeWeeks: 0, totalWeeks: 8 },
    });
  });

  it("dedupes multiple sessions on the same calendar day", () => {
    const stats = trainingStreakStats(
      [dayWorkout(1, "2026-01-09"), dayWorkout(2, "2026-01-09"), dayWorkout(3, "2026-01-10")],
      "2026-01-10",
    );
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(2);
    expect(stats.daysSinceLastSession).toBe(0);
  });

  it("counts days since the last session on or before the end day", () => {
    const stats = trainingStreakStats([dayWorkout(1, "2026-01-07")], "2026-01-10");
    expect(stats.currentStreak).toBe(0);
    expect(stats.daysSinceLastSession).toBe(3);
  });
});
