import { describe, expect, it } from "vite-plus/test";
import { detectNewPBs, distancePBs } from "./analytics";
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
      sport: "rower",
      date: "2026-05-01 06:00:00",
    });
    const w2 = workout({
      id: 2,
      distance: 2000,
      time: 490,
      sport: "rower",
      date: "2026-04-01 06:00:00",
    });
    const pbs = distancePBs([w1, w2]);
    const pb2k = pbs.find((p) => p.distance === 2000 && p.sport === "rower");
    expect(pb2k).toBeDefined();
    expect(pb2k!.time).toBe(480); // the faster one
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
