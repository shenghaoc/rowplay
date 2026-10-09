import { describe, expect, it } from "vite-plus/test";
import { targetVsActual, workRestEfficiency } from "./analytics";
import { paceToWatts } from "./format";
import type { Split, WorkoutDetail } from "./types";

function detail(overrides: Partial<WorkoutDetail> = {}): WorkoutDetail {
  return {
    id: 1,
    date: "2026-01-01 06:00:00",
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

const workAndRest: Split[] = [
  { index: 0, distance: 500, time: 120, pace: 100, isRest: false },
  { index: 1, distance: 0, time: 60, pace: 0, isRest: true, restDistance: 40 },
  { index: 2, distance: 500, time: 130, pace: 0, isRest: false },
];

describe("workRestEfficiency", () => {
  it("returns null for continuous pieces and for intervals with no work", () => {
    expect(workRestEfficiency(detail({ splits: workAndRest }))).toBeNull();
    expect(
      workRestEfficiency(
        detail({
          isInterval: true,
          splits: [{ index: 0, distance: 0, time: 60, pace: 0, isRest: true }],
        }),
      ),
    ).toBeNull();
  });

  it("averages only positive work paces and uses split rest when the detail omits it", () => {
    const eff = workRestEfficiency(detail({ isInterval: true, splits: workAndRest }))!;
    expect(eff.workTime).toBe(250);
    expect(eff.workDistance).toBe(1000);
    expect(eff.avgWorkPace).toBe(100);
    expect(eff.restTime).toBe(60);
    expect(eff.restDistance).toBe(40);
    expect(eff.timeRatio).toBeCloseTo(250 / 60, 6);
  });

  it("prefers detail rest totals, including an explicit zero", () => {
    const overridden = workRestEfficiency(
      detail({ isInterval: true, splits: workAndRest, restTime: 90, restDistance: 0 }),
    )!;
    expect(overridden.restTime).toBe(90);
    expect(overridden.restDistance).toBe(0);
    expect(overridden.timeRatio).toBeCloseTo(250 / 90, 6);

    const noRest = workRestEfficiency(
      detail({ isInterval: true, splits: workAndRest, restTime: 0 }),
    )!;
    expect(noRest.restTime).toBe(0);
    expect(noRest.timeRatio).toBeUndefined();
  });
});

describe("targetVsActual", () => {
  it("returns no rows when the piece has no targets", () => {
    expect(targetVsActual(detail())).toEqual([]);
  });

  it("marks a faster pace and a higher wattage as hits, and the reverse as misses", () => {
    const rows = targetVsActual(
      detail({
        pace: 118,
        targets: { pace: 120, watts: paceToWatts(118) - 10 },
      }),
    );
    const pace = rows.find((row) => row.metric === "pace")!;
    const watts = rows.find((row) => row.metric === "watts")!;
    expect(pace.delta).toBe(-2);
    expect(pace.hit).toBe(true);
    expect(watts.hit).toBe(true);

    const missed = targetVsActual(
      detail({
        pace: 130,
        targets: { pace: 120, watts: paceToWatts(130) + 50 },
      }),
    );
    expect(missed.find((row) => row.metric === "pace")!.hit).toBe(false);
    expect(missed.find((row) => row.metric === "watts")!.hit).toBe(false);
  });

  it("allows stroke rate within 1 spm and treats extra calories as a hit", () => {
    const rows = targetVsActual(
      detail({
        strokeRate: 28,
        caloriesTotal: 500,
        targets: { strokeRate: 27, calories: 400 },
      }),
    );
    expect(rows.find((row) => row.metric === "strokeRate")).toMatchObject({ delta: 1, hit: true });
    expect(rows.find((row) => row.metric === "calories")).toMatchObject({ delta: 100, hit: true });

    const wide = targetVsActual(detail({ strokeRate: 28, targets: { strokeRate: 26 } }));
    expect(wide.find((row) => row.metric === "strokeRate")!.hit).toBe(false);
    const short = targetVsActual(detail({ caloriesTotal: 300, targets: { calories: 400 } }));
    expect(short.find((row) => row.metric === "calories")!.hit).toBe(false);
  });

  it("skips pace, watts, and rate when the achieved value is missing", () => {
    const rows = targetVsActual(
      detail({
        pace: 0,
        time: 0,
        wattMinutes: 0,
        targets: { pace: 120, watts: 200, strokeRate: 28 },
      }),
    );
    expect(rows).toEqual([]);
  });
});
