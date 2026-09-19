import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Stroke, WorkoutDetail } from "./types";
import {
  applyHrImport,
  clearHrOverlay,
  extractHrSeries,
  hrOverlayStorageKey,
  interpolateHr,
  mergeHrIntoStrokes,
  previewMergedAvgHr,
  readHrOverlay,
  stripHrFromDetail,
  strokesHaveHr,
  summarizeHr,
  validateHrSamples,
  writeHrOverlay,
} from "./hrImport";

function stroke(t: number, hr?: number): Stroke {
  return { t, d: t * 2, pace: 120, spm: 28, hr, watts: 200 };
}

const samples = [
  { t: 0, hr: 100 },
  { t: 10, hr: 120 },
  { t: 20, hr: 140 },
];

describe("extractHrSeries", () => {
  it("keeps valid HR and sorts", () => {
    const s = extractHrSeries([stroke(5, 110), stroke(0, 100), stroke(3)]);
    expect(s).toEqual([
      { t: 0, hr: 100 },
      { t: 5, hr: 110 },
    ]);
  });
});

describe("interpolateHr", () => {
  it("returns endpoints and midpoints", () => {
    expect(interpolateHr(samples, 0)).toBe(100);
    expect(interpolateHr(samples, 10)).toBe(120);
    expect(interpolateHr(samples, 5)).toBe(110);
  });
  it("returns undefined outside range", () => {
    expect(interpolateHr(samples, -1)).toBeUndefined();
    expect(interpolateHr(samples, 25)).toBeUndefined();
  });
});

describe("mergeHrIntoStrokes", () => {
  it("maps workout time through offset", () => {
    const strokes = [stroke(0), stroke(10), stroke(20)];
    const merged = mergeHrIntoStrokes(strokes, samples, 0);
    expect(merged[0].hr).toBe(100);
    expect(merged[1].hr).toBe(120);
    expect(merged[2].hr).toBe(140);
  });
  it("applies positive offset (watch started before erg)", () => {
    const merged = mergeHrIntoStrokes([stroke(0)], samples, 10);
    expect(merged[0].hr).toBe(120);
  });
});

describe("applyHrImport / stripHrFromDetail", () => {
  const base: WorkoutDetail = {
    id: 1,
    date: "2026-01-01",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: true,
    strokes: [stroke(0), stroke(10)],
    splits: [],
    isInterval: false,
  };

  it("sets summary fields from merged strokes", () => {
    const out = applyHrImport(base, samples, 0);
    expect(out.heartRateAvg).toBeGreaterThan(0);
    expect(out.hrMin).toBe(100);
    expect(out.strokes[0].hr).toBe(100);
  });

  it("strip removes hr", () => {
    const merged = applyHrImport(base, samples, 0);
    const stripped = stripHrFromDetail(merged);
    expect(stripped.heartRateAvg).toBeUndefined();
    expect(stripped.strokes.every((s) => s.hr == null)).toBe(true);
  });
});

describe("validateHrSamples", () => {
  it("rejects fewer than two samples", () => {
    expect(() => validateHrSamples([{ t: 0, hr: 100 }])).toThrow("too_few_samples");
  });
});

describe("summarizeHr", () => {
  it("computes avg min max", () => {
    expect(summarizeHr([stroke(0, 100), stroke(1, 120)])).toEqual({
      avg: 110,
      min: 100,
      max: 120,
    });
  });
});

describe("previewMergedAvgHr / strokesHaveHr", () => {
  it("returns the merged average before applying the overlay", () => {
    expect(previewMergedAvgHr([stroke(0), stroke(10), stroke(20)], samples, 0)).toBe(120);
  });

  it("detects whether any stroke already carries HR", () => {
    expect(strokesHaveHr([stroke(0), stroke(1, 110)])).toBe(true);
    expect(strokesHaveHr([stroke(0), stroke(1)])).toBe(false);
    expect(strokesHaveHr([stroke(0, 0)])).toBe(false);
  });
});

describe("hr overlay storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips overlay samples keyed by workout id", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });

    expect(hrOverlayStorageKey(42)).toBe("rowplay:hr-import:42");
    writeHrOverlay(42, { samples, offset: 5 });
    expect(readHrOverlay(42)).toEqual({ samples, offset: 5 });
    clearHrOverlay(42);
    expect(readHrOverlay(42)).toBeNull();
  });

  it("returns null for missing, empty, or corrupt overlay JSON", () => {
    const store = new Map<string, string>([
      ["rowplay:hr-import:1", "not-json"],
      ["rowplay:hr-import:2", JSON.stringify({ samples: [], offset: 0 })],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
    });
    expect(readHrOverlay(1)).toBeNull();
    expect(readHrOverlay(2)).toBeNull();
    expect(readHrOverlay(99)).toBeNull();
  });
});
