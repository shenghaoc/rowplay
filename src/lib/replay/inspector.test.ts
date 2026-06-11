import { describe, expect, it } from "vite-plus/test";
import { mapStrokes } from "$lib/server/concept2";
import type { Sport } from "$lib/types";
import { ladderStrokes } from "../../../tests/unit/fixtures";
import { asLoggedStroke, distancePerStroke, splitIndexAt } from "./inspector";

type RawStroke = { t: number; d: number; p: number; spm: number; hr?: number };

function roundTrip(raw: RawStroke[], sport: Sport) {
  const normalized = mapStrokes(raw, sport);
  expect(normalized.length).toBe(raw.length);
  for (let i = 0; i < normalized.length; i++) {
    const logged = asLoggedStroke(normalized[i], sport);
    expect(logged.t).toBe(raw[i].t);
    expect(logged.d).toBe(raw[i].d);
    expect(logged.p).toBe(raw[i].p);
    expect(logged.spm).toBe(raw[i].spm);
    if (raw[i].hr != null) expect(logged.hr).toBe(raw[i].hr);
  }
}

describe("asLoggedStroke", () => {
  const raw: RawStroke[] = [
    { t: 0, d: 0, p: 1200, spm: 28 },
    { t: 105, d: 523, p: 1185, spm: 29, hr: 152 },
  ];

  it("round-trips rower strokes through mapStrokes", () => {
    roundTrip(raw, "rower");
  });

  it("round-trips bike per-1000m pace", () => {
    const bikeRaw: RawStroke[] = [{ t: 50, d: 200, p: 2400, spm: 32 }];
    roundTrip(bikeRaw, "bike");
  });

  it("round-trips skierg strokes", () => {
    roundTrip(raw, "skierg");
  });

  it("round-trips interval workouts where t/d reset each rep", () => {
    // The API resets t/d to 0 each interval; mapStrokes makes them cumulative.
    // asLoggedStroke must recover the original per-rep wire values, not the
    // offset cumulative ones.
    const intervalRaw: RawStroke[] = [
      { t: 0, d: 0, p: 1200, spm: 28 },
      { t: 105, d: 523, p: 1185, spm: 29 },
      { t: 0, d: 0, p: 1190, spm: 30 }, // rep 2 — counters reset
      { t: 110, d: 540, p: 1180, spm: 31 },
    ];
    roundTrip(intervalRaw, "rower");
  });
});

describe("distancePerStroke", () => {
  it("returns undefined when pace or spm is invalid", () => {
    expect(distancePerStroke({ ...ladderStrokes()[0], pace: 0 })).toBeUndefined();
    expect(distancePerStroke({ ...ladderStrokes()[0], spm: 0 })).toBeUndefined();
    expect(distancePerStroke({ ...ladderStrokes()[0], pace: NaN })).toBeUndefined();
    expect(distancePerStroke({ ...ladderStrokes()[0], spm: NaN })).toBeUndefined();
  });

  it("matches the analytics formula", () => {
    const s = ladderStrokes()[1];
    const dps = distancePerStroke(s)!;
    expect(dps).toBeCloseTo(30000 / (s.pace * s.spm), 5);
  });
});

describe("splitIndexAt", () => {
  const splits = [
    { index: 0, distance: 500, time: 120, pace: 120 },
    { index: 1, distance: 500, time: 118, pace: 118 },
  ];

  it("returns null when there are no splits", () => {
    expect(splitIndexAt([], 100)).toBeNull();
  });

  it("maps distance into the correct segment", () => {
    expect(splitIndexAt(splits, 0)).toBe(0);
    expect(splitIndexAt(splits, 250)).toBe(0);
    expect(splitIndexAt(splits, 500)).toBe(0);
    expect(splitIndexAt(splits, 501)).toBe(1);
    expect(splitIndexAt(splits, 1000)).toBe(1);
  });
});
