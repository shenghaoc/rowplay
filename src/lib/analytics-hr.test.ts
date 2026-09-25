import { describe, expect, it } from "vite-plus/test";
import { hrRecoveryTrend, hrZoneOf, hrZones } from "./analytics";
import type { Stroke, WorkoutDetail } from "./types";

function stroke(t: number, hr?: number): Stroke {
  return { t, d: t * 4, pace: 120, spm: 28, watts: 180, hr };
}

function detail(
  overrides: Partial<WorkoutDetail> & Pick<WorkoutDetail, "id" | "date">,
): WorkoutDetail {
  return {
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: false,
    strokes: [],
    splits: [],
    isInterval: false,
    ...overrides,
  };
}

describe("hrZoneOf", () => {
  const hrMax = 200;

  it("places rates on the Karvonen boundaries and rejects non-positive inputs", () => {
    expect(hrZoneOf(0, hrMax)).toBe(0);
    expect(hrZoneOf(-5, hrMax)).toBe(0);
    expect(hrZoneOf(150, 0)).toBe(0);
    expect(hrZoneOf(150, Number.NaN)).toBe(0);
    expect(hrZoneOf(119, hrMax)).toBe(0);
    expect(hrZoneOf(120, hrMax)).toBe(1);
    expect(hrZoneOf(139, hrMax)).toBe(1);
    expect(hrZoneOf(140, hrMax)).toBe(2);
    expect(hrZoneOf(199, hrMax)).toBe(4);
    expect(hrZoneOf(240, hrMax)).toBe(5);
  });
});

describe("hrZones", () => {
  it("returns five empty zones when there are no strokes", () => {
    const zones = hrZones([]);
    expect(zones.map((zone) => zone.zone)).toEqual([1, 2, 3, 4, 5]);
    expect(zones.every((zone) => zone.seconds === 0 && zone.fraction === 0)).toBe(true);
  });

  it("counts time in the low and top bands and ignores missing HR and backwards gaps", () => {
    const zones = hrZones(
      [stroke(0, 100), stroke(10, 100), stroke(20, 250), stroke(15, 180), stroke(30)],
      200,
    );
    expect(zones.find((zone) => zone.zone === 1)!.seconds).toBe(10);
    expect(zones.find((zone) => zone.zone === 5)!.seconds).toBe(10);
    expect(
      zones
        .filter((zone) => zone.zone !== 1 && zone.zone !== 5)
        .every((zone) => zone.seconds === 0),
    ).toBe(true);
    const total = zones.reduce((sum, zone) => sum + zone.fraction, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe("hrRecoveryTrend", () => {
  it("sorts by date and omits sessions with no ending or recovery HR", () => {
    const trend = hrRecoveryTrend([
      detail({ id: 2, date: "2026-02-01 06:00:00", heartRate: { ending: 160 } }),
      detail({ id: 1, date: "2026-01-01 06:00:00", heartRate: { ending: 150, recovery: 120 } }),
      detail({ id: 3, date: "2026-03-01 06:00:00" }),
    ]);
    expect(trend.map((point) => point.id)).toEqual([1, 2]);
    expect(trend[0].drop).toBe(30);
    expect(trend[1].drop).toBeUndefined();
    expect(trend[1].ending).toBe(160);
    expect(trend[1].recovery).toBeUndefined();
  });
});
