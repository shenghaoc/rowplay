import { describe, expect, it } from "vite-plus/test";
import {
  aggregateDailyVolume,
  annualGoalProgress,
  buildTrainingCalendar,
  distanceBand,
  distancePBs,
  distancePerStroke,
  efficiencyDrift,
  efficiencyByRate,
  estimateCriticalPower,
  estimateHrMax,
  hrZones,
  intervalBreakdown,
  linearTrend,
  powerCurve,
  summariseBySport,
  techniqueSummary,
  trainingLoad,
  volumeIntensityLevel,
  workoutDayKey,
  workoutWatts,
  dayVolumeValue,
  hrRecoveryTrend,
  hrZoneOf,
  workRestEfficiency,
  targetVsActual,
  workoutSideStats,
  athleteBadges,
  buildDistanceOverlay,
  compareIntervalReps,
  compareVerdict,
  hasEverySportWeek,
  powerAtDuration,
  powerDurationComparison,
  predictPaceForDuration,
  predictTimeForDistance,
  sampleStrokeAtDistance,
  weeklyConsistency,
  type CriticalPower,
} from "./analytics";
import { mockWorkoutDetail, mockWorkouts } from "./mockData";
import {
  intervalSplits,
  ladderStrokes,
  normalizedIntervalStrokes,
  normalizeRawStrokes,
  stroke,
  twoRepSplits,
  workout,
} from "../../tests/unit/fixtures";
import { parseInstantMillis } from "./datetime";
import { wattsToPaceForSport } from "./format";
import type { WorkoutDetail } from "./types";

const workouts = mockWorkouts();

describe("linearTrend", () => {
  it("returns null with fewer than two points", () => {
    expect(linearTrend([])).toBeNull();
    expect(linearTrend([{ x: 0, y: 1 }])).toBeNull();
  });

  it("fits a downward pace trend for improving 2k pieces", () => {
    const twoKs = workouts
      .filter((w) => w.sport === "rower" && Math.abs(w.distance - 2000) < 50)
      .sort((a, b) => a.date.localeCompare(b.date));
    const points = twoKs.map((w) => ({
      x: parseInstantMillis(`${w.date.replace(" ", "T")}Z`),
      y: w.pace,
    }));
    const fit = linearTrend(points);
    expect(fit).not.toBeNull();
    expect(fit!.n).toBeGreaterThanOrEqual(2);
    expect(fit!.delta).toBeLessThan(0);
  });

  it("uses the largest x value for the trend endpoint even when points are unsorted", () => {
    const day = 86_400_000;
    const fit = linearTrend([
      { x: 2 * day, y: 140 },
      { x: 0, y: 120 },
      { x: 1 * day, y: 130 },
    ]);

    expect(fit).not.toBeNull();
    expect(fit!.y0).toBeCloseTo(120);
    expect(fit!.y1).toBeCloseTo(140);
    expect(fit!.delta).toBeCloseTo(20);
  });
});

describe("distanceBand", () => {
  it("buckets standard erg distances", () => {
    expect(distanceBand(2000).key).toBe("2000");
    expect(distanceBand(2003).key).toBe("2000");
  });

  it("uses coarse bands for odd distances", () => {
    expect(distanceBand(3500).label).toBe("3k–7k");
  });

  it("gives the lowest fallback band the band midpoint, not 0", () => {
    expect(distanceBand(0).nominal).toBe(375);
    expect(distanceBand(200).nominal).toBe(375);
    expect(distanceBand(749).nominal).toBe(375);
  });

  it("sorts the lowest band between the 100m and 500m standard bands", () => {
    expect(distanceBand(100).nominal).toBeLessThan(distanceBand(700).nominal);
    expect(distanceBand(700).nominal).toBeLessThan(distanceBand(500).nominal);
  });

  it("caps wide fallback bands' nominals at twice the lower bound", () => {
    expect(distanceBand(3500).nominal).toBe(4500);
  });
});

describe("summariseBySport", () => {
  it("aggregates mock history by sport", () => {
    const rows = summariseBySport(workouts);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const rower = rows.find((r) => r.sport === "rower");
    expect(rower!.sessions).toBeGreaterThan(0);
    expect(rower!.distance).toBeGreaterThan(0);
    expect(rower!.avgPace).toBeGreaterThan(0);
  });

  it("preserves the Infinity sentinel when a sport has no positive pace", () => {
    const rows = summariseBySport([
      workout({ id: 1, sport: "rower", distance: 2000, time: 500, pace: 0 }),
      workout({ id: 2, sport: "rower", distance: 1000, time: 260, pace: -1 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].sessions).toBe(2);
    expect(rows[0].bestPace).toBe(Infinity);
    expect(rows[0].avgPace).toBeCloseTo(760 / 6);
  });
});

describe("distancePBs", () => {
  it("finds fastest standard distances within tolerance", () => {
    const pbs = distancePBs(workouts);
    const twoK = pbs.find((p) => p.distance === 2000);
    expect(twoK).toBeDefined();
    expect(twoK!.time).toBeGreaterThan(0);
    expect(twoK!.pace).toBeGreaterThan(0);
  });
});

describe("hrZones", () => {
  it("distributes time across five zones", () => {
    const detail = mockWorkoutDetail(1001)!;
    const zones = hrZones(detail.strokes);
    expect(zones).toHaveLength(5);
    const total = zones.reduce((s, z) => s + z.fraction, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(zones.every((z) => z.seconds >= 0)).toBe(true);
  });
});

describe("estimateHrMax", () => {
  it("uses a positive explicit max HR override", () => {
    expect(estimateHrMax([{ ...stroke(0, 28), hr: 140 }], 188)).toBe(188);
  });

  it("falls back to the 160 bpm floor when strokes have no positive HR", () => {
    expect(estimateHrMax([{ ...stroke(0, 28), hr: 0 }, { ...stroke(10, 28) }])).toBe(160);
  });

  it("infers max HR from the observed peak when it exceeds the floor", () => {
    expect(estimateHrMax([{ ...stroke(0, 28), hr: 190 }])).toBeCloseTo(200);
  });
});

function driftStrokes(
  n: number,
  paceAt: (i: number) => number,
  opts?: { spm?: number; stepD?: number; stepT?: number },
): { t: number; d: number; pace: number; spm: number; watts: number }[] {
  const spm = opts?.spm ?? 20;
  const stepD = opts?.stepD ?? 50;
  const stepT = opts?.stepT ?? 10;
  return Array.from({ length: n }, (_, i) => ({
    t: i * stepT,
    d: i * stepD,
    pace: paceAt(i),
    spm,
    watts: 100,
  }));
}

describe("efficiencyDrift", () => {
  it("returns flat fade for steady pace and rate", () => {
    const strokes = driftStrokes(10, () => 120);
    const r = efficiencyDrift(strokes);
    expect(r.series).toHaveLength(10);
    expect(Math.abs(r.fadeDelta)).toBeLessThan(0.01);
    expect(Math.abs(r.fadePercent)).toBeLessThan(0.1);
  });

  it("detects fading when pace slows", () => {
    const strokes = driftStrokes(20, (i) => 120 + i * 2);
    const r = efficiencyDrift(strokes);
    expect(r.fadeDelta).toBeLessThan(0);
    expect(r.fadePercent).toBeLessThan(0);
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i]!.dps).toBeLessThanOrEqual(r.series[i - 1]!.dps + 1e-9);
    }
  });

  it("returns empty when fewer than five valid strokes", () => {
    const strokes = driftStrokes(3, () => 120);
    const r = efficiencyDrift(strokes);
    expect(r.series).toHaveLength(0);
    expect(r.baseline).toBe(0);
  });

  it("omits invalid strokes from the series", () => {
    const strokes = driftStrokes(10, (i) => (i === 2 || i === 5 || i === 8 ? 0 : 120));
    const r = efficiencyDrift(strokes);
    expect(r.series).toHaveLength(7);
  });

  it("uses a 10% opening threshold on short pieces", () => {
    const strokes = driftStrokes(8, () => 120, { stepD: 50 });
    const r = efficiencyDrift(strokes);
    expect(r.baseline).toBeGreaterThan(0);
    expect(r.series).toHaveLength(8);
  });

  it("baselines from the first valid stroke when leading strokes are invalid", () => {
    const strokes = [
      { t: 0, d: 0, pace: 0, spm: 20, watts: 100 },
      { t: 10, d: 50, pace: 0, spm: 20, watts: 100 },
      ...driftStrokes(10, () => 120, { stepD: 50, stepT: 10 }).map((s, i) => ({
        ...s,
        t: 20 + i * 10,
        d: 100 + i * 50,
      })),
    ];
    const r = efficiencyDrift(strokes);
    expect(r.series).toHaveLength(10);
    expect(r.baselineEndD).toBeGreaterThanOrEqual(100);
  });

  it("spans 500 m from the first valid stroke on a long piece, not the min-5 floor", () => {
    // Two leading invalid strokes, then the first valid stroke at d=600 m on a
    // ~6000 m piece (so the 500 m threshold applies). With an absolute-distance
    // check the opening would collapse to 5 strokes (d already > 500); measuring
    // span from the first valid stroke keeps the full ~500 m opening window.
    const lead = [
      { t: 0, d: 0, pace: 0, spm: 20, watts: 100 },
      { t: 10, d: 300, pace: 0, spm: 20, watts: 100 },
    ];
    const valid = Array.from({ length: 180 }, (_, i) => ({
      t: 20 + i * 10,
      d: 600 + i * 30,
      pace: 120,
      spm: 20,
      watts: 100,
    }));
    const r = efficiencyDrift([...lead, ...valid]);
    // First valid stroke at d=600 → opening closes ~500 m later (~d=1100),
    // well past the d=720 the min-5 floor alone would give.
    expect(r.baselineEndD).toBeGreaterThanOrEqual(1080);
  });
});

describe("distancePerStroke", () => {
  it("returns 0 for invalid inputs", () => {
    expect(distancePerStroke(0, 30)).toBe(0);
  });

  it("computes metres per stroke from pace and rate", () => {
    const dps = distancePerStroke(120, 30);
    expect(dps).toBeCloseTo(500 / 120 / (30 / 60), 5);
  });
});

describe("techniqueSummary", () => {
  it("summarises mock stroke data", () => {
    const detail = mockWorkoutDetail(1002)!;
    const t = techniqueSummary(detail.strokes);
    expect(t.avgDps).toBeGreaterThan(0);
    expect(t.avgSpm).toBeGreaterThan(0);
    expect(t.dps.length).toBeGreaterThan(0);
  });

  it("filters invalid strokes while preserving aggregate semantics", () => {
    const strokes = [
      { ...stroke(1, 30), pace: 120 },
      { ...stroke(2, 30), pace: 0 },
      { ...stroke(3, 30), pace: 130 },
      { ...stroke(4, 30), pace: 150 },
      { ...stroke(5, 0), pace: 155 },
      { ...stroke(6, 30), pace: 160 },
      { ...stroke(7, 30), pace: 170 },
      { ...stroke(8, 30), pace: 180 },
    ];

    const summary = techniqueSummary(strokes);
    const validPaces = [120, 130, 150, 160, 170, 180];
    const meanPace = validPaces.reduce((sum, pace) => sum + pace, 0) / validPaces.length;
    const sd = Math.sqrt(
      validPaces.reduce((sum, pace) => sum + (pace - meanPace) ** 2, 0) / validPaces.length,
    );

    expect(summary.dps.map((point) => point.t)).toEqual([1, 3, 4, 6, 7, 8]);
    expect(summary.avgDps).toBeCloseTo(
      validPaces.reduce((sum, pace) => sum + distancePerStroke(pace, 30), 0) / validPaces.length,
    );
    expect(summary.avgSpm).toBe(30);
    expect(summary.paceConsistency).toBeCloseTo((sd / meanPace) * 100);
    expect(summary.fade).toBeCloseTo(40);
  });

  it("ignores NaN validity fields consistently across passes", () => {
    const summary = techniqueSummary([
      { ...stroke(1, 30), pace: 120 },
      { ...stroke(2, 30), pace: Number.NaN },
      { ...stroke(3, Number.NaN), pace: 130 },
      { ...stroke(4, 30), pace: 140 },
    ]);

    expect(summary.dps).toHaveLength(2);
    expect(summary.dps.map((point) => point.t)).toEqual([1, 4]);
    expect(summary.avgDps).toBeCloseTo(
      (distancePerStroke(120, 30) + distancePerStroke(140, 30)) / 2,
    );
    expect(summary.avgSpm).toBe(30);
    expect(summary.paceConsistency).toBeCloseTo(1000 / 130);
    expect(summary.fade).toBe(0);
  });
});

describe("efficiencyByRate", () => {
  it("buckets strokes by rounded SPM", () => {
    const detail = mockWorkoutDetail(1001)!;
    const pts = efficiencyByRate(detail.strokes);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts[0].dps).toBeGreaterThan(0);
  });
});

describe("workoutWatts", () => {
  it("uses watt-minutes when logged", () => {
    const w = workout({ id: 1, wattMinutes: 480, time: 480, pace: 120 });
    expect(workoutWatts(w)).toBe(60);
  });

  it("derives watts from normalised pace for bike without watt-minutes", () => {
    const w = workout({ id: 2, sport: "bike", pace: 95, time: 600 });
    expect(workoutWatts(w)).toBeCloseTo(51.03, 1);
  });

  it("derives watts from pace for rower", () => {
    const w = workout({ id: 3, sport: "rower", pace: 120, time: 480 });
    expect(workoutWatts(w)).toBeGreaterThan(0);
  });
});

describe("estimateCriticalPower", () => {
  it("returns a threshold from mock history", () => {
    const cp = estimateCriticalPower(workouts);
    expect(cp).not.toBeNull();
    expect(cp!.ftp).toBeGreaterThan(0);
    expect(["model", "estimate"]).toContain(cp!.method);
    expect(cp!.sampleSize).toBeGreaterThan(0);
    expect(cp!.warnings).toEqual(expect.any(Array));
  });

  function powerWorkout(
    id: number,
    seconds: number,
    watts: number,
    opts: { sport?: "rower" | "skierg" | "bike"; date?: string } = {},
  ) {
    return workout({
      id,
      sport: opts.sport ?? "rower",
      time: seconds,
      wattMinutes: watts * (seconds / 60),
      date: opts.date ?? `2026-05-${String(id).padStart(2, "0")} 06:00:00`,
    });
  }

  it("flags too few efforts and returns an estimate-only result", () => {
    const cp = estimateCriticalPower([powerWorkout(1, 1200, 240)], { asOf: "2026-06-01" });
    expect(cp).not.toBeNull();
    expect(cp!.method).toBe("estimate");
    expect(cp!.confidence).toBe("insufficient");
    expect(cp!.warnings).toContain("too-few-efforts");
    expect(cp!.warnings).toContain("estimate-only");
  });

  it("fits model diagnostics from varied maximal efforts", () => {
    const efforts = [
      powerWorkout(1, 180, 200 + 18_000 / 180),
      powerWorkout(2, 600, 200 + 18_000 / 600),
      powerWorkout(3, 1200, 200 + 18_000 / 1200),
      powerWorkout(4, 2400, 200 + 18_000 / 2400),
    ];
    const cp = estimateCriticalPower(efforts, { asOf: "2026-06-01" });
    expect(cp).not.toBeNull();
    expect(cp!.method).toBe("model");
    expect(cp!.cp).toBeCloseTo(200, 0);
    expect(cp!.wPrime).toBeCloseTo(18_000, -2);
    expect(cp!.fitQuality!.r2).toBeGreaterThan(0.99);
    expect(cp!.confidence).toBe("medium");
  });

  it("flags mixed sports instead of hiding the scope assumption", () => {
    const cp = estimateCriticalPower(
      [
        powerWorkout(1, 180, 300, { sport: "rower" }),
        powerWorkout(2, 900, 230, { sport: "skierg" }),
        powerWorkout(3, 1800, 210, { sport: "bike" }),
      ],
      { asOf: "2026-06-01" },
    );
    expect(cp).not.toBeNull();
    expect(cp!.sportScope).toBe("mixed");
    expect(cp!.warnings).toContain("mixed-sports");
  });

  it("flags stale efforts using the supplied asOf date", () => {
    const cp = estimateCriticalPower(
      [
        powerWorkout(1, 180, 300, { date: "2025-01-01 06:00:00" }),
        powerWorkout(2, 900, 230, { date: "2025-01-08 06:00:00" }),
        powerWorkout(3, 1800, 210, { date: "2025-01-15 06:00:00" }),
      ],
      { asOf: "2026-06-01" },
    );
    expect(cp).not.toBeNull();
    expect(cp!.warnings).toContain("stale-efforts");
  });

  it("flags narrow duration coverage", () => {
    const cp = estimateCriticalPower(
      [powerWorkout(1, 1200, 240), powerWorkout(2, 1500, 235), powerWorkout(3, 1800, 230)],
      { asOf: "2026-06-01" },
    );
    expect(cp).not.toBeNull();
    expect(cp!.warnings).toContain("narrow-duration-range");
  });

  it("rejects unrealistic negative-slope fits and falls back", () => {
    const cp = estimateCriticalPower(
      [powerWorkout(1, 180, 180), powerWorkout(2, 600, 260), powerWorkout(3, 1800, 320)],
      { asOf: "2026-06-01" },
    );
    expect(cp).not.toBeNull();
    expect(cp!.method).toBe("estimate");
    expect(cp!.warnings).toContain("unrealistic-fit");
  });

  it("keeps RowErg, SkiErg, and BikeErg scopes separate when filtered upstream", () => {
    const rower = estimateCriticalPower(
      [
        powerWorkout(1, 180, 300, { sport: "rower" }),
        powerWorkout(2, 900, 230, { sport: "rower" }),
        powerWorkout(3, 1800, 210, { sport: "rower" }),
      ],
      { asOf: "2026-06-01" },
    );
    const skierg = estimateCriticalPower(
      [
        powerWorkout(4, 180, 260, { sport: "skierg" }),
        powerWorkout(5, 900, 210, { sport: "skierg" }),
        powerWorkout(6, 1800, 190, { sport: "skierg" }),
      ],
      { asOf: "2026-06-01" },
    );
    const bike = estimateCriticalPower(
      [
        powerWorkout(7, 180, 210, { sport: "bike" }),
        powerWorkout(8, 900, 170, { sport: "bike" }),
        powerWorkout(9, 1800, 155, { sport: "bike" }),
      ],
      { asOf: "2026-06-01" },
    );
    expect(rower!.sportScope).toBe("rower");
    expect(skierg!.sportScope).toBe("skierg");
    expect(bike!.sportScope).toBe("bike");
  });
});

describe("annualGoalProgress", () => {
  it("credits BikeErg distance at half toward metre goals", () => {
    const progress = annualGoalProgress(
      [workout({ id: 1, sport: "bike", distance: 8000, time: 1000, pace: 95 })],
      { year: 2026, kind: "meters", target: 1_000_000 },
      "2026-06-01",
    );
    expect(progress.current).toBe(4000);
  });
});

describe("trainingLoad", () => {
  it("builds PMC series from mock workouts", () => {
    const load = trainingLoad(workouts);
    expect(load).not.toBeNull();
    expect(load!.series.length).toBeGreaterThan(0);
    expect(load!.ctl).toBeGreaterThanOrEqual(0);
    expect(["transition", "fresh", "neutral", "productive", "overreaching"]).toContain(load!.band);
  });
});

describe("powerCurve", () => {
  it("returns mean-maximal points for mock strokes", () => {
    const detail = mockWorkoutDetail(1001)!;
    const curve = powerCurve(detail.strokes, [10, 30, 60]);
    expect(curve.length).toBeGreaterThan(0);
    expect(curve.every((p) => p.watts >= 0)).toBe(true);
  });

  it("returns empty for too few strokes", () => {
    expect(powerCurve([{ t: 0, d: 0, pace: 120, spm: 28, watts: 100 }])).toEqual([]);
  });
});

describe("intervalBreakdown", () => {
  it("returns null for single-segment pieces", () => {
    const detail = mockWorkoutDetail(1001)!;
    expect(intervalBreakdown([detail.splits[0]], detail.strokes)).toBeNull();
  });

  it("assigns strokes across reps using cumulative split time boundaries", () => {
    const result = intervalBreakdown(intervalSplits, normalizedIntervalStrokes());
    expect(result).not.toBeNull();
    expect(result!.reps).toHaveLength(2);
    expect(result!.reps[0].pace).toBe(120);
    expect(result!.reps[1].pace).toBe(122);
    // Rep 0 gets strokes with t ≤ 10 (4 strokes), rep 1 gets t > 10 (2 strokes).
    // spm is derived from the bucket since splits omit it, and rep values differ.
    expect(result!.reps[0].spm).toBeGreaterThan(result!.reps[1].spm);
    expect(result!.reps[0].spm).not.toBe(result!.reps[1].spm);
  });

  it("returns a breakdown with zero derived spm when strokes are empty", () => {
    const result = intervalBreakdown(twoRepSplits, []);
    expect(result).not.toBeNull();
    expect(result!.reps).toHaveLength(2);
    expect(result!.reps[0].spm).toBe(0);
    expect(result!.reps[1].spm).toBe(0);
  });

  it("assigns a stroke exactly on a split boundary to that rep", () => {
    const onFirstEdge = intervalBreakdown(twoRepSplits, [stroke(10, 99)]);
    expect(onFirstEdge!.reps[0].spm).toBe(99);
    expect(onFirstEdge!.reps[1].spm).toBe(0);

    const onLastEdge = intervalBreakdown(twoRepSplits, [stroke(20, 88)]);
    expect(onLastEdge!.reps[0].spm).toBe(0);
    expect(onLastEdge!.reps[1].spm).toBe(88);
  });

  it("assigns strokes after the last split boundary to the final rep", () => {
    const result = intervalBreakdown(twoRepSplits, [stroke(25, 77)]);
    expect(result!.reps[0].spm).toBe(0);
    expect(result!.reps[1].spm).toBe(77);
  });

  it("handles all-zero pace splits without fastest/slowest Infinity sentinels", () => {
    const result = intervalBreakdown(
      [
        { index: 0, distance: 500, time: 120, pace: 0 },
        { index: 1, distance: 500, time: 120, pace: 0 },
        { index: 2, distance: 500, time: 120, pace: 0 },
      ],
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.avgPace).toBe(0);
    expect(result!.fastest).toBe(0);
    expect(result!.slowest).toBe(0);
    expect(result!.consistency).toBe(0);
    expect(result!.reps.every((rep) => !rep.isFastest && !rep.isSlowest)).toBe(true);
  });

  it("keeps large interval sets stable under the single-pass pace calculations", () => {
    const splits = Array.from({ length: 5_000 }, (_, index) => ({
      index,
      distance: 10,
      time: 2,
      pace: 120 + (index % 5),
    }));

    const result = intervalBreakdown(splits, []);

    expect(result).not.toBeNull();
    expect(result!.reps).toHaveLength(5_000);
    expect(result!.avgPace).toBe(122);
    expect(result!.fastest).toBe(120);
    expect(result!.slowest).toBe(124);
    expect(result!.consistency).toBeCloseTo((Math.sqrt(2) / 122) * 100);
  });
});

describe("calendar helpers", () => {
  it("extracts day key without timezone shift", () => {
    expect(workoutDayKey("2026-05-27 06:12:00")).toBe("2026-05-27");
  });

  it("aggregates daily volume", () => {
    const map = aggregateDailyVolume(workouts);
    expect(map.size).toBeGreaterThan(0);
    const first = [...map.values()][0];
    expect(dayVolumeValue(first, "distance")).toBe(first.distance);
  });

  it("builds a stable training calendar grid", () => {
    const cal = buildTrainingCalendar(workouts, { endDay: "2026-05-27", weeks: 12 });
    expect(cal.cells.length).toBe(12 * 7);
    expect(cal.activeDays).toBeGreaterThan(0);
    expect(cal.longestStreak).toBeGreaterThanOrEqual(cal.currentStreak);
  });

  it("buckets cross-timezone workouts on the athlete local day", () => {
    const crossTz = {
      id: 9001,
      date: "2024-01-14 23:30:00",
      timezone: "America/New_York",
      sport: "rower" as const,
      distance: 5000,
      time: 1260,
      pace: 126,
      hasStrokeData: false,
    };
    const withHome = buildTrainingCalendar([crossTz], {
      endDay: "2024-01-20",
      weeks: 2,
      homeTz: "America/New_York",
    });
    const jan14WithHome = withHome.cells.find((c) => c.day === "2024-01-14");
    expect(jan14WithHome?.sessions).toBe(1);

    const withWorkoutTzOnly = buildTrainingCalendar([crossTz], {
      endDay: "2024-01-20",
      weeks: 2,
    });
    const jan14WorkoutTz = withWorkoutTzOnly.cells.find((c) => c.day === "2024-01-14");
    expect(jan14WorkoutTz?.sessions).toBe(1);

    // Cross-zone: the same workout viewed from Auckland rolls into the next
    // calendar day. 23:30 EST on Jan 14 is 17:30 NZDT on Jan 15, so the
    // session must bucket on 2024-01-15 — never on Jan 14.
    const withAucklandHome = buildTrainingCalendar([crossTz], {
      endDay: "2024-01-20",
      weeks: 2,
      homeTz: "Pacific/Auckland",
    });
    const jan15Auckland = withAucklandHome.cells.find((c) => c.day === "2024-01-15");
    expect(jan15Auckland?.sessions).toBe(1);
    const jan14Auckland = withAucklandHome.cells.find((c) => c.day === "2024-01-14");
    expect(jan14Auckland?.sessions ?? 0).toBe(0);
  });
});

describe("volumeIntensityLevel", () => {
  it("returns 0 for rest days", () => {
    expect(volumeIntensityLevel(0, [100, 200, 300])).toBe(0);
  });

  it("maps the max volume to max level", () => {
    const sorted = [100, 200, 300, 400];
    expect(volumeIntensityLevel(400, sorted, 4)).toBe(4);
  });
});

describe("stroke normalisation (bike + intervals)", () => {
  it("offsets time and distance across interval resets", () => {
    const raw = [
      { t: 0, d: 0, p: 1200, spm: 28 },
      { t: 100, d: 500, p: 1180, spm: 29 },
      { t: 0, d: 0, p: 1220, spm: 27 },
      { t: 100, d: 500, p: 1200, spm: 28 },
    ];
    const norm = normalizeRawStrokes(raw, "rower");
    expect(norm[2].t).toBeGreaterThanOrEqual(norm[1].t);
    expect(norm[3].t).toBeGreaterThan(norm[2].t);
  });

  it("halves bike pace to sec/500m", () => {
    const raw = [{ t: 0, d: 0, p: 1900, spm: 85 }];
    const norm = normalizeRawStrokes(raw, "bike");
    expect(norm[0].pace).toBe(95);
  });
});

describe("full-fidelity analytics", () => {
  it("hrRecoveryTrend uses ending/recovery when present", () => {
    const detail = mockWorkoutDetail(1007)!;
    const trend = hrRecoveryTrend([detail]);
    expect(trend.length).toBe(1);
    expect(trend[0].drop).toBe(48);
  });

  it("hrZoneOf returns 0-indexed zones aligned with Concept2 targets", () => {
    const hrMax = 200;
    expect(hrZoneOf(100, hrMax)).toBe(0);
    expect(hrZoneOf(130, hrMax)).toBe(1);
    expect(hrZoneOf(190, hrMax)).toBe(4);
    expect(hrZoneOf(250, hrMax)).toBe(5);
  });

  it("targetVsActual compares HR zone index to derived zone, not bpm", () => {
    const detail = mockWorkoutDetail(1005)!;
    detail.targets = { ...detail.targets, heartRateZone: 3 };
    detail.heartRateAvg = 160;
    detail.hrMax = 200;
    const row = targetVsActual(detail).find((r) => r.metric === "heartRateZone");
    expect(row).toBeDefined();
    expect(row!.actual).toBeLessThanOrEqual(5);
    expect(row!.actual).toBeGreaterThanOrEqual(0);
    expect(typeof row!.actual).toBe("number");
    expect(row!.actual).not.toBe(detail.heartRateAvg);
  });

  it("workRestEfficiency summarises interval work vs rest", () => {
    const detail = mockWorkoutDetail(1005)!;
    const eff = workRestEfficiency(detail);
    expect(eff).not.toBeNull();
    expect(eff!.restTime).toBe(270);
    expect(eff!.timeRatio).toBeGreaterThan(0);
  });

  it("targetVsActual compares pace and watts", () => {
    const detail = mockWorkoutDetail(1005)!;
    const rows = targetVsActual(detail);
    expect(rows.some((r) => r.metric === "pace")).toBe(true);
    expect(rows.some((r) => r.metric === "watts")).toBe(true);
  });
});

describe("workoutSideStats", () => {
  const baseDetail = {
    id: 1,
    date: "2026-01-01 06:00:00",
    sport: "rower" as const,
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: true,
    splits: [],
    isInterval: false,
  };

  it("returns null avgHr and peakHr when no strokes have HR data", () => {
    const detail = {
      ...baseDetail,
      strokes: [
        { t: 0, d: 0, pace: 120, spm: 28, watts: 100 },
        { t: 10, d: 50, pace: 118, spm: 29, watts: 110 },
      ],
    };
    const stats = workoutSideStats(detail);
    expect(stats.avgHr).toBeNull();
    expect(stats.peakHr).toBeNull();
  });

  it("computes avgHr and peakHr from stroke HR data", () => {
    const detail = {
      ...baseDetail,
      strokes: [
        { t: 0, d: 0, pace: 120, spm: 28, watts: 100, hr: 140 },
        { t: 10, d: 50, pace: 118, spm: 29, watts: 110, hr: 160 },
        { t: 20, d: 100, pace: 116, spm: 30, watts: 120, hr: 150 },
      ],
    };
    const stats = workoutSideStats(detail);
    expect(stats.peakHr).toBe(160);
    expect(stats.avgHr).toBe(Math.round((140 + 160 + 150) / 3));
  });

  it("uses heartRateAvg override instead of computing from strokes", () => {
    const detail = {
      ...baseDetail,
      heartRateAvg: 155,
      strokes: [
        { t: 0, d: 0, pace: 120, spm: 28, watts: 100, hr: 140 },
        { t: 10, d: 50, pace: 118, spm: 29, watts: 110, hr: 160 },
      ],
    };
    const stats = workoutSideStats(detail);
    expect(stats.avgHr).toBe(155);
  });

  it("ignores zero and null HR values", () => {
    const detail = {
      ...baseDetail,
      strokes: [
        { t: 0, d: 0, pace: 120, spm: 28, watts: 100, hr: 0 },
        { t: 10, d: 50, pace: 118, spm: 29, watts: 110, hr: null as unknown as number }, // simulate a null HR value from a real-world partial response
        { t: 20, d: 100, pace: 116, spm: 30, watts: 120, hr: 150 },
      ],
    };
    const stats = workoutSideStats(detail);
    expect(stats.peakHr).toBe(150);
    expect(stats.avgHr).toBe(150);
  });

  it("returns best5sPower of 0 when powerCurve is empty", () => {
    const detail = {
      ...baseDetail,
      strokes: [],
    };
    const stats = workoutSideStats(detail);
    expect(stats.best5sPower).toBe(0);
    expect(stats.avgHr).toBeNull();
    expect(stats.peakHr).toBeNull();
  });

  it("returns positive best5sPower from stroke data", () => {
    const detail = mockWorkoutDetail(1001)!;
    const stats = workoutSideStats(detail);
    expect(stats.best5sPower).toBeGreaterThan(0);
  });
});

const modelledCp: CriticalPower = {
  cp: 200,
  wPrime: 18_000,
  ftp: 200,
  method: "model",
  sampleSize: 4,
  envelopePoints: 4,
  sportScope: "rower",
  confidence: "medium",
  warnings: [],
};

describe("powerAtDuration / CP predictions", () => {
  it("returns 0 for non-positive duration or CP", () => {
    expect(powerAtDuration(modelledCp, 0)).toBe(0);
    expect(powerAtDuration(modelledCp, -30)).toBe(0);
    expect(powerAtDuration({ ...modelledCp, cp: 0 }, 600)).toBe(0);
  });

  it("adds W′/t to CP and drops W′ when it is zero", () => {
    expect(powerAtDuration(modelledCp, 600)).toBeCloseTo(230);
    expect(powerAtDuration({ ...modelledCp, wPrime: 0 }, 600)).toBe(200);
  });

  it("converts sustainable watts back to even-split pace", () => {
    const pace = predictPaceForDuration(modelledCp, 1200);
    expect(pace).toBeCloseTo(wattsToPaceForSport("rower", 215));
    expect(predictPaceForDuration({ ...modelledCp, cp: 0 }, 1200)).toBeNull();
  });

  it("uses BikeErg's 1000m-basis inverse for bike predictions", () => {
    const rowPace = predictPaceForDuration(modelledCp, 1200, "rower")!;
    const bikePace = predictPaceForDuration(modelledCp, 1200, "bike")!;
    // wattsToPace(watts * 8) scales pace by 8^(1/3) = 2, so stored sec/500m is half.
    expect(bikePace).toBeCloseTo(rowPace / 2);
    expect(bikePace).toBeCloseTo(wattsToPaceForSport("bike", 215));
  });

  it("rejects invalid distances and scales finish time with distance", () => {
    expect(predictTimeForDistance(modelledCp, 0)).toBeNull();
    expect(predictTimeForDistance(modelledCp, Number.NaN)).toBeNull();
    expect(predictTimeForDistance({ ...modelledCp, cp: 0 }, 2000)).toBeNull();
    const twoK = predictTimeForDistance(modelledCp, 2000, "rower")!;
    const fiveK = predictTimeForDistance(modelledCp, 5000, "rower")!;
    expect(twoK).toBeGreaterThan(300);
    expect(fiveK).toBeGreaterThan(twoK);
  });

  it("compares nearby session averages to the modelled curve", () => {
    const comparison = powerDurationComparison(
      [
        workout({
          id: 1,
          time: 1200,
          wattMinutes: 240 * 20,
          pace: 120,
        }),
        workout({
          id: 2,
          time: 60,
          wattMinutes: 400,
          pace: 90,
        }),
      ],
      modelledCp,
    );
    expect(comparison.durations).toContain(1200);
    const i = comparison.durations.indexOf(1200);
    expect(comparison.actual[i]).toBe(240);
    expect(comparison.modelled[i]).toBe(Math.round(powerAtDuration(modelledCp, 1200)));
    const sprintIndex = comparison.durations.indexOf(120);
    expect(comparison.actual[sprintIndex]).toBeNull();
  });
});

function detail(overrides: Partial<WorkoutDetail> = {}): WorkoutDetail {
  return {
    id: 1,
    date: "2026-01-01 06:00:00",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: true,
    strokes: ladderStrokes(),
    splits: [],
    isInterval: false,
    ...overrides,
  };
}

describe("sampleStrokeAtDistance / buildDistanceOverlay", () => {
  it("returns null for an empty stream and clamps outside the recorded range", () => {
    expect(sampleStrokeAtDistance([], 50)).toBeNull();
    const strokes = ladderStrokes();
    expect(sampleStrokeAtDistance(strokes, -10)).toEqual(strokes[0]);
    expect(sampleStrokeAtDistance(strokes, 10_000)).toEqual(strokes[2]);
  });

  it("interpolates pace, power, and HR between adjacent samples", () => {
    const mid = sampleStrokeAtDistance(ladderStrokes(), 25)!;
    expect(mid.d).toBe(25);
    expect(mid.t).toBeCloseTo(5);
    expect(mid.pace).toBeCloseTo(115);
    expect(mid.watts).toBeCloseTo(110);
    expect(mid.hr).toBeCloseTo(145);
  });

  it("returns the exact sample when the distance lands on a recorded point", () => {
    const strokes = ladderStrokes();
    expect(sampleStrokeAtDistance(strokes, 50)).toEqual(strokes[1]);
  });

  it("aligns two stroke streams onto the shorter distance", () => {
    const short = ladderStrokes().slice(0, 2);
    const overlay = buildDistanceOverlay(ladderStrokes(), short, 2);
    expect(overlay).not.toBeNull();
    expect(overlay!.alignedMetres).toBe(50);
    expect(overlay!.xs).toEqual([0, 25, 50]);
    expect(overlay!.paceA[1]).toBeCloseTo(115);
    expect(overlay!.paceB[1]).toBeCloseTo(115);
  });

  it("returns null when either stream has no positive distance", () => {
    expect(buildDistanceOverlay([], ladderStrokes())).toBeNull();
    expect(
      buildDistanceOverlay([{ t: 0, d: 0, pace: 120, spm: 28, watts: 100 }], ladderStrokes()),
    ).toBeNull();
  });
});

describe("compareVerdict / compareIntervalReps", () => {
  it("ties different sports without inventing a time delta", () => {
    expect(compareVerdict(detail(), detail({ sport: "skierg" }))).toEqual({
      winner: "tie",
      timeDeltaSec: null,
      paceDelta: null,
    });
  });

  it("picks the faster like-for-like 2k and ties sub-half-second gaps", () => {
    const faster = compareVerdict(detail({ time: 479 }), detail({ time: 481 }));
    expect(faster.winner).toBe("a");
    expect(faster.timeDeltaSec).toBeCloseTo(2);
    expect(compareVerdict(detail({ time: 480 }), detail({ time: 480.4 })).winner).toBe("tie");
  });

  it("falls back to pace when distances are in different bands", () => {
    const verdict = compareVerdict(
      detail({ distance: 2000, pace: 118 }),
      detail({ distance: 500, pace: 105 }),
    );
    expect(verdict.timeDeltaSec).toBeNull();
    expect(verdict.winner).toBe("b");
    expect(verdict.paceDelta).toBeCloseTo(13);
  });

  it("returns per-rep deltas for matching interval pieces", () => {
    const a = detail({
      isInterval: true,
      splits: intervalSplits,
      strokes: normalizedIntervalStrokes(),
    });
    const b = detail({
      id: 2,
      isInterval: true,
      splits: [
        { index: 0, distance: 50, time: 11, pace: 124 },
        { index: 1, distance: 50, time: 12, pace: 128 },
      ],
      strokes: normalizedIntervalStrokes(),
    });
    const rows = compareIntervalReps(a, b);
    expect(rows).toHaveLength(2);
    expect(rows![0]).toMatchObject({ index: 1, paceA: 120, paceB: 124, timeA: 10, timeB: 11 });
    expect(rows![0].paceDelta).toBeCloseTo(-4);
    expect(rows![0].timeDelta).toBeCloseTo(1);
  });

  it("returns null when sports differ or a piece is not an interval set", () => {
    expect(compareIntervalReps(detail({ sport: "rower" }), detail({ sport: "bike" }))).toBeNull();
    expect(compareIntervalReps(detail(), detail({ id: 2 }))).toBeNull();
  });
});

describe("athleteBadges / weeklyConsistency", () => {
  it("credits lifetime metres and Club distances from PBs", () => {
    const history = [
      workout({ id: 1, distance: 80_000 }),
      workout({ id: 2, sport: "bike", distance: 40_000 }),
    ];
    const badges = athleteBadges(history, [
      { distance: 2000, time: 420, pace: 105, date: history[0].date, sport: "rower" },
    ]);
    expect(badges.find((b) => b.id === "meters_100k")).toMatchObject({ earned: true, progress: 1 });
    expect(badges.find((b) => b.id === "meters_500k")?.earned).toBe(false);
    expect(badges.find((b) => b.id === "club_2000")?.earned).toBe(true);
    expect(badges.find((b) => b.id === "club_500")?.earned).toBe(false);
  });

  it("requires all three sports inside a rolling 7-day window", () => {
    const mixed = [
      workout({ id: 1, date: "2026-01-01 06:00:00", sport: "rower" }),
      workout({ id: 2, date: "2026-01-03 06:00:00", sport: "skierg" }),
      workout({ id: 3, date: "2026-01-06 06:00:00", sport: "bike" }),
    ];
    expect(hasEverySportWeek(mixed)).toBe(true);
    expect(hasEverySportWeek(mixed.slice(0, 2))).toBe(false);
    expect(athleteBadges(mixed, []).find((b) => b.id === "every_sport_week")?.earned).toBe(true);
  });

  it("counts an active week when any day in the lookback window has volume", () => {
    const consistency = weeklyConsistency(
      [workout({ id: 1, date: "2026-01-07 06:00:00" })],
      "2026-01-07",
      8,
    );
    expect(consistency).toEqual({ activeWeeks: 1, totalWeeks: 8 });
  });
});
