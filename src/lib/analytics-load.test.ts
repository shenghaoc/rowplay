import { describe, expect, it } from "vite-plus/test";
import { powerDurationEnvelope, trainingLoad, type CriticalPower } from "./analytics";
import { addDaysToKey, todayKeyUtc } from "./datetime";
import { workout } from "../../tests/unit/fixtures";
import type { Workout } from "./types";

const FTP = 200;

/** A supplied model so these tests do not depend on the CP regression. */
const suppliedCp: CriticalPower = {
  cp: FTP,
  wPrime: 12_000,
  ftp: FTP,
  method: "estimate",
  sampleSize: 1,
  envelopePoints: 0,
  sportScope: "rower",
  confidence: "insufficient",
  warnings: ["estimate-only"],
};

/** One-hour session whose watt-minutes imply `watts` (TSS = (watts/FTP)² × 100, capped). */
function session(day: string, id: number, seconds: number, watts: number): Workout {
  return workout({
    id,
    date: `${day} 06:00:00`,
    time: seconds,
    distance: 10_000,
    wattMinutes: watts * (seconds / 60),
    pace: 120,
  });
}

function daysAgo(ago: number): string {
  return addDaysToKey(todayKeyUtc(), -ago);
}

/** Daily TSS of `tss` from `fromAgo` through `toAgo` days before today (inclusive). */
function block(fromAgo: number, toAgo: number, tss: number): Workout[] {
  const watts = FTP * Math.sqrt(tss / 100);
  const out: Workout[] = [];
  let id = 1;
  for (let ago = fromAgo; ago >= toAgo; ago--) {
    out.push(session(daysAgo(ago), id++, 3600, watts));
  }
  return out;
}

describe("trainingLoad", () => {
  it("returns null without a positive threshold to scale TSS", () => {
    expect(trainingLoad([])).toBeNull();
    expect(
      trainingLoad([session(todayKeyUtc(), 1, 3600, FTP)], { ...suppliedCp, ftp: 0 }),
    ).toBeNull();
  });

  it("uses a supplied CP so a single sprint can still draw the chart", () => {
    const sprint = workout({
      id: 1,
      date: `${todayKeyUtc()} 06:00:00`,
      time: 30,
      wattMinutes: 150,
      pace: 90,
    });
    expect(trainingLoad([sprint])).toBeNull();
    const load = trainingLoad([sprint], suppliedCp);
    expect(load).not.toBeNull();
    expect(load!.cp).toBe(suppliedCp);
    expect(load!.ftp).toBe(FTP);
  });

  it("caps intensity so an all-out hour cannot outscore 1.6× FTP", () => {
    const today = todayKeyUtc();
    const atFtp = trainingLoad([session(today, 1, 3600, FTP)], suppliedCp)!;
    const allOut = trainingLoad([session(today, 2, 3600, FTP * 10)], suppliedCp)!;
    expect(atFtp.series[0].tss).toBeCloseTo(100, 6);
    expect(allOut.series[0].tss).toBeCloseTo(256, 6);
  });

  it("classifies a same-day threshold hour as productive and a capped long piece as overreaching", () => {
    const today = todayKeyUtc();
    const productive = trainingLoad([session(today, 1, 3600, FTP)], suppliedCp)!;
    expect(productive.band).toBe("productive");
    expect(productive.series.at(-1)!.tsb).toBeCloseTo(-11.905, 2);
    expect(productive.ramp).toBeCloseTo(productive.ctl, 6);

    const overreaching = trainingLoad([session(today, 2, 7200, FTP * 1.6)], suppliedCp)!;
    expect(overreaching.band).toBe("overreaching");
    expect(overreaching.series.at(-1)!.tsb).toBeCloseTo(-60.952, 2);
  });

  it("reads form from the decay after a training block", () => {
    const fresh = trainingLoad(block(40, 7, 100), suppliedCp)!;
    expect(fresh.band).toBe("fresh");
    expect(fresh.series.at(-1)!.tsb).toBeCloseTo(13.43, 2);
    expect(fresh.ramp).toBeLessThan(0);

    const transition = trainingLoad(block(70, 20, 100), suppliedCp)!;
    expect(transition.band).toBe("transition");
    expect(transition.series.at(-1)!.tsb).toBeCloseTo(39.11, 1);

    const neutral = trainingLoad(block(89, 0, 50), suppliedCp)!;
    expect(neutral.band).toBe("neutral");
    expect(neutral.series.at(-1)!.tsb).toBeCloseTo(-5.72, 2);
  });

  it("skips ancient, unparseable, and far-future dates instead of walking them", () => {
    const today = todayKeyUtc();
    const load = trainingLoad(
      [
        session("0001-01-01", 1, 3600, FTP),
        workout({ id: 2, date: "not-a-date 06:00:00", time: 3600, wattMinutes: 12_000 }),
        session("2099-01-01", 3, 3600, FTP),
        session(today, 4, 3600, FTP),
      ],
      suppliedCp,
    )!;
    expect(load.series).toHaveLength(1);
    expect(load.series[0].tss).toBeCloseTo(100, 6);
    expect(load.series.every((point) => Number.isFinite(point.ctl))).toBe(true);
  });

  it("keeps a zero-duration day finite and neutral", () => {
    const load = trainingLoad(
      [
        workout({
          id: 1,
          date: `${todayKeyUtc()} 06:00:00`,
          time: 0,
          wattMinutes: 9_999,
        }),
      ],
      suppliedCp,
    )!;
    const last = load.series.at(-1)!;
    expect(last.tss).toBe(0);
    expect(last.tsb).toBe(0);
    expect(load.band).toBe("neutral");
  });

  it("returns null when every dated effort is outside the chart window", () => {
    expect(
      trainingLoad(
        [session("0001-06-01", 1, 3600, FTP), session("2099-01-01", 2, 3600, FTP)],
        suppliedCp,
      ),
    ).toBeNull();
  });
});

describe("powerDurationEnvelope", () => {
  it("returns no points when nothing falls in the CP duration window", () => {
    expect(powerDurationEnvelope([])).toEqual([]);
    expect(
      powerDurationEnvelope([
        workout({ id: 1, time: 60, wattMinutes: 200, pace: 90 }),
        workout({ id: 2, time: 7200, wattMinutes: 10_000, pace: 130 }),
        workout({ id: 3, time: 600, wattMinutes: 0, pace: 0 }),
      ]),
    ).toEqual([]);
  });

  it("includes the 2-minute and 60-minute edges and drops the seconds outside them", () => {
    const rows = powerDurationEnvelope([
      workout({ id: 1, time: 119, wattMinutes: (119 / 60) * 200 }),
      workout({ id: 2, time: 120, wattMinutes: (120 / 60) * 180 }),
      workout({ id: 3, time: 3600, wattMinutes: (3600 / 60) * 160 }),
      workout({ id: 4, time: 3601, wattMinutes: (3601 / 60) * 220 }),
    ]);
    expect(rows).toEqual([
      { duration: 120, watts: 180 },
      { duration: 3600, watts: 160 },
    ]);
  });

  it("keeps the harder session when two pieces share a duration bin and sorts by duration", () => {
    const rows = powerDurationEnvelope([
      workout({ id: 1, time: 1800, wattMinutes: 4_000, pace: 140 }),
      workout({ id: 2, time: 600, wattMinutes: 1_500, pace: 120 }),
      workout({ id: 3, time: 610, wattMinutes: 250 * (610 / 60), pace: 110 }),
    ]);
    expect(rows.map((row) => row.duration)).toEqual([610, 1800]);
    expect(rows[0].watts).toBeCloseTo(250, 6);
    expect(rows[1].watts).toBeCloseTo(4_000 / 30, 6);
  });
});
