import { describe, expect, it } from "vite-plus/test";
import {
  buildDistribution,
  buildZoneConfig,
  classifyPace,
  medianTrainingPace,
  slicePercent,
  slicePercentDistance,
  workoutsInPeriod,
  ZONES_5,
  type ZoneSlice,
} from "./trainingZones";
import { parseInstantMillis } from "./datetime";
import { intervalSplits, normalizedIntervalStrokes, workout } from "../../tests/unit/fixtures";
import type { WorkoutForDistribution } from "./trainingZones";

const BASE = 120; // 2:00 / 500m

describe("classifyPace — 5-zone", () => {
  const config = { basePace: BASE } as const;

  it("classifies boundary paces at each threshold", () => {
    expect(classifyPace(BASE * 1.2 + 0.01, config)).toBe("UT2");
    expect(classifyPace(BASE * 1.2, config)).toBe("UT1");
    expect(classifyPace(BASE * 1.1 + 0.01, config)).toBe("UT1");
    expect(classifyPace(BASE * 1.1, config)).toBe("AT");
    expect(classifyPace(BASE * 1.02 + 0.01, config)).toBe("AT");
    expect(classifyPace(BASE * 1.02, config)).toBe("TR");
    expect(classifyPace(BASE * 0.97 + 0.01, config)).toBe("TR");
    expect(classifyPace(BASE * 0.97, config)).toBe("AN");
    expect(classifyPace(BASE * 0.5, config)).toBe("AN");
  });

  it("does not treat a non-positive pace as anaerobic", () => {
    expect(classifyPace(0, config)).toBe("UT2");
    expect(classifyPace(-1, config)).toBe("UT2");
  });
});

describe("classifyPace — 3-zone fallback", () => {
  const config = { basePace: null, medianPace: 130 } as const;

  it("uses median boundaries when no 2k PB", () => {
    expect(classifyPace(130 * 1.1 + 1, config)).toBe("Easy");
    expect(classifyPace(130 * 1.1, config)).toBe("Moderate");
    expect(classifyPace(130 * 0.95 + 1, config)).toBe("Moderate");
    expect(classifyPace(130 * 0.95, config)).toBe("Hard");
  });

  it("buckets a non-positive pace as easy", () => {
    expect(classifyPace(0, config)).toBe("Easy");
    expect(classifyPace(-5, config)).toBe("Easy");
  });
});

describe("classifyPace — multi-sport", () => {
  const config = {
    basePace: BASE,
    medianPace: 140,
    sportMedians: { rower: 130, skierg: 150, bike: 160 },
  } as const;

  it("uses 5-zone for rower and 3-zone for skierg under mixed config", () => {
    expect(classifyPace(BASE * 0.9, config, "rower")).toBe("AN");
    expect(classifyPace(150 * 0.9, config, "skierg")).toBe("Hard");
    expect(classifyPace(150 * 1.2, config, "skierg")).toBe("Easy");
  });
});

describe("buildDistribution", () => {
  it("attributes summary-level workouts by duration", () => {
    const config = { basePace: BASE };
    const ws: WorkoutForDistribution[] = [
      workout({ id: 1, time: 600, distance: 2500, pace: BASE * 1.25 }),
      workout({ id: 2, time: 400, distance: 1800, pace: BASE * 1.05 }),
    ];
    const dist = buildDistribution(ws, config);
    expect(dist.totalSeconds).toBe(1000);
    expect(dist.totalMeters).toBe(4300);
    expect(dist.slices.length).toBe(ZONES_5.length);
  });

  it("uses stroke data when present", () => {
    const config = { basePace: BASE };
    const ws: WorkoutForDistribution[] = [
      {
        ...workout({ id: 1, time: 20, distance: 100, pace: BASE }),
        strokes: normalizedIntervalStrokes(),
      },
    ];
    const dist = buildDistribution(ws, config);
    expect(dist.totalSeconds).toBeGreaterThan(0);
  });

  it("uses splits when no strokes", () => {
    const config = { basePace: BASE };
    const ws: WorkoutForDistribution[] = [
      {
        ...workout({ id: 1, time: 20, distance: 100, pace: BASE }),
        splits: intervalSplits,
      },
    ];
    const dist = buildDistribution(ws, config);
    expect(dist.totalSeconds).toBe(20);
    expect(dist.totalMeters).toBe(100);
  });

  it("returns zero totals for an empty workout list", () => {
    const config = { basePace: BASE };
    const dist = buildDistribution([], config);
    expect(dist.totalSeconds).toBe(0);
    expect(dist.slices.every((s) => s.seconds === 0)).toBe(true);
  });

  it("excludes rest splits and zero-time work from the zone totals", () => {
    const config = { basePace: BASE };
    const dist = buildDistribution(
      [
        {
          ...workout({ id: 1, time: 210, distance: 500, pace: BASE * 0.9 }),
          splits: [
            { index: 0, distance: 500, time: 120, pace: BASE * 0.9 },
            { index: 1, distance: 0, time: 90, pace: 300, isRest: true },
            { index: 2, distance: 100, time: 0, pace: BASE },
          ],
        },
      ],
      config,
    );
    expect(dist.totalSeconds).toBe(120);
    expect(dist.totalMeters).toBe(500);
    expect(dist.slices.find((slice) => slice.zone === "AN")?.seconds).toBe(120);
    expect(dist.slices.find((slice) => slice.zone === "UT2")?.seconds).toBe(0);
  });

  it("ignores a summary row with no elapsed time", () => {
    const config = { basePace: BASE };
    const dist = buildDistribution(
      [workout({ id: 1, time: 0, distance: 5000, pace: BASE * 0.5 })],
      config,
    );
    expect(dist.totalSeconds).toBe(0);
    expect(dist.totalMeters).toBe(0);
  });
});

describe("slicePercent", () => {
  const slice: ZoneSlice = { zone: "UT2", seconds: 30, meters: 25 };

  it("returns 0 when the total is not positive", () => {
    expect(slicePercent(slice, 0)).toBe(0);
    expect(slicePercent(slice, -10)).toBe(0);
    expect(slicePercentDistance(slice, 0)).toBe(0);
    expect(slicePercentDistance(slice, -1)).toBe(0);
  });

  it("returns the slice share of the total", () => {
    expect(slicePercent(slice, 120)).toBe(25);
    expect(slicePercentDistance(slice, 100)).toBe(25);
  });
});

describe("buildZoneConfig", () => {
  it("prefers 5-zone when a rower 2k PB exists", () => {
    const ws = [
      workout({ id: 1, distance: 2000, time: 480, pace: 120, sport: "rower" }),
      workout({ id: 2, distance: 5000, time: 1200, pace: 130, sport: "rower" }),
    ];
    const cfg = buildZoneConfig(ws, parseInstantMillis("2026-06-01T00:00:00Z"));
    expect(cfg.basePace).toBe(120);
  });

  it("uses 5-zone when 2k PB is older than the reference window", () => {
    const ws = [
      workout({
        id: 1,
        distance: 2000,
        time: 480,
        pace: 120,
        sport: "rower",
        date: "2023-01-01 06:00:00",
      }),
      workout({
        id: 2,
        distance: 5000,
        time: 1250,
        pace: 130,
        sport: "rower",
        date: "2026-05-01 06:00:00",
      }),
    ];
    const cfg = buildZoneConfig(ws, parseInstantMillis("2026-06-01T00:00:00Z"));
    expect(cfg.basePace).toBe(120);
  });

  it("falls back to 3-zone without a 2k piece", () => {
    const ws = [workout({ id: 1, distance: 5000, time: 1200, pace: 130 })];
    const cfg = buildZoneConfig(ws, parseInstantMillis("2026-06-01T00:00:00Z"));
    expect(cfg.basePace).toBeNull();
    expect(cfg.medianPace).toBe(130);
  });

  it("ignores pieces older than the 365-day reference window when choosing the median", () => {
    const ws = [
      workout({ id: 1, distance: 5000, time: 1200, pace: 130, date: "2026-05-01 06:00:00" }),
      workout({ id: 2, distance: 5000, time: 2000, pace: 200, date: "2024-01-01 06:00:00" }),
    ];
    const cfg = buildZoneConfig(ws, parseInstantMillis("2026-06-01T00:00:00Z"));
    expect(cfg.basePace).toBeNull();
    expect(cfg.medianPace).toBe(130);
  });
});

describe("medianTrainingPace", () => {
  it("returns the median of workout paces", () => {
    const ws = [
      workout({ id: 1, pace: 100 }),
      workout({ id: 2, pace: 120 }),
      workout({ id: 3, pace: 140 }),
    ];
    expect(medianTrainingPace(ws)).toBe(120);
  });

  it("averages the two middle paces and ignores non-positive pace or distance", () => {
    const ws = [
      workout({ id: 1, pace: 100, distance: 2000, sport: "rower" }),
      workout({ id: 2, pace: 200, distance: 2000, sport: "rower" }),
      workout({ id: 3, pace: 0, distance: 2000, sport: "rower" }),
      workout({ id: 4, pace: 999, distance: 0, sport: "rower" }),
      workout({ id: 5, pace: 80, distance: 2000, sport: "skierg" }),
    ];
    expect(medianTrainingPace(ws, "rower")).toBe(150);
  });
});

describe("workoutsInPeriod", () => {
  const now = parseInstantMillis("2026-06-04T12:00:00Z");

  it("includes recent workouts only", () => {
    const recent = workout({ id: 1, date: "2026-06-01 06:00:00" });
    const old = workout({ id: 2, date: "2025-01-01 06:00:00" });
    const in4w = workoutsInPeriod([recent, old], "4w", now);
    expect(in4w.map((w) => w.id)).toEqual([1]);
  });

  it("includes the cutoff instant and drops unparseable dates", () => {
    const cutoff = now - 28 * 86_400_000;
    const onCutoff = workout({ id: 1, date: logbookFromEpoch(cutoff) });
    const before = workout({ id: 2, date: logbookFromEpoch(cutoff - 1000) });
    const invalid = workout({ id: 3, date: "not-a-date" });
    expect(workoutsInPeriod([onCutoff, before, invalid], "4w", now).map((w) => w.id)).toEqual([1]);
  });

  it("uses the 91-day and 365-day windows for 3m and 12m", () => {
    const april = workout({ id: 1, date: "2026-04-01 00:00:00" });
    const january = workout({ id: 2, date: "2026-01-01 00:00:00" });
    const twoYears = workout({ id: 3, date: "2024-06-01 00:00:00" });
    expect(workoutsInPeriod([april, january, twoYears], "3m", now).map((w) => w.id)).toEqual([1]);
    expect(workoutsInPeriod([april, january, twoYears], "12m", now).map((w) => w.id)).toEqual([
      1, 2,
    ]);
  });
});

function logbookFromEpoch(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
