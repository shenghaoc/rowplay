import { describe, expect, it } from "vite-plus/test";
import { trainingStreakStats } from "./analytics";
import {
  computeMilestones,
  nextMilestones,
  newlyAchievedMilestones,
  showMilestonesPanel,
} from "./milestones";
import type { Sport, Workout } from "./types";

function w(
  id: number,
  date: string,
  distance: number,
  sport: Sport = "rower",
  time = 600,
): Workout {
  return {
    id,
    date,
    sport,
    distance,
    time,
    pace: distance > 0 ? (time / distance) * 500 : 0,
    hasStrokeData: false,
  };
}

describe("computeMilestones — lifetime distance", () => {
  it("achieves at exact threshold and not one metre below", () => {
    const at = [w(1, "2026-01-01 06:00:00", 100_000)];
    const achieved = computeMilestones(at, []).find((m) => m.id === "lifetime_distance_rower_100k");
    expect(achieved?.achieved).toBe(true);
    expect(achieved?.progress).toBe(1);

    const below = [w(1, "2026-01-01 06:00:00", 99_999)];
    const notYet = computeMilestones(below, []).find(
      (m) => m.id === "lifetime_distance_rower_100k",
    );
    expect(notYet?.achieved).toBe(false);
    expect(notYet?.progress).toBeCloseTo(99_999 / 100_000);
  });
});

describe("computeMilestones — session count", () => {
  it("marks session_count_10 when ten workouts exist", () => {
    const workouts = Array.from({ length: 10 }, (_, i) =>
      w(i + 1, `2026-01-${String(i + 1).padStart(2, "0")} 06:00:00`, 2000),
    );
    const m = computeMilestones(workouts, []).find((x) => x.id === "session_count_10");
    expect(m?.achieved).toBe(true);
    expect(m?.achievedAt).toBe("2026-01-10");
  });

  it("does not achieve at nine sessions", () => {
    const workouts = Array.from({ length: 9 }, (_, i) =>
      w(i + 1, `2026-01-${String(i + 1).padStart(2, "0")} 06:00:00`, 2000),
    );
    const m = computeMilestones(workouts, []).find((x) => x.id === "session_count_10");
    expect(m?.achieved).toBe(false);
    expect(m?.progress).toBeCloseTo(0.9);
  });
});

describe("computeMilestones — streak", () => {
  it("counts a single workout as a one-day streak", () => {
    const m = computeMilestones([w(1, "2026-01-05 06:00:00", 2000)], [], { endDay: "2026-01-05" });
    expect(m.find((x) => x.id === "streak_7d")?.currentValue).toBe(1);
  });

  it("does not reset across consecutive calendar days", () => {
    const workouts = [
      w(1, "2026-01-01 06:00:00", 2000),
      w(2, "2026-01-02 06:00:00", 2000),
      w(3, "2026-01-03 06:00:00", 2000),
    ];
    const m = computeMilestones(workouts, [], { endDay: "2026-01-03" }).find(
      (x) => x.id === "streak_7d",
    );
    expect(m?.currentValue).toBe(3);
  });

  it("resets after a skipped calendar day", () => {
    const workouts = [
      w(1, "2026-01-01 06:00:00", 2000),
      w(2, "2026-01-02 06:00:00", 2000),
      w(3, "2026-01-04 06:00:00", 2000),
    ];
    const m = computeMilestones(workouts, [], { endDay: "2026-01-04" }).find(
      (x) => x.id === "streak_7d",
    );
    expect(m?.currentValue).toBe(1);
  });

  it("achieves streak_7d after seven consecutive days", () => {
    const workouts = Array.from({ length: 7 }, (_, i) =>
      w(i + 1, `2026-01-${String(i + 1).padStart(2, "0")} 06:00:00`, 2000),
    );
    expect(trainingStreakStats(workouts, "2026-01-07").longestStreak).toBe(7);
    const m = computeMilestones(workouts, [], { endDay: "2026-01-07" }).find(
      (x) => x.id === "streak_7d",
    );
    expect(m?.achieved).toBe(true);
    expect(m?.currentValue).toBe(7);
    expect(m?.achievedAt).toBe("2026-01-07");
  });
});

describe("computeMilestones — 2k speed gates", () => {
  it("requires strictly faster than 7:00 for sub-7", () => {
    const atSeven = computeMilestones(
      [],
      [{ distance: 2000, sport: "rower", time: 7 * 60, date: "2026-01-01 06:00:00" }],
    ).find((m) => m.id === "pb_2k_sub7");
    expect(atSeven?.achieved).toBe(false);

    const faster = computeMilestones(
      [],
      [{ distance: 2000, sport: "rower", time: 7 * 60 - 0.1, date: "2026-01-01 06:00:00" }],
    ).find((m) => m.id === "pb_2k_sub7");
    expect(faster?.achieved).toBe(true);
  });
});

describe("nextMilestones", () => {
  it("returns highest-progress unachieved milestones first", () => {
    const all = computeMilestones(
      [
        w(1, "2026-01-01 06:00:00", 90_000),
        w(2, "2026-01-02 06:00:00", 2000),
        w(3, "2026-01-03 06:00:00", 2000),
      ],
      [],
    );
    const next = nextMilestones(all, 1)[0];
    expect(next.achieved).toBe(false);
    expect(next.progress).toBeGreaterThan(0.8);
  });
});

describe("newlyAchievedMilestones", () => {
  it("detects milestones that flipped to achieved", () => {
    const before = computeMilestones([w(1, "2026-01-01 06:00:00", 5000)], []);
    const after = computeMilestones(
      [
        w(1, "2026-01-01 06:00:00", 5000),
        ...Array.from({ length: 9 }, (_, i) =>
          w(i + 2, `2026-01-${String(i + 2).padStart(2, "0")} 06:00:00`, 2000),
        ),
      ],
      [],
    );
    const fresh = newlyAchievedMilestones(before, after);
    expect(fresh.some((m) => m.id === "session_count_10")).toBe(true);
  });
});

describe("showMilestonesPanel", () => {
  it("hides when no achievements and fewer than three workouts", () => {
    const milestones = computeMilestones([w(1, "2026-01-01 06:00:00", 500)], []);
    expect(showMilestonesPanel([w(1, "2026-01-01 06:00:00", 500)], milestones)).toBe(false);
  });

  it("shows with three workouts even if none achieved yet", () => {
    const workouts = [
      w(1, "2026-01-01 06:00:00", 500),
      w(2, "2026-01-02 06:00:00", 500),
      w(3, "2026-01-03 06:00:00", 500),
    ];
    const milestones = computeMilestones(workouts, []);
    expect(showMilestonesPanel(workouts, milestones)).toBe(true);
  });
});
