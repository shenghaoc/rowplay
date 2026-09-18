import { describe, expect, it } from "vite-plus/test";
import { detectNewPBs, distancePBs, pbWorkoutIds } from "./analytics";
import { workout } from "../../tests/unit/fixtures";

describe("distancePBs", () => {
  it("returns an empty array for an empty list", () => {
    expect(distancePBs([])).toEqual([]);
  });

  it("identifies the fastest workout at each standard distance", () => {
    const w1 = workout({
      id: 1,
      distance: 2000,
      time: 480,
      pace: 120,
      sport: "rower",
      date: "2026-05-01 06:00:00",
    });
    const w2 = workout({
      id: 2,
      distance: 2000,
      time: 490,
      pace: 122.5,
      sport: "rower",
      date: "2026-04-01 06:00:00",
    });
    const pbs = distancePBs([w1, w2]);
    const pb2k = pbs.find((p) => p.distance === 2000 && p.sport === "rower");
    expect(pb2k).toBeDefined();
    expect(pb2k!.time).toBe(480); // the faster one
  });

  it("picks the faster pace when a shorter piece is inside ±2% tolerance", () => {
    // 1960m is exactly 2% short of 2000m. Its clock is faster, but the pace is
    // slower, so it must not steal the 2k PB — the same rule loadDashboardAggregates
    // already applied on the server.
    const shortSlowerPace = workout({
      id: 1,
      distance: 1960,
      time: 399,
      pace: (399 * 500) / 1960,
      sport: "rower",
      date: "2026-05-01 06:00:00",
    });
    const fullFasterPace = workout({
      id: 2,
      distance: 2000,
      time: 400,
      pace: 100,
      sport: "rower",
      date: "2026-05-02 06:00:00",
    });
    const pbs = distancePBs([shortSlowerPace, fullFasterPace]);
    const pb2k = pbs.find((p) => p.distance === 2000 && p.sport === "rower");
    expect(pb2k).toMatchObject({ time: 400, pace: 100 });
  });

  it("ignores workouts with pace = 0", () => {
    const w = workout({
      id: 1,
      distance: 2000,
      time: 480,
      pace: 0,
      sport: "rower",
      date: "2026-05-01 06:00:00",
    });
    expect(distancePBs([w])).toEqual([]);
  });

  it("returns separate PBs per sport", () => {
    const rower = workout({
      id: 1,
      distance: 2000,
      time: 480,
      sport: "rower",
      date: "2026-05-01 06:00:00",
    });
    const bike = workout({
      id: 2,
      distance: 2000,
      time: 450,
      sport: "bike",
      date: "2026-05-01 06:00:00",
    });
    const pbs = distancePBs([rower, bike]);
    const rowerPb = pbs.find((p) => p.sport === "rower");
    const bikePb = pbs.find((p) => p.sport === "bike");
    expect(rowerPb).toBeDefined();
    expect(bikePb).toBeDefined();
  });

  it("applies ±2% tolerance to distance matching", () => {
    // 2020m is within ±2% of 2000m
    const w = workout({
      id: 1,
      distance: 2020,
      time: 480,
      sport: "rower",
      date: "2026-05-01 06:00:00",
    });
    const pbs = distancePBs([w]);
    expect(pbs.find((p) => p.distance === 2000)).toBeDefined();
  });

  it("ignores workouts with time = 0", () => {
    const w = workout({
      id: 1,
      distance: 2000,
      time: 0,
      sport: "rower",
      date: "2026-05-01 06:00:00",
    });
    expect(distancePBs([w])).toEqual([]);
  });
});

describe("pbWorkoutIds", () => {
  it("tags the faster-paced 2k, not a shorter slower-paced piece", () => {
    const shortSlowerPace = workout({
      id: 1,
      distance: 1960,
      time: 399,
      pace: (399 * 500) / 1960,
    });
    const fullFasterPace = workout({
      id: 2,
      distance: 2000,
      time: 400,
      pace: 100,
    });
    const ids = pbWorkoutIds([shortSlowerPace, fullFasterPace]);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(1)).toBe(false);
  });
});

describe("detectNewPBs", () => {
  const makeDistancePb = (sport: "rower" | "bike", distance: number, time: number) => ({
    sport,
    distance,
    time,
    pace: time / (distance / 500),
    date: "2026-05-01 06:00:00",
  });

  it("returns an empty array when nothing changed", () => {
    const before = [makeDistancePb("rower", 2000, 480)];
    const after = [makeDistancePb("rower", 2000, 480)];
    expect(detectNewPBs(before, after)).toEqual([]);
  });

  it("detects a new (improved) PB", () => {
    const before = [makeDistancePb("rower", 2000, 490)];
    const after = [makeDistancePb("rower", 2000, 480)];
    const newPbs = detectNewPBs(before, after);
    expect(newPbs).toHaveLength(1);
    expect(newPbs[0].time).toBe(480);
  });

  it("detects a brand-new distance that did not exist before", () => {
    const after = [makeDistancePb("rower", 5000, 1200)];
    const before: typeof after = [];
    const newPbs = detectNewPBs(before, after);
    expect(newPbs).toHaveLength(1);
    expect(newPbs[0].distance).toBe(5000);
  });

  it("ignores a time that is the same or slower", () => {
    const before = [makeDistancePb("rower", 2000, 480)];
    // Same time
    expect(detectNewPBs(before, [makeDistancePb("rower", 2000, 480)])).toHaveLength(0);
    // Slower
    expect(detectNewPBs(before, [makeDistancePb("rower", 2000, 490)])).toHaveLength(0);
  });

  it("does not treat a shorter, slower-paced piece as a new 2k PB", () => {
    const before = [makeDistancePb("rower", 2000, 400)];
    const after = [
      makeDistancePb("rower", 2000, 400),
      { ...makeDistancePb("rower", 2000, 399), pace: (399 * 500) / 1960 },
    ];
    expect(detectNewPBs(before, after)).toHaveLength(0);
  });

  it("detects a pace improvement even when clock time is slightly slower", () => {
    const before = [{ ...makeDistancePb("rower", 2000, 399), pace: (399 * 500) / 1960 }];
    const after = [makeDistancePb("rower", 2000, 400)];
    const newPbs = detectNewPBs(before, after);
    expect(newPbs).toHaveLength(1);
    expect(newPbs[0].pace).toBe(100);
  });

  it("treats sport as part of the key (rower 2k ≠ bike 2k)", () => {
    const before = [makeDistancePb("rower", 2000, 480)];
    // Bike 2k appears in after — it's new
    const after = [makeDistancePb("rower", 2000, 480), makeDistancePb("bike", 2000, 450)];
    const newPbs = detectNewPBs(before, after);
    expect(newPbs).toHaveLength(1);
    expect(newPbs[0].sport).toBe("bike");
  });

  it("returns an empty array when both before and after are empty", () => {
    expect(detectNewPBs([], [])).toEqual([]);
  });
});
