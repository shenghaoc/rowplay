import { intervalBreakdown } from "$lib/analytics";
import { paceToWattsForSport } from "$lib/format";
import type { Split, Sport, Stroke, WorkoutDetail } from "$lib/types";

export type WorkoutMomentKind =
  | "best-sustained"
  | "slower-patch"
  | "efficient-rhythm"
  | "finish-trend"
  | "best-rep"
  | "slowest-rep";

export interface WorkoutMoment {
  id: string;
  kind: WorkoutMomentKind;
  startTime: number;
  endTime: number;
  startDistance: number;
  endDistance: number;
  avgPace: number;
  avgWatts: number;
  avgSpm: number;
  avgHr?: number;
  dps?: number;
  deltaPct?: number;
  reasonKey: string;
  reasonParams: Record<string, string | number>;
}

export interface WorkoutMomentReport {
  baselinePace: number;
  lowResolution: boolean;
  moments: WorkoutMoment[];
}

interface WindowStats {
  start: Stroke;
  end: Stroke;
  avgPace: number;
  avgWatts: number;
  avgSpm: number;
  avgHr?: number;
  dps: number;
}

const MIN_WINDOW_SECONDS = 20;
const SLOWER_THRESHOLD_PCT = 2;
const EFFICIENT_PACE_ALLOWANCE_PCT = 1.5;
/** Gap (s) between consecutive valid samples that signals a rest period. */
const REST_GAP_SECONDS = 30;

export function analyzeWorkoutMoments(detail: WorkoutDetail): WorkoutMomentReport {
  const lowResolution = detail.hasStrokeData === false;
  const samples = validWorkSamples(detail.strokes);
  const windows = buildRollingWindows(samples, detail.time >= 75 ? 60 : 30);
  const fallbackWindows = windows.length ? windows : buildRollingWindows(samples, 30);
  const baselinePace = median(fallbackWindows.map((w) => w.avgPace)) || detail.pace || 0;
  const moments: WorkoutMoment[] = [];

  const best = minBy(fallbackWindows, (w) => w.avgPace);
  if (best) {
    moments.push(
      toMoment("best-sustained", best, baselinePace, "replay.moments.reasonBestSustained"),
    );
  }

  const slower = maxBy(fallbackWindows, (w) => w.avgPace);
  if (
    slower &&
    baselinePace > 0 &&
    pctDelta(slower.avgPace, baselinePace) >= SLOWER_THRESHOLD_PCT
  ) {
    moments.push(
      toMoment("slower-patch", slower, baselinePace, "replay.moments.reasonSlowerPatch"),
    );
  }

  const avgSpm = average(samples.map((s) => s.spm).filter((v) => v > 0));
  const efficient = minBy(
    fallbackWindows.filter(
      (w) =>
        w.avgSpm > 0 &&
        avgSpm > 0 &&
        w.avgSpm <= avgSpm + 0.5 &&
        (baselinePace <= 0 || w.avgPace <= baselinePace * (1 + EFFICIENT_PACE_ALLOWANCE_PCT / 100)),
    ),
    (w) => w.avgPace,
  );
  if (efficient && efficient !== best) {
    moments.push(
      toMoment("efficient-rhythm", efficient, baselinePace, "replay.moments.reasonEfficientRhythm"),
    );
  }

  const finish = finishTrend(samples, baselinePace);
  if (finish) moments.push(finish);

  for (const rep of repMoments(detail)) moments.push(rep);

  return { baselinePace, lowResolution, moments: dedupeMoments(moments).slice(0, 6) };
}

function validWorkSamples(strokes: Stroke[]): Stroke[] {
  const out: Stroke[] = [];
  let prev: Stroke | undefined;
  for (const s of strokes) {
    if (s.t < 0 || s.d < 0 || s.pace <= 0) continue;
    if (prev && (s.t <= prev.t || s.d < prev.d)) continue;
    out.push(s);
    prev = s;
  }
  return out;
}

function buildRollingWindows(samples: Stroke[], targetSeconds: number): WindowStats[] {
  const out: WindowStats[] = [];
  let end = 0;
  const fullLength =
    samples.length > 0 && samples[samples.length - 1].t - samples[0].t >= targetSeconds;
  for (let start = 0; start < samples.length; start++) {
    // Reset end when a time gap (rest period) is detected between consecutive samples.
    if (end < start) end = start;
    while (
      end + 1 < samples.length &&
      samples[end].t - samples[start].t < targetSeconds &&
      samples[end + 1].t - samples[end].t <= REST_GAP_SECONDS
    )
      end++;
    const a = samples[start];
    const b = samples[end];
    const elapsed = b.t - a.t;
    const distance = b.d - a.d;
    if (distance > 0 && (fullLength ? elapsed >= targetSeconds : elapsed >= MIN_WINDOW_SECONDS))
      out.push(windowStats(samples, start, end));
  }
  return out;
}

function windowStats(samples: Stroke[], startIdx: number, endIdx: number): WindowStats {
  const bucket = samples.slice(startIdx, endIdx + 1);
  const start = bucket[0];
  const end = bucket[bucket.length - 1];
  const elapsed = end.t - start.t;
  const distance = end.d - start.d;
  const hr = bucket.map((s) => s.hr).filter((v): v is number => v != null && v > 0);
  return {
    start,
    end,
    avgPace: (elapsed / distance) * 500,
    avgWatts: average(bucket.map((s) => s.watts).filter((v) => v > 0)),
    avgSpm: average(bucket.map((s) => s.spm).filter((v) => v > 0)),
    avgHr: hr.length ? Math.round(average(hr)) : undefined,
    dps: distance / Math.max(1, bucket.length - 1),
  };
}

function finishTrend(samples: Stroke[], baselinePace: number): WorkoutMoment | null {
  if (samples.length < 6) return null;
  const total = samples[samples.length - 1].t - samples[0].t;
  if (total < 90) return null;
  const third = total / 3;
  const first = segmentPace(samples, samples[0].t, samples[0].t + third);
  const lastStart = samples[samples.length - 1].t - third;
  const last = segmentPace(samples, lastStart, samples[samples.length - 1].t);
  if (!first || !last) return null;
  const deltaPct = pctDelta(last.avgPace, first.avgPace);
  const reasonKey =
    deltaPct < -1
      ? "replay.moments.reasonFinishStronger"
      : deltaPct > 1
        ? "replay.moments.reasonFinishFade"
        : "replay.moments.reasonFinishSteady";
  return toMoment("finish-trend", last, baselinePace || first.avgPace, reasonKey, deltaPct);
}

function segmentPace(samples: Stroke[], startTime: number, endTime: number): WindowStats | null {
  const firstIdx = samples.findIndex((s) => s.t >= startTime);
  let lastIdx = -1;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].t <= endTime) {
      lastIdx = i;
      break;
    }
  }
  if (firstIdx < 0 || lastIdx <= firstIdx) return null;
  const distance = samples[lastIdx].d - samples[firstIdx].d;
  if (distance <= 0) return null;
  return windowStats(samples, firstIdx, lastIdx);
}

function repMoments(detail: WorkoutDetail): WorkoutMoment[] {
  const workSplits = detail.splits.filter(
    (s) => !s.isRest && s.time > 0 && s.distance > 0 && s.pace > 0,
  );
  if (!detail.isInterval || workSplits.length < 2) return [];
  const set = intervalBreakdown(workSplits, detail.strokes);
  if (!set || detail.strokes.length === 0) return [];
  const moments: WorkoutMoment[] = [];

  // Build edges from stroke timestamps so seek times match the replay clock.
  // Per-stroke data is normalised to work-only time (mapStrokes offsets each
  // rep from the previous end, skipping rest). Synth strokes include rest in
  // their timeline. Accumulate time in the matching base so we find the right
  // stroke range for each work split.
  const edges: {
    startTime: number;
    endTime: number;
    startDistance: number;
    endDistance: number;
  }[] = [];
  let strokeIdx = 0;
  let cumTime = 0;
  let cumDist = 0;
  const last = detail.strokes.length - 1;
  for (const s of detail.splits) {
    const isWork = !s.isRest && s.time > 0 && s.distance > 0 && s.pace > 0;
    if (isWork) {
      while (strokeIdx < detail.strokes.length && detail.strokes[strokeIdx].t < cumTime)
        strokeIdx++;
      const startIdx = Math.min(strokeIdx, last);
      const splitEndTime = cumTime + s.time;
      let endIdx = startIdx;
      for (let j = startIdx; j < detail.strokes.length; j++) {
        if (detail.strokes[j].t <= splitEndTime) endIdx = j;
        else break;
      }
      edges.push({
        startTime: detail.strokes[startIdx].t,
        endTime: detail.strokes[endIdx].t,
        startDistance: cumDist,
        endDistance: cumDist + s.distance,
      });
      cumTime += s.time;
    } else if (!detail.hasStrokeData) {
      // Synth strokes include rest in their timeline
      cumTime += s.time;
    }
    cumDist += s.distance;
  }

  for (const rep of set.reps) {
    if (!rep.isFastest && !rep.isSlowest) continue;
    const split = workSplits[rep.index];
    const edge = edges[rep.index];
    if (!edge) continue;
    moments.push({
      id: rep.isFastest ? "best-rep" : "slowest-rep",
      kind: rep.isFastest ? "best-rep" : "slowest-rep",
      startTime: edge.startTime,
      endTime: edge.endTime,
      startDistance: edge.startDistance,
      endDistance: edge.endDistance,
      avgPace: rep.pace,
      avgWatts: splitWatts(split, detail.sport),
      avgSpm: rep.spm,
      avgHr: rep.hr,
      dps: rep.dps,
      deltaPct: set.avgPace > 0 ? pctDelta(rep.pace, set.avgPace) : undefined,
      reasonKey: rep.isFastest ? "replay.moments.reasonBestRep" : "replay.moments.reasonSlowestRep",
      reasonParams: { rep: rep.index + 1, delta: Math.abs(rep.vsAverage).toFixed(1) },
    });
  }
  return moments;
}

function toMoment(
  kind: WorkoutMomentKind,
  w: WindowStats,
  baselinePace: number,
  reasonKey: string,
  overrideDelta?: number,
): WorkoutMoment {
  const delta = overrideDelta ?? (baselinePace > 0 ? pctDelta(w.avgPace, baselinePace) : undefined);
  return {
    id: kind,
    kind,
    startTime: w.start.t,
    endTime: w.end.t,
    startDistance: w.start.d,
    endDistance: w.end.d,
    avgPace: w.avgPace,
    avgWatts: w.avgWatts,
    avgSpm: w.avgSpm,
    avgHr: w.avgHr,
    dps: w.dps,
    deltaPct: delta,
    reasonKey,
    reasonParams: { delta: Math.abs(delta ?? 0).toFixed(1) },
  };
}

function dedupeMoments(moments: WorkoutMoment[]): WorkoutMoment[] {
  const seen = new Set<string>();
  return moments.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function splitWatts(split: Split, sport: Sport): number {
  return split.pace > 0 ? paceToWattsForSport(sport, split.pace) : 0;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function minBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (Number.isFinite(s) && s < bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function maxBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (Number.isFinite(s) && s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function pctDelta(value: number, baseline: number): number {
  return baseline > 0 ? ((value - baseline) / baseline) * 100 : 0;
}
