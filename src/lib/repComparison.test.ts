import { describe, expect, it } from "vite-plus/test";
import {
  alignRepsForChart,
  detectReps,
  REP_PALETTE,
  repAvgPace,
  repColor,
  repsHaveHr,
  type RepSeries,
} from "./repComparison";
import { mockWorkoutDetail } from "./mockData";
import type { Split, Stroke, WorkoutDetail } from "./types";

function workout(overrides: Partial<WorkoutDetail> & Pick<WorkoutDetail, "id">): WorkoutDetail {
  const base = mockWorkoutDetail(1001)!;
  return { ...base, ...overrides };
}

const twoWorkSplits: Split[] = [
  { index: 0, distance: 500, time: 120, pace: 120, spm: 28, isRest: false },
  { index: 1, distance: 0, time: 60, pace: 0, isRest: true },
  { index: 2, distance: 500, time: 122, pace: 122, spm: 27, isRest: false },
];

function stroke(t: number, pace: number, spm = 28, hr?: number): Stroke {
  return { t, d: t * 2, pace, spm, watts: 180, hr };
}

describe("detectReps", () => {
  it("returns null for a single work interval", () => {
    const detail = workout({
      id: 1,
      splits: [{ index: 0, distance: 2000, time: 480, pace: 120 }],
      strokes: [stroke(0, 120), stroke(240, 118)],
    });
    expect(detectReps(detail)).toBeNull();
  });

  it("returns null when work intervals are shorter than 30 s", () => {
    const detail = workout({
      id: 2,
      splits: [
        { index: 0, distance: 100, time: 20, pace: 100, isRest: false },
        { index: 1, distance: 100, time: 20, pace: 102, isRest: false },
      ],
      strokes: [],
    });
    expect(detectReps(detail)).toBeNull();
  });

  it("detects two qualifying work intervals and excludes rest", () => {
    const strokes = [stroke(0, 120), stroke(60, 118), stroke(120, 122), stroke(180, 121)];
    const detail = workout({ id: 3, splits: twoWorkSplits, strokes, isInterval: true });
    const reps = detectReps(detail);
    expect(reps).not.toBeNull();
    expect(reps!.length).toBe(2);
  });

  it("zero-bases every rep time axis", () => {
    const strokes = [stroke(0, 120), stroke(60, 118), stroke(180, 122), stroke(240, 121)];
    const detail = workout({ id: 4, splits: twoWorkSplits, strokes });
    const reps = detectReps(detail)!;
    for (const r of reps) {
      expect(r.times.length).toBeGreaterThan(0);
      expect(r.times[0]).toBe(0);
    }
  });

  it("computes average pace for legend", () => {
    const detail = workout({
      id: 5,
      splits: [
        { index: 0, distance: 500, time: 120, pace: 100, isRest: false },
        { index: 1, distance: 500, time: 120, pace: 110, isRest: false },
      ],
      strokes: [],
    });
    const reps = detectReps(detail)!;
    expect(repAvgPace(reps[0])).toBe(100);
    expect(repAvgPace(reps[1])).toBe(110);
  });

  it("fills hr with zeros when unavailable", () => {
    const detail = workout({
      id: 6,
      splits: [
        { index: 0, distance: 500, time: 120, pace: 120, isRest: false },
        { index: 1, distance: 500, time: 120, pace: 122, isRest: false },
      ],
      strokes: [stroke(0, 120), stroke(180, 122)],
    });
    const reps = detectReps(detail)!;
    expect(repsHaveHr(reps)).toBe(false);
    expect([...reps[0].hr].every((v) => v === 0)).toBe(true);
  });

  it("detects reps on demo interval workout 1005", () => {
    const detail = mockWorkoutDetail(1005)!;
    const reps = detectReps(detail);
    expect(reps).not.toBeNull();
    expect(reps!.length).toBe(4);
  });

  it("keeps a stroke on the closing edge of a rep and drops rest strokes", () => {
    const strokes = [stroke(0, 120), stroke(120, 118), stroke(150, 200), stroke(181, 121)];
    const reps = detectReps(workout({ id: 7, splits: twoWorkSplits, strokes }))!;
    expect([...reps[0].pace]).toEqual([120, 118]);
    expect([...reps[0].times]).toEqual([0, 120]);
    expect([...reps[1].pace]).toEqual([121]);
    expect(reps[1].times[0]).toBe(0);
  });

  it("derives split watts from watt-minutes and heart rate from the detail object", () => {
    const splits: Split[] = [
      {
        index: 0,
        distance: 500,
        time: 120,
        pace: 120,
        isRest: false,
        wattMinutes: 400,
        heartRate: { average: 142 },
      },
      { index: 1, distance: 500, time: 120, pace: 130, isRest: false },
    ];
    const reps = detectReps(workout({ id: 8, splits, strokes: [] }))!;
    expect(reps[0].power[0]).toBeCloseTo(200, 6);
    expect(reps[0].hr[0]).toBe(142);
    expect(repsHaveHr(reps)).toBe(true);
    const perMetre = 130 / 500;
    expect(reps[1].power[0]).toBeCloseTo(2.8 / perMetre ** 3, 5);
  });

  it("falls back to split pace when every stroke pace is zero", () => {
    const splits: Split[] = [
      { index: 0, distance: 500, time: 120, pace: 100, isRest: false },
      { index: 1, distance: 500, time: 120, pace: 110, isRest: false },
    ];
    const reps = detectReps(
      workout({
        id: 9,
        splits,
        strokes: [stroke(0, 0), stroke(60, 0), stroke(180, 0)],
      }),
    )!;
    expect(repAvgPace(reps[0])).toBe(100);
    expect(repAvgPace(reps[1])).toBe(110);
  });
});

describe("alignRepsForChart", () => {
  it("pads shorter reps with null on the shared grid", () => {
    const reps: RepSeries[] = [
      {
        repIndex: 0,
        avgPace: 120,
        times: new Float32Array([0, 5]),
        pace: new Float32Array([120, 118]),
        rate: new Float32Array([28, 29]),
        power: new Float32Array([180, 185]),
        hr: new Float32Array([0, 0]),
      },
      {
        repIndex: 1,
        avgPace: 122,
        times: new Float32Array([0, 8]),
        pace: new Float32Array([122, 120]),
        rate: new Float32Array([27, 28]),
        power: new Float32Array([170, 175]),
        hr: new Float32Array([0, 0]),
      },
    ];
    const [xs, y0, y1] = alignRepsForChart(reps, "pace");
    expect(xs[xs.length - 1]).toBe(8);
    expect(y0[y0.length - 1]).toBeNull();
    expect(y1[y1.length - 1]).not.toBeNull();
  });

  it("interpolates inside a rep and returns null outside its samples", () => {
    const reps: RepSeries[] = [
      {
        repIndex: 0,
        avgPace: 100,
        times: new Float32Array([2, 6]),
        pace: new Float32Array([100, 140]),
        rate: new Float32Array([20, 28]),
        power: new Float32Array([150, 190]),
        hr: new Float32Array([120, 140]),
      },
    ];
    const pace = alignRepsForChart(reps, "pace")[1];
    expect(pace[0]).toBeNull();
    expect(pace[2]).toBeCloseTo(100, 5);
    expect(pace[4]).toBeCloseTo(120, 5);
    expect(pace[6]).toBeCloseTo(140, 5);

    const rate = alignRepsForChart(reps, "rate")[1];
    expect(rate[4]).toBeCloseTo(24, 5);
    const hr = alignRepsForChart(reps, "hr")[1];
    expect(hr[4]).toBeCloseTo(130, 5);
  });

  it("holds the earlier sample when two timestamps are identical", () => {
    const reps: RepSeries[] = [
      {
        repIndex: 0,
        avgPace: 10,
        times: new Float32Array([0, 5, 5]),
        pace: new Float32Array([10, 20, 40]),
        rate: new Float32Array([1, 2, 3]),
        power: new Float32Array([1, 2, 3]),
        hr: new Float32Array([1, 2, 3]),
      },
    ];
    expect(alignRepsForChart(reps, "pace")[1][5]).toBeCloseTo(20, 5);
  });
});

describe("repColor", () => {
  it("wraps the palette after the sixth rep", () => {
    expect(repColor(0)).toBe(REP_PALETTE[0]);
    expect(repColor(1)).toBe(REP_PALETTE[1]);
    expect(repColor(REP_PALETTE.length)).toBe(REP_PALETTE[0]);
  });
});
