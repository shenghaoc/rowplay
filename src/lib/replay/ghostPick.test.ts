import { describe, expect, it } from "vite-plus/test";
import { pickDefaultGhostCandidate } from "./ghostPick";
import type { Workout } from "$lib/types";

function w(
  id: number,
  distance: number,
  pace: number,
  date: string,
  overrides: Partial<Workout> = {},
): Workout {
  return {
    id,
    date,
    sport: "rower",
    distance,
    time: 600,
    pace,
    hasStrokeData: true,
    workoutType: "2000m test",
    ...overrides,
  };
}

describe("pickDefaultGhostCandidate", () => {
  it("prefers same distance band and closest metres", () => {
    const current = { id: 1, distance: 2000, sport: "rower" as const, time: 480 };
    const candidates = [
      w(2, 5000, 110, "2026-01-01"),
      w(3, 2010, 115, "2026-02-01"),
      w(4, 10000, 120, "2026-03-01"),
    ];
    expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
  });

  it("excludes the current workout id", () => {
    const current = { id: 2, distance: 2000, sport: "rower" as const, time: 480 };
    const candidates = [w(2, 2000, 110, "2026-01-01"), w(3, 2005, 112, "2026-02-01")];
    expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
  });

  it("returns null when no candidate is comparable", () => {
    const current = { id: 1, distance: 2000, sport: "rower" as const, time: 480 };
    const candidates = [w(2, 5000, 110, "2026-01-01"), w(3, 10000, 120, "2026-03-01")];
    expect(pickDefaultGhostCandidate(candidates, current)).toBeNull();
  });

  it("rejects fixed-time candidates for a fixed-distance current piece", () => {
    const current = {
      id: 1,
      distance: 2000,
      sport: "rower" as const,
      time: 480,
      workoutType: "2000m test",
    };
    const candidates = [
      w(2, 7500, 118, "2026-01-01", { time: 1800, workoutType: "JustRow" }),
      w(3, 2010, 115, "2026-02-01"),
    ];
    expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
  });

  it("picks time-closest candidate for time-axis current piece", () => {
    const current = {
      id: 1,
      distance: 7500,
      sport: "rower" as const,
      time: 1800,
      workoutType: "JustRow",
    };
    const candidates = [
      w(2, 7200, 120, "2026-01-01", { time: 1760, workoutType: "JustRow" }),
      w(3, 8000, 118, "2026-02-01", { time: 1900, workoutType: "JustRow" }),
      w(4, 7800, 115, "2026-03-01", { time: 1850, workoutType: "JustRow" }),
    ];
    // Candidate 2 is closest in time (|1800-1760|=40 vs |1800-1900|=100 vs |1800-1850|=50)
    expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(2);
  });

  it("breaks an equidistant tie by fastest pace, not most recent", () => {
    const current = { id: 1, distance: 2000, sport: "rower" as const, time: 480 };
    const candidates = [w(2, 1950, 120, "2026-05-01"), w(3, 2050, 110, "2026-01-01")];
    expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
  });

  it("breaks a distance+pace tie by most recent date", () => {
    const current = { id: 1, distance: 2000, sport: "rower" as const, time: 480 };
    const candidates = [w(2, 1950, 115, "2026-01-01"), w(3, 2050, 115, "2026-05-01")];
    expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
  });
});
