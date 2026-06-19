import type { Stroke, WorkoutDetail } from "./types";
import { parseWorkoutFile } from "./replay/sources";
import { safeStorage } from "./safeStorage";

/** One heart-rate sample on the import file's elapsed-time axis (seconds). */
export interface HrSample {
  t: number;
  hr: number;
}

const MIN_SAMPLES = 2;

/** Samples with valid bpm, sorted by time. */
export function extractHrSeries(strokes: Stroke[]): HrSample[] {
  return strokes
    .filter((s) => s.hr != null && s.hr > 0 && isFinite(s.t))
    .map((s) => ({ t: s.t, hr: s.hr! }))
    .sort((a, b) => a.t - b.t);
}

/** Linear HR at `fileTime` (seconds on import timeline); undefined outside range. */
export function interpolateHr(samples: HrSample[], fileTime: number): number | undefined {
  if (!samples.length || !isFinite(fileTime)) return undefined;
  if (fileTime < samples[0].t || fileTime > samples[samples.length - 1].t) return undefined;
  if (fileTime === samples[0].t) return samples[0].hr;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= fileTime) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  if (a.t === b.t) return a.hr;
  const frac = (fileTime - a.t) / (b.t - a.t);
  return a.hr + frac * (b.hr - a.hr);
}

/**
 * Map workout elapsed time `t` to imported HR at file time `t + offsetSec`.
 */
export function mergeHrIntoStrokes(
  strokes: Stroke[],
  samples: HrSample[],
  offsetSec: number,
): Stroke[] {
  if (!samples.length) return strokes;
  return strokes.map((s) => {
    const hr = interpolateHr(samples, s.t + offsetSec);
    if (hr == null || !isFinite(hr)) return s;
    return { ...s, hr: Math.round(hr) };
  });
}

export function summarizeHr(strokes: Stroke[]): {
  avg?: number;
  min?: number;
  max?: number;
} {
  // Bolt: Single-pass loop to avoid multiple intermediate arrays and closures from .map(), .filter() and .reduce() chains.
  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < strokes.length; i++) {
    const h = strokes[i].hr;
    if (h != null && h > 0) {
      sum += h;
      count++;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  if (count === 0) return {};

  return {
    avg: Math.round(sum / count),
    min,
    max,
  };
}

/** True when any stroke carries logbook or merged HR. */
export function strokesHaveHr(strokes: Stroke[]): boolean {
  return strokes.some((s) => s.hr != null && s.hr > 0);
}

export function applyHrImport(
  detail: WorkoutDetail,
  samples: HrSample[],
  offsetSec: number,
): WorkoutDetail {
  const strokes = mergeHrIntoStrokes(detail.strokes, samples, offsetSec);
  const { avg, min, max } = summarizeHr(strokes);

  let cumulativeDistance = 0;
  let strokeIdx = 0; // Sliding window pointer for strokes

  // Bolt: Use sliding window over sequential strokes to prevent intermediate .filter().map().filter().reduce() array allocations.
  const splits = detail.splits.map((split) => {
    const startD = cumulativeDistance;
    cumulativeDistance += split.distance;
    const endD = cumulativeDistance;

    let sumHr = 0;
    let countHr = 0;

    // Advance strokeIdx to start of this split
    while (strokeIdx < strokes.length && strokes[strokeIdx].d <= startD) {
      strokeIdx++;
    }

    // Process strokes within this split
    let j = strokeIdx;
    while (j < strokes.length && strokes[j].d <= endD) {
      const hr = strokes[j].hr;
      if (hr != null && hr > 0) {
        sumHr += hr;
        countHr++;
      }
      j++;
    }

    if (countHr === 0) return split;
    return { ...split, hr: Math.round(sumHr / countHr) };
  });

  return {
    ...detail,
    strokes,
    splits,
    heartRateAvg: avg,
    hrMin: min,
    hrMax: max,
  };
}

/** Remove HR from strokes, splits, and summary fields (restore pre-import state). */
export function stripHrFromDetail(detail: WorkoutDetail): WorkoutDetail {
  const strokes = detail.strokes.map(({ hr: _hr, ...rest }) => rest);
  const splits = detail.splits.map(({ hr: _hr, ...rest }) => rest);
  const { heartRateAvg: _a, hrMin: _min, hrMax: _max, ...rest } = detail;
  return { ...rest, strokes, splits };
}

export function validateHrSamples(samples: HrSample[]): void {
  if (samples.length < MIN_SAMPLES) {
    throw new Error("too_few_samples");
  }
}

/** Parse a device export and return HR samples only. */
export async function parseHrFile(file: File): Promise<{ samples: HrSample[]; name: string }> {
  const { strokes, name } = await parseWorkoutFile(file);
  const samples = extractHrSeries(strokes);
  validateHrSamples(samples);
  return { samples, name };
}

export function previewMergedAvgHr(
  strokes: Stroke[],
  samples: HrSample[],
  offsetSec: number,
): number | undefined {
  return summarizeHr(mergeHrIntoStrokes(strokes, samples, offsetSec)).avg;
}

/** Demo/local overlay persistence key. */
export function hrOverlayStorageKey(workoutId: number): string {
  return `rowplay:hr-import:${workoutId}`;
}

export interface HrOverlay {
  samples: HrSample[];
  offset: number;
}

export function readHrOverlay(workoutId: number): HrOverlay | null {
  try {
    const raw = safeStorage.getItem(hrOverlayStorageKey(workoutId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HrOverlay;
    if (!parsed?.samples?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHrOverlay(workoutId: number, overlay: HrOverlay): void {
  safeStorage.setItem(hrOverlayStorageKey(workoutId), JSON.stringify(overlay));
}

export function clearHrOverlay(workoutId: number): void {
  safeStorage.removeItem(hrOverlayStorageKey(workoutId));
}
