import { describe, expect, it } from "vite-plus/test";
import {
  buildPredictionTable,
  PAUL_EXPONENT,
  predictTimes,
  PREDICTOR_DISTANCES,
} from "./performancePredictor";

describe("predictTimes", () => {
  it("keeps the source distance at the entered time", () => {
    const map = predictTimes(2000, 424);
    expect(map.get(2000)).toBe(424);
  });

  it("predicts 6k from 7:04 2k via Paul's Law (±1 s)", () => {
    const twoK = 7 * 60 + 4;
    const expected6k = twoK * Math.pow(6000 / 2000, PAUL_EXPONENT);
    const predicted = predictTimes(2000, twoK).get(6000)!;
    expect(predicted).toBeCloseTo(expected6k, 0);
    expect(Math.abs(predicted - expected6k)).toBeLessThanOrEqual(1);
  });

  it("returns every standard distance", () => {
    const map = predictTimes(1000, 180);
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([...PREDICTOR_DISTANCES]);
  });
});

describe("buildPredictionTable", () => {
  it("marks all rows untried when personal bests are empty", () => {
    const rows = buildPredictionTable(2000, 420, []);
    expect(rows.every((r) => r.status === "untried")).toBe(true);
    expect(rows.every((r) => r.actualBestSeconds === null)).toBe(true);
  });

  it("classifies beaten when PB is faster than predicted", () => {
    const rows = buildPredictionTable(2000, 500, [{ distance: 5000, time: 1000 }]);
    const fiveK = rows.find((r) => r.distance === 5000)!;
    expect(fiveK.status).toBe("beaten");
    expect(fiveK.actualBestSeconds).toBe(1000);
    expect(fiveK.predictedSeconds).toBeGreaterThan(1000);
  });

  it("classifies behind when PB is slower than predicted", () => {
    const rows = buildPredictionTable(2000, 400, [{ distance: 5000, time: 9999 }]);
    const fiveK = rows.find((r) => r.distance === 5000)!;
    expect(fiveK.status).toBe("behind");
  });

  it("classifies behind when PB equals predicted time", () => {
    const predicted = predictTimes(2000, 420).get(5000)!;
    const rows = buildPredictionTable(2000, 420, [{ distance: 5000, time: predicted }]);
    expect(rows.find((r) => r.distance === 5000)!.status).toBe("behind");
  });

  it("uses the fastest PB when multiple entries share a distance", () => {
    const rows = buildPredictionTable(2000, 500, [
      { distance: 1000, time: 200 },
      { distance: 1000, time: 180 },
    ]);
    const oneK = rows.find((r) => r.distance === 1000)!;
    expect(oneK.actualBestSeconds).toBe(180);
  });
});
