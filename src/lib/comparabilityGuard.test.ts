import { describe, expect, it } from "vite-plus/test";
import { durationBand } from "$lib/analytics";
import {
  areComparable,
  classifyAxis,
  type ComparableContext,
} from "$lib/replay/comparabilityGuard";

function ctx(overrides: Partial<ComparableContext> = {}): ComparableContext {
  return {
    sport: "rower",
    distance: 2000,
    time: 480,
    workoutType: "2000m test",
    ...overrides,
  };
}

describe("areComparable — mandatory cases", () => {
  it("rejects 2k vs 500m rower (same axis, different band)", () => {
    expect(
      areComparable(
        ctx({ distance: 2000, time: 480 }),
        ctx({ distance: 500, time: 120, workoutType: "500m sprint" }),
      ),
    ).toBe(false);
  });

  it("accepts 2k vs 2k rower", () => {
    expect(
      areComparable(
        ctx({ distance: 2000, time: 480 }),
        ctx({ distance: 2005, time: 490, workoutType: "2000m steady" }),
      ),
    ).toBe(true);
  });

  it("accepts 30min vs 30min rower (time axis)", () => {
    expect(
      areComparable(
        ctx({ distance: 7500, time: 1800, workoutType: "JustRow" }),
        ctx({ distance: 7600, time: 1810, workoutType: "JustRow" }),
      ),
    ).toBe(true);
  });

  it("rejects 2k vs 30min rower (distance vs time axis)", () => {
    expect(
      areComparable(
        ctx({ distance: 2000, time: 480, workoutType: "2000m test" }),
        ctx({ distance: 7500, time: 1800, workoutType: "JustRow" }),
      ),
    ).toBe(false);
  });

  it("rejects 2k rower vs 2k skierg", () => {
    expect(
      areComparable(
        ctx({ sport: "rower", distance: 2000, time: 480 }),
        ctx({ sport: "skierg", distance: 2000, time: 500, workoutType: "2000m" }),
      ),
    ).toBe(false);
  });
});

describe("classifyAxis", () => {
  it("classifies JustRow as time", () => {
    expect(classifyAxis("JustRow")).toBe("time");
  });

  it("classifies FixedTimeSplits as time", () => {
    expect(classifyAxis("FixedTimeSplits")).toBe("time");
  });

  it("classifies FixedTimeInterval as time", () => {
    expect(classifyAxis("FixedTimeInterval")).toBe("time");
  });

  it("defaults undefined to distance", () => {
    expect(classifyAxis(undefined)).toBe("distance");
  });

  it("defaults unknown strings to distance", () => {
    expect(classifyAxis("2000m test")).toBe("distance");
  });
});

describe("durationBand", () => {
  it("snaps standard 30 min target", () => {
    expect(durationBand(1800).key).toBe("1800");
    expect(durationBand(1750).key).toBe("1800");
  });

  it("uses coarse fallback for non-standard durations", () => {
    expect(durationBand(600).key).toBe("r360");
  });

  it("handles boundary at range edge", () => {
    expect(durationBand(90).key).toBe("r90");
  });

  it("gives the lowest band a non-zero nominal (midpoint of 0–90s)", () => {
    expect(durationBand(30).key).toBe("r0");
    expect(durationBand(30).nominal).toBe(45);
  });
});
