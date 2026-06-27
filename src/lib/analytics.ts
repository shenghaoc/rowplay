import type { Split, Sport, Stroke, Workout, WorkoutDetail } from "./types";
import { challengeDistanceMetres, paceToWattsForSport, wattsToPaceForSport } from "./format";
import { dayKeyEpochMillis, todayKeyForTz, todayKeyUtc, workoutLocalDayKey } from "./datetime";

// ---------------------------------------------------------------------------
// Pure analysis helpers. No DOM, no Svelte — safe to use on server or client,
// and easy to unit test.
// ---------------------------------------------------------------------------

export interface TrendFit {
  /** Slope in y-units per day. */
  slopePerDay: number;
  /** Predicted y at the first and last x (epoch ms) — the fit line endpoints. */
  y0: number;
  y1: number;
  /** Total change implied by the fit across the whole span. */
  delta: number;
  n: number;
}

/**
 * Ordinary least-squares fit of `points` (x = epoch ms, y = metric). Returns
 * null if there aren't enough points or there's no time span. Used to draw a
 * trend line and produce an "improving / flat / slowing" verdict.
 */
export function linearTrend(points: { x: number; y: number }[]): TrendFit | null {
  const n = points.length;
  if (n < 2) return null;
  // Bolt: Single-pass loop to find min, avoiding map and Math.min spread risk.
  let xMin = points[0].x;
  for (let i = 1; i < n; i++) {
    if (points[i].x < xMin) {
      xMin = points[i].x;
    }
  }
  // Work in days from the first point to keep the slope human-readable.
  let sumX = 0;
  let sumY = 0;
  let xLast = -Infinity;
  for (let i = 0; i < n; i++) {
    const xDays = (points[i].x - xMin) / 86_400_000;
    sumX += xDays;
    sumY += points[i].y;
    if (xDays > xLast) xLast = xDays;
  }
  const mx = sumX / n;
  const my = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const xDays = (points[i].x - xMin) / 86_400_000;
    num += (xDays - mx) * (points[i].y - my);
    den += (xDays - mx) ** 2;
  }
  if (den === 0) return null; // all on the same day
  const slope = num / den;
  const intercept = my - slope * mx;
  const y0 = intercept;
  const y1 = intercept + slope * xLast;
  return { slopePerDay: slope, y0, y1, delta: y1 - y0, n };
}

export interface DistanceBand {
  /** Stable key, e.g. "2000". */
  key: string;
  label: string;
  /** Nominal distance in metres (for sorting). */
  nominal: number;
}

/**
 * Bucket a workout distance into a like-for-like band so we compare 2k-to-2k
 * rather than a sprint against a 5k. Standard erg distances get a tight ±6%
 * window; anything else falls into a coarse range band.
 */
export function distanceBand(metres: number): DistanceBand {
  const standards = [
    { d: 100, l: "100m" },
    { d: 500, l: "500m" },
    { d: 1000, l: "1k" },
    { d: 2000, l: "2k" },
    { d: 5000, l: "5k" },
    { d: 6000, l: "6k" },
    { d: 10000, l: "10k" },
    { d: 21097, l: "Half" },
    { d: 42195, l: "Full" },
  ];
  for (const s of standards) {
    if (Math.abs(metres - s.d) <= s.d * 0.06) {
      return { key: String(s.d), label: s.l, nominal: s.d };
    }
  }
  // Coarse fallback ranges for non-standard pieces.
  const ranges: [number, number, string][] = [
    [0, 750, "<750m"],
    [750, 1500, "750m–1.5k"],
    [1500, 3000, "1.5k–3k"],
    [3000, 7000, "3k–7k"],
    [7000, 15000, "7k–15k"],
    [15000, Infinity, "15k+"],
  ];
  for (const [lo, hi, l] of ranges) {
    if (metres >= lo && metres < hi)
      return { key: `r${lo}`, label: l, nominal: (lo + Math.min(hi, lo * 2)) / 2 };
  }
  return { key: "other", label: "Other", nominal: metres };
}

export interface DurationBand {
  /** Stable key, e.g. "1800". */
  key: string;
  label: string;
  /** Nominal duration in seconds (for sorting). */
  nominal: number;
}

/**
 * Bucket a workout duration into a like-for-like band so 30min-vs-30min
 * compares correctly and a 20min piece is not raced against a 60min piece.
 * Mirrors `distanceBand` for fixed-time pieces.
 */
export function durationBand(seconds: number): DurationBand {
  const standards = [
    { s: 60, l: "1 min" },
    { s: 240, l: "4 min" },
    { s: 1200, l: "20 min" },
    { s: 1800, l: "30 min" },
    { s: 3600, l: "60 min" },
  ];
  for (const t of standards) {
    if (Math.abs(seconds - t.s) <= t.s * 0.1) {
      return { key: String(t.s), label: t.l, nominal: t.s };
    }
  }
  const ranges: [number, number, string][] = [
    [0, 90, "<90s"],
    [90, 360, "90s–6m"],
    [360, 900, "6–15m"],
    [900, 2400, "15–40m"],
    [2400, 4800, "40–80m"],
    [4800, Infinity, "80m+"],
  ];
  for (const [lo, hi, l] of ranges) {
    if (seconds >= lo && seconds < hi) {
      // For the lowest band lo === 0, so Math.min(hi, lo*2) would be 0 and the
      // nominal would collapse to 0 — use hi as the upper bound in that case.
      const upper = lo === 0 ? hi : Math.min(hi, lo * 2);
      return { key: `r${lo}`, label: l, nominal: (lo + upper) / 2 };
    }
  }
  return { key: "other", label: "Other", nominal: seconds };
}

export interface SportSummary {
  sport: Sport;
  sessions: number;
  distance: number;
  time: number;
  /** Distance-weighted average pace (sec/500m). */
  avgPace: number;
  /** Best (lowest) average pace across this sport's sessions. */
  bestPace: number;
  longest: number;
}

export function summariseBySport(workouts: Workout[]): SportSummary[] {
  const by = new Map<Sport, Workout[]>();
  for (const w of workouts) {
    const arr = by.get(w.sport) ?? [];
    arr.push(w);
    by.set(w.sport, arr);
  }
  const out: SportSummary[] = [];
  for (const [sport, ws] of by) {
    let distance = 0;
    let time = 0;
    let bestPace = Infinity;
    let longest = -Infinity;
    for (const w of ws) {
      distance += w.distance;
      time += w.time;
      if (w.pace > 0 && w.pace < bestPace) bestPace = w.pace;
      if (w.distance > longest) longest = w.distance;
    }
    const avgPace = distance > 0 ? time / (distance / 500) : 0;
    out.push({ sport, sessions: ws.length, distance, time, avgPace, bestPace, longest });
  }
  return out.sort((a, b) => b.distance - a.distance);
}

export interface PersonalBest {
  label: string;
  value: string;
  sub?: string;
}

/** Standard erg distances we track records for, in metres. */
const STANDARD_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097];

/**
 * Fastest time for each standard distance the athlete has actually completed,
 * within ~2% so a "2000m" piece logged as 2003m still counts.
 */
export function distancePBs(
  workouts: Workout[],
): { distance: number; time: number; pace: number; date: string; sport: Sport }[] {
  const out: { distance: number; time: number; pace: number; date: string; sport: Sport }[] = [];
  const bySport = new Map<string, Workout[]>();
  for (let i = 0, len = workouts.length; i < len; i++) {
    const w = workouts[i];
    const arr = bySport.get(w.sport);
    if (arr) {
      arr.push(w);
    } else {
      bySport.set(w.sport, [w]);
    }
  }

  for (const sportWorkouts of bySport.values()) {
    for (let i = 0, dlen = STANDARD_DISTANCES.length; i < dlen; i++) {
      const target = STANDARD_DISTANCES[i];
      let best: Workout | null = null;
      let minTime = Infinity;
      const t02 = target * 0.02;

      for (let j = 0, slen = sportWorkouts.length; j < slen; j++) {
        const w = sportWorkouts[j];
        if (w.time > 0 && Math.abs(w.distance - target) <= t02) {
          if (w.time < minTime) {
            best = w;
            minTime = w.time;
          }
        }
      }

      if (best !== null) {
        out.push({
          distance: target,
          time: best.time,
          pace: best.pace,
          date: best.date,
          sport: best.sport,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-workout (stroke-level) analysis
// ---------------------------------------------------------------------------

export interface HrZone {
  /** 1-5. The display name (i18n `replay.zone{n}`) and colour (CSS `--zone-{n}`)
   *  are both resolved at the presentation layer, keyed off this number. */
  zone: number;
  min: number;
  max: number;
  seconds: number;
  fraction: number;
}

/** Karvonen-style zone boundaries as fractions of `maxHr` (zones 1–5). */
const HR_ZONE_FRACTIONS = [0, 0.6, 0.7, 0.8, 0.9, 1.2];

/**
 * Estimate `maxHr`: use the supplied value, else infer it from the workout's
 * peak heart rate (assuming the peak is ~95% of true max), floored at 160.
 */
export function estimateHrMax(strokes: Stroke[], maxHr?: number): number {
  if (maxHr && maxHr > 0) return maxHr;
  // Bolt: Reduced to a single-pass for loop avoiding array allocations and Max Call Stack size exceeded risk of Math.max(...array)
  let peak = 0;
  for (let i = 0; i < strokes.length; i++) {
    const hr = strokes[i].hr ?? 0;
    if (hr > peak) peak = hr;
  }
  return Math.max(peak / 0.95, 160);
}

/**
 * Map a heart rate to a Concept2-style zone index (0–5), using the same
 * boundaries as `hrZones`. Zone 0 is below 60% of max; zone 5 is the top band.
 */
export function hrZoneOf(hr: number, hrMax: number): number {
  if (hrMax <= 0 || !hrMax || hr <= 0) return 0;
  const bounds = HR_ZONE_FRACTIONS.map((f) => f * hrMax);
  for (let b = 1; b < bounds.length; b++) {
    if (hr >= bounds[b - 1] && hr < bounds[b]) return b - 1;
  }
  return 5;
}

/**
 * Time-in-zone distribution. Zones are defined as percentages of `maxHr`
 * (Karvonen-style boundaries: 60/70/80/90%). If `maxHr` is omitted we estimate
 * it from the workout's peak heart rate.
 */
export function hrZones(strokes: Stroke[], maxHr?: number): HrZone[] {
  const hrMax = estimateHrMax(strokes, maxHr);

  const bounds = HR_ZONE_FRACTIONS.map((f) => f * hrMax);
  const seconds = [0, 0, 0, 0, 0];

  for (let i = 1; i < strokes.length; i++) {
    const dt = strokes[i].t - strokes[i - 1].t;
    const hr = strokes[i].hr;
    if (hr == null || dt <= 0) continue;
    let z = 0;
    for (let b = 1; b < bounds.length; b++) {
      if (hr >= bounds[b - 1] && hr < bounds[b]) {
        z = b - 1;
        break;
      }
      if (b === bounds.length - 1) z = 4;
    }
    seconds[z] += dt;
  }

  const total = seconds.reduce((a, b) => a + b, 0) || 1;
  return seconds.map((sec, i) => ({
    zone: i + 1,
    min: Math.round(bounds[i]),
    max: i < 4 ? Math.round(bounds[i + 1]) : Infinity,
    seconds: sec,
    fraction: sec / total,
  }));
}

// ---------------------------------------------------------------------------
// Stroke-quality / technique analysis
//
// The logbook exposes pace, stroke-rate, distance and heart-rate per stroke —
// not the PM5 force curve (that lives on the monitor over BLE). But for a
// heavyweight chasing pace, *distance-per-stroke* is the real lever: holding a
// pace at a lower rate means a more powerful, more efficient stroke. These
// helpers turn the logged signal into coachable technique metrics.
// ---------------------------------------------------------------------------

/** Distance per stroke (metres) implied by a pace (sec/500m) and rate (spm). */
export function distancePerStroke(pace: number, spm: number): number {
  if (pace <= 0 || spm <= 0) return 0;
  const speed = 500 / pace; // m/s
  const strokesPerSec = spm / 60;
  return speed / strokesPerSec;
}

export interface EfficiencyDriftResult {
  /** Valid DPS points only; t = stroke time in seconds. */
  series: { t: number; dps: number }[];
  /** Mean DPS over the opening segment. 0 when insufficient data. */
  baseline: number;
  /** Distance at which the opening segment closes (metres). */
  baselineEndD: number;
  /** Closing-segment mean DPS minus baseline (negative = fade). */
  fadeDelta: number;
  /** fadeDelta / baseline × 100, or 0 when baseline is 0. */
  fadePercent: number;
}

const EMPTY_DRIFT: EfficiencyDriftResult = {
  series: [],
  baseline: 0,
  baselineEndD: 0,
  fadeDelta: 0,
  fadePercent: 0,
};

function openingSegmentThreshold(totalDistance: number): number {
  return totalDistance < 5000 ? totalDistance * 0.1 : 500;
}

/** Mean DPS over strokes from the piece start until the distance threshold (min 5). */
function openingSegment(
  valid: { stroke: Stroke; dps: number }[],
  threshold: number,
): { strokes: { stroke: Stroke; dps: number }[]; endD: number } {
  const minCount = 5;
  // Measure the opening span from the FIRST valid stroke, mirroring how
  // closingSegment measures span from the end. Using absolute cumulative
  // distance here would collapse the opening to the min-5 floor whenever
  // leading strokes are invalid and the first valid stroke already sits past
  // the threshold (e.g. d = 700 m on a long piece).
  const firstD = valid[0]!.stroke.d;
  let endIdx = Math.min(minCount - 1, valid.length - 1);
  for (let i = 0; i < valid.length; i++) {
    endIdx = i;
    if (valid[i]!.stroke.d - firstD >= threshold && i >= minCount - 1) break;
  }
  const strokes = valid.slice(0, endIdx + 1);
  return { strokes, endD: strokes[strokes.length - 1]!.stroke.d };
}

/** Mean DPS over strokes from the piece end until the distance threshold (min 5). */
function closingSegment(
  valid: { stroke: Stroke; dps: number }[],
  threshold: number,
): { stroke: Stroke; dps: number }[] {
  const totalD = valid[valid.length - 1]!.stroke.d;
  const minCount = 5;
  let startIdx = 0;
  for (let i = valid.length - 1; i >= 0; i--) {
    startIdx = i;
    const spanFromEnd = totalD - valid[i]!.stroke.d;
    if (spanFromEnd >= threshold && valid.length - i >= minCount) break;
  }
  return valid.slice(startIdx);
}

/**
 * Within-piece DPS drift: opening-segment baseline, full valid series, and
 * closing-vs-opening fade summary. Pure; no DOM.
 */
export function efficiencyDrift(strokes: Stroke[]): EfficiencyDriftResult {
  const valid: { stroke: Stroke; dps: number }[] = [];
  for (const s of strokes) {
    const dps = distancePerStroke(s.pace, s.spm);
    if (dps > 0) valid.push({ stroke: s, dps });
  }
  if (valid.length < 5) return { ...EMPTY_DRIFT };

  const series = valid.map(({ stroke: s, dps }) => ({ t: s.t, dps }));
  const totalD = valid[valid.length - 1]!.stroke.d;
  const threshold = openingSegmentThreshold(totalD);

  const opening = openingSegment(valid, threshold);
  const closing = closingSegment(valid, threshold);
  const baseline = mean(opening.strokes.map((x) => x.dps));
  const closingMean = mean(closing.map((x) => x.dps));
  const fadeDelta = closingMean - baseline;
  const fadePercent = baseline > 0 ? (fadeDelta / baseline) * 100 : 0;

  return {
    series,
    baseline,
    baselineEndD: opening.endD,
    fadeDelta,
    fadePercent,
  };
}

export interface TechniqueSummary {
  /** Distance-per-stroke timeline, aligned to stroke time `t`. */
  dps: { t: number; v: number }[];
  avgDps: number;
  /** Coefficient of variation of pace (%). Lower = smoother, more even. */
  paceConsistency: number;
  /**
   * Fade: how much pace drifts from the first third to the last third of the
   * piece, as a % (positive = slowed down, negative = negative split).
   */
  fade: number;
  avgSpm: number;
}

export function techniqueSummary(strokes: Stroke[]): TechniqueSummary {
  let n = 0;
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (s.pace > 0 && s.spm > 0) {
      n++;
    }
  }

  // Preallocated; every slot is filled by the valid-stroke loop below.
  const dps = Array.from<{ t: number; v: number }>({ length: n });
  const third = n >= 6 ? Math.floor(n / 3) : 0;
  let sumDps = 0,
    sumSpm = 0,
    sumPace = 0,
    meanPace = 0,
    paceM2 = 0,
    firstSum = 0,
    lastSum = 0;
  let validIndex = 0;

  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (!(s.pace > 0 && s.spm > 0)) continue;
    const v = distancePerStroke(s.pace, s.spm);
    dps[validIndex] = { t: s.t, v };
    sumDps += v;
    sumSpm += s.spm;
    sumPace += s.pace;

    const paceCount = validIndex + 1;
    const delta = s.pace - meanPace;
    meanPace += delta / paceCount;
    paceM2 += delta * (s.pace - meanPace);

    if (validIndex < third) {
      firstSum += s.pace;
    }
    if (third > 0 && validIndex >= n - third) {
      lastSum += s.pace;
    }
    validIndex++;
  }

  const avgDps = n ? sumDps / n : 0;
  const avgSpm = n ? sumSpm / n : 0;
  const mp = n ? sumPace / n : 0;

  const sd = n ? Math.sqrt(paceM2 / n) : 0;
  const paceConsistency = mp > 0 ? (sd / mp) * 100 : 0;

  // Fade by distance thirds (robust to uneven sampling in time).
  let fade = 0;
  if (third > 0) {
    const firstPace = firstSum / third;
    const lastPace = lastSum / third;
    fade = firstPace > 0 ? ((lastPace - firstPace) / firstPace) * 100 : 0;
  }

  return { dps, avgDps, paceConsistency, fade, avgSpm };
}

export interface EfficiencyPoint {
  spm: number;
  pace: number;
  dps: number;
}

/**
 * Pace-vs-rate efficiency cloud, bucketed by stroke rate. Reveals your most
 * efficient rating band: where you hold the best pace for the rate (highest
 * distance-per-stroke). Each point is the median pace observed at that rate.
 */
export function efficiencyByRate(strokes: Stroke[]): EfficiencyPoint[] {
  const buckets = new Map<number, number[]>();
  for (const s of strokes) {
    if (s.pace <= 0 || s.spm <= 0) continue;
    const r = Math.round(s.spm);
    const arr = buckets.get(r) ?? [];
    arr.push(s.pace);
    buckets.set(r, arr);
  }
  return [...buckets.entries()]
    .filter(([, paces]) => paces.length >= 2) // ignore one-off outliers
    .map(([spm, paces]) => {
      const pace = median(paces);
      return { spm, pace, dps: distancePerStroke(pace, spm) };
    })
    .sort((a, b) => a.spm - b.spm);
}

// ---------------------------------------------------------------------------
// Fitness & Freshness — the Performance Management Chart (PMC)
//
// This is the headline metric many endurance athletes want: "how fit am I, how
// tired am I, and am I ready to perform?". It needs nothing live — just the
// session summaries we already sync. We turn each session into a Training Stress
// Score (TSS) from its average power, then track three exponentially-weighted loads:
//
//   • Fitness (CTL) — a 42-day average: your built-up training base.
//   • Fatigue (ATL) — a 7-day average: recent, fast-decaying tiredness.
//   • Form    (TSB) — Fitness − Fatigue: positive = fresh, negative = loaded.
//
// Power is the logbook's watt-minutes when present (correct per machine), else
// Concept2's pace→watts model. Threshold power (FTP) is the athlete's own —
// estimated from their power-duration envelope with a Critical Power fit, so
// the load is scaled to *their* ability, not a generic number.
// ---------------------------------------------------------------------------

/**
 * Average power (watts) sustained over a whole session. The logbook's
 * watt-minutes are authoritative when present (and correct for every machine).
 * Otherwise derive from normalised sec/500m pace. BikeErg API pace is per 1000m
 * (halved on read for display); the PM cubic uses the 1000m basis, so divide by 8.
 */
export function workoutWatts(w: Workout): number {
  const minutes = w.time / 60;
  if (w.wattMinutes && w.wattMinutes > 0 && minutes > 0) return w.wattMinutes / minutes;
  return paceToWattsForSport(w.sport, w.pace);
}

export interface CriticalPower {
  /** Critical (sustainable) power in watts — the asymptote of the P–t curve. */
  cp: number;
  /** Anaerobic work capacity W′ in joules (0 when only estimated). */
  wPrime: number;
  /** Functional threshold power in watts (≈ CP); used to scale training load. */
  ftp: number;
  /** 'model' = two-parameter CP fit; 'estimate' = best sustained-power fallback. */
  method: "model" | "estimate";
  /** Usable efforts considered after basic sanity filtering. */
  sampleSize: number;
  /** Mean-maximal envelope points used for the CP fit. */
  envelopePoints: number;
  /** Single-sport scope when all usable efforts share one machine; otherwise mixed. */
  sportScope: Sport | "mixed";
  /** Oldest usable effort date, when known. */
  oldestEffortDate?: string;
  /** Newest usable effort date, when known. */
  newestEffortDate?: string;
  /** Plain-language confidence bucket for display. */
  confidence: "high" | "medium" | "low" | "insufficient";
  /** Regression fit quality for model-based fits. */
  fitQuality?: { r2: number; residualPct: number };
  /** Diagnostic warnings for the presentation layer. */
  warnings: CriticalPowerWarning[];
}

export type CriticalPowerWarning =
  | "too-few-efforts"
  | "narrow-duration-range"
  | "stale-efforts"
  | "mixed-sports"
  | "outlier-sensitive"
  | "unrealistic-fit"
  | "estimate-only";

interface CriticalPowerEffort {
  t: number;
  p: number;
  sport: Sport;
  date?: string;
}

interface CriticalPowerOptions {
  /** Date key used for stale-effort diagnostics; defaults to today UTC. */
  asOf?: string;
}

function effortDayMs(date: string | undefined): number | null {
  if (!date) return null;
  const day = date.slice(0, 10);
  const ms = dayKeyEpochMillis(day);
  return Number.isFinite(ms) ? ms : null;
}

function effortDateRange(efforts: CriticalPowerEffort[]): { oldest?: string; newest?: string } {
  let oldestMs = Infinity;
  let newestMs = -Infinity;
  let oldest: string | undefined;
  let newest: string | undefined;
  for (const e of efforts) {
    const ms = effortDayMs(e.date);
    if (ms == null) continue;
    if (ms < oldestMs) {
      oldestMs = ms;
      oldest = e.date!.slice(0, 10);
    }
    if (ms > newestMs) {
      newestMs = ms;
      newest = e.date!.slice(0, 10);
    }
  }
  return { oldest, newest };
}

function effortSportScope(efforts: CriticalPowerEffort[]): Sport | "mixed" {
  const sports = new Set(efforts.map((e) => e.sport));
  return sports.size === 1 ? [...sports][0]! : "mixed";
}

function durationCoverageWarning(efforts: CriticalPowerEffort[]): boolean {
  const bands = new Set<"short" | "medium" | "long">();
  for (const e of efforts) {
    if (e.t >= 120 && e.t < 600) bands.add("short");
    else if (e.t >= 600 && e.t < 1200) bands.add("medium");
    else if (e.t >= 1200 && e.t <= 3600) bands.add("long");
  }
  return bands.size < 3;
}

function baseCpWarnings(
  efforts: CriticalPowerEffort[],
  asOf: string,
  envelopePoints: number,
): CriticalPowerWarning[] {
  const warnings = new Set<CriticalPowerWarning>();
  if (efforts.length < 3 || envelopePoints < 3) warnings.add("too-few-efforts");
  if (durationCoverageWarning(efforts)) warnings.add("narrow-duration-range");
  if (effortSportScope(efforts) === "mixed") warnings.add("mixed-sports");
  const newestMs = efforts.reduce(
    (max, e) => Math.max(max, effortDayMs(e.date) ?? -Infinity),
    -Infinity,
  );
  const asOfMs = dayKeyEpochMillis(asOf);
  if (Number.isFinite(newestMs) && Number.isFinite(asOfMs) && asOfMs - newestMs > 90 * DAY_MS) {
    warnings.add("stale-efforts");
  }
  return [...warnings];
}

function cpConfidence(
  method: CriticalPower["method"],
  sampleSize: number,
  envelopePoints: number,
  warnings: CriticalPowerWarning[],
  fitQuality?: CriticalPower["fitQuality"],
): CriticalPower["confidence"] {
  if (method === "estimate" || warnings.includes("too-few-efforts")) return "insufficient";
  if (
    sampleSize >= 6 &&
    envelopePoints >= 5 &&
    fitQuality &&
    fitQuality.r2 >= 0.9 &&
    warnings.length === 0
  ) {
    return "high";
  }
  if (sampleSize >= 4 && envelopePoints >= 4 && fitQuality && fitQuality.r2 >= 0.75)
    return "medium";
  return "low";
}

function buildCriticalPowerResult(params: {
  cp: number;
  wPrime: number;
  method: CriticalPower["method"];
  efforts: CriticalPowerEffort[];
  envelopePoints: number;
  asOf: string;
  fitQuality?: CriticalPower["fitQuality"];
  extraWarnings?: CriticalPowerWarning[];
}): CriticalPower | null {
  const cp = Math.round(params.cp);
  const wPrime = Math.round(params.wPrime);
  if (!Number.isFinite(cp) || cp <= 0) return null;
  const warnings = new Set<CriticalPowerWarning>(
    baseCpWarnings(params.efforts, params.asOf, params.envelopePoints),
  );
  for (const w of params.extraWarnings ?? []) warnings.add(w);
  if (params.method === "estimate") warnings.add("estimate-only");
  const warningList = [...warnings];
  const range = effortDateRange(params.efforts);
  return {
    cp,
    wPrime,
    ftp: cp,
    method: params.method,
    sampleSize: params.efforts.length,
    envelopePoints: params.envelopePoints,
    sportScope: effortSportScope(params.efforts),
    oldestEffortDate: range.oldest,
    newestEffortDate: range.newest,
    confidence: cpConfidence(
      params.method,
      params.efforts.length,
      params.envelopePoints,
      warningList,
      params.fitQuality,
    ),
    fitQuality: params.fitQuality,
    warnings: warningList,
  };
}

/**
 * Estimate the athlete's threshold power from their own results. Each session
 * is one point on a power–duration curve (best *average* power for that
 * length). The classic two-parameter model says P(t) = CP + W′/t, so a
 * regression of power against 1/time gives CP (intercept) and W′ (slope). Falls
 * back to the best long-effort power when there isn't enough range to fit.
 */
export function estimateCriticalPower(
  workouts: Workout[],
  opts: CriticalPowerOptions = {},
): CriticalPower | null {
  const asOf = opts.asOf ?? todayKeyUtc();
  const fallback = (
    pool: CriticalPowerEffort[],
    extraWarnings: CriticalPowerWarning[] = [],
  ): CriticalPower | null => {
    // Sprints (< 2 min) sit far above threshold, so never let one set FTP.
    const valid: CriticalPowerEffort[] = [];
    let best: CriticalPowerEffort | null = null;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].t >= 120) {
        valid.push(pool[i]);
        if (!best || pool[i].p > best.p) {
          best = pool[i];
        }
      }
    }
    if (!best) return null;
    // Duration-based scaling factor to estimate FTP/CP from a single best effort:
    // - 20+ min: 95%
    // - 10-20 min: 90%
    // - 5-10 min: 80%
    // - 2-5 min: 70%
    let factor = 0.7;
    if (best.t >= 1200) {
      factor = 0.95;
    } else if (best.t >= 600) {
      factor = 0.9;
    } else if (best.t >= 300) {
      factor = 0.8;
    }
    const ftp = Math.round(best.p * factor);
    return buildCriticalPowerResult({
      cp: ftp,
      wPrime: 0,
      method: "estimate",
      efforts: valid,
      envelopePoints: 0,
      asOf,
      extraWarnings,
    });
  };

  const all: CriticalPowerEffort[] = [];
  const pts: CriticalPowerEffort[] = [];
  for (const w of workouts) {
    const t = w.time;
    const p = workoutWatts(w);
    if (t > 0 && p > 0 && p < 2500) {
      const effort = { t, p, sport: w.sport, date: w.date };
      all.push(effort);
      // The CP model is only valid for a few-minutes-to-an-hour range.
      if (t >= 120 && t <= 3600) pts.push(effort);
    }
  }
  if (!all.length) return null;

  if (pts.length < 3) return fallback(all);

  // Mean-maximal envelope: keep only the best power in each (geometric) duration
  // bin so one easy session doesn't drag the fit down.
  const bins = new Map<number, CriticalPowerEffort>();
  for (const q of pts) {
    const key = Math.round(Math.log(q.t) * 4);
    const cur = bins.get(key);
    if (!cur || q.p > cur.p) bins.set(key, q);
  }
  const env = [...bins.values()];
  if (env.length < 3) return fallback(pts);

  const n = env.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += 1 / env[i].t;
    sumY += env[i].p;
  }
  const mx = sumX / n;
  const my = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const x = 1 / env[i].t;
    num += (x - mx) * (env[i].p - my);
    den += (x - mx) ** 2;
  }
  if (den > 0) {
    const wPrime = num / den; // slope, joules
    const cp = my - wPrime * mx; // intercept, watts
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      const x = 1 / env[i].t;
      const fitted = cp + wPrime * x;
      const y = env[i].p;
      ssRes += (y - fitted) ** 2;
      ssTot += (y - my) ** 2;
    }
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
    const residualPct = my > 0 ? (Math.sqrt(ssRes / n) / my) * 100 : Infinity;
    const fitQuality = { r2, residualPct };
    const extraWarnings: CriticalPowerWarning[] = [];
    if (r2 < 0.7 || residualPct > 18) extraWarnings.push("outlier-sensitive");
    if (cp <= 0 || cp >= 700 || wPrime <= 0 || wPrime > 80_000)
      extraWarnings.push("unrealistic-fit");
    if (cp > 0 && cp < 700 && wPrime > 0 && wPrime <= 80_000) {
      return buildCriticalPowerResult({
        cp,
        wPrime,
        method: "model",
        efforts: pts,
        envelopePoints: env.length,
        asOf,
        fitQuality,
        extraWarnings,
      });
    }
    return fallback(pts, extraWarnings);
  }
  return fallback(pts);
}

/** Sustainable average power (watts) for a fixed duration using CP/W′. */
export function powerAtDuration(cp: CriticalPower, durationSec: number): number {
  if (durationSec <= 0 || cp.cp <= 0) return 0;
  return cp.cp + (cp.wPrime > 0 ? cp.wPrime / durationSec : 0);
}

/**
 * Predict the even-split pace (sec/500m normalised) sustainable for `durationSec`
 * from a CP/W′ model. Pass `sport` when the CP envelope is single-sport (e.g. bike
 * needs the 1000m-basis inverse); mixed-sport CP should omit it.
 */
export function predictPaceForDuration(
  cp: CriticalPower,
  durationSec: number,
  sport?: Sport,
): number | null {
  const watts = powerAtDuration(cp, durationSec);
  if (watts <= 0) return null;
  const pace = wattsToPaceForSport(sport, watts);
  return pace > 0 && isFinite(pace) ? pace : null;
}

/**
 * Predict finish time (seconds) for `distanceM` at the best effort the CP model
 * allows — constant-power rowing at the sustainable watts for that duration.
 */
export function predictTimeForDistance(
  cp: CriticalPower,
  distanceM: number,
  sport?: Sport,
): number | null {
  if (isNaN(distanceM) || distanceM <= 0 || cp.cp <= 0) return null;

  const distanceAt = (durationSec: number): number => {
    const pace = wattsToPaceForSport(sport, powerAtDuration(cp, durationSec));
    if (pace <= 0) return 0;
    return (durationSec * 500) / pace;
  };

  let lo = 1;
  let hi = 4 * 3600;
  if (distanceAt(hi) < distanceM) return null;

  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (distanceAt(mid) < distanceM) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Best session-average power at each target duration (mean-maximal envelope). */
export function powerDurationEnvelope(workouts: Workout[]): PowerPoint[] {
  const pts: { t: number; p: number }[] = [];
  for (const w of workouts) {
    const t = w.time;
    const p = workoutWatts(w);
    if (t >= 120 && t <= 3600 && p > 0) pts.push({ t, p });
  }
  const bins = new Map<number, { t: number; p: number }>();
  for (const q of pts) {
    const key = Math.round(Math.log(q.t) * 4);
    const cur = bins.get(key);
    if (!cur || q.p > cur.p) bins.set(key, q);
  }
  return [...bins.values()].sort((a, b) => a.t - b.t).map((q) => ({ duration: q.t, watts: q.p }));
}

export interface PowerDurationComparison {
  /** Shared x-axis durations (seconds), sorted ascending. */
  durations: number[];
  /** Best observed average power at each duration (null when no session nearby). */
  actual: (number | null)[];
  /** CP + W′/t model at each duration. */
  modelled: number[];
}

const PD_DURATIONS = [120, 180, 300, 600, 900, 1200, 1800, 3600] as const;

/**
 * Compare the athlete's session-based power–duration bests to the fitted CP curve.
 */
export function powerDurationComparison(
  workouts: Workout[],
  cp: CriticalPower,
): PowerDurationComparison {
  const env = powerDurationEnvelope(workouts);
  const durations = [...PD_DURATIONS];
  const actual = durations.map((d) => {
    let best: number | null = null;
    for (const e of env) {
      // Session summaries only claim their average for durations near the piece length.
      if (Math.abs(e.duration - d) / d > 0.12) continue;
      if (best == null || e.watts > best) best = e.watts;
    }
    return best;
  });
  const modelled = durations.map((d) => Math.round(powerAtDuration(cp, d)));
  return { durations, actual, modelled };
}

const DAY_MS = 86_400_000;

/** One day on the Performance Management Chart. */
export interface FormPoint {
  /** Epoch ms at UTC midnight for this day. */
  day: number;
  tss: number;
  /** Fitness — Chronic Training Load (42-day). */
  ctl: number;
  /** Fatigue — Acute Training Load (7-day). */
  atl: number;
  /** Form — Training Stress Balance (CTL − ATL). */
  tsb: number;
}

export type FormBand = "transition" | "fresh" | "neutral" | "productive" | "overreaching";

export interface TrainingLoad {
  series: FormPoint[];
  cp: CriticalPower;
  ftp: number;
  /** Latest Fitness / Fatigue / Form. */
  ctl: number;
  atl: number;
  tsb: number;
  /** Fitness change over the trailing 7 days (ramp rate). */
  ramp: number;
  /** Where today's Form sits, for a plain-language read-out. */
  band: FormBand;
}

/** Coggan-style TSS for one session, scaled to the athlete's threshold power. */
function workoutTss(w: Workout, ftp: number): number {
  if (ftp <= 0 || w.time <= 0) return 0;
  const watts = workoutWatts(w);
  if (watts <= 0) return 0;
  // Intensity factor, capped so a noisy all-out sprint can't blow up the load.
  const intensity = Math.min(watts / ftp, 1.6);
  return (w.time / 3600) * intensity * intensity * 100;
}

/**
 * Build the Performance Management Chart from session summaries. Sums each
 * day's TSS (rest days count as zero so fatigue decays), then rolls the two
 * exponentially-weighted loads forward to today. Returns null when there isn't
 * enough power data to anchor a threshold.
 */
export function trainingLoad(
  workouts: Workout[],
  cpIn?: CriticalPower | null,
): TrainingLoad | null {
  const cp = cpIn ?? estimateCriticalPower(workouts);
  if (!cp || cp.ftp <= 0) return null;
  const ftp = cp.ftp;

  // Carry the curve through to today so a recent rest block shows as freshness.
  const today = dayKeyEpochMillis(todayKeyUtc());

  // Sum TSS per calendar day. The PMC/fitness curve intentionally buckets by the
  // UTC date-only key — it is deliberately outside the home-timezone day-bucketing
  // scope (which covers the calendar / heatmap / streak surfaces). A ±1-day shift
  // on a multi-week exponentially-weighted curve is immaterial, and keeping it
  // tz-free avoids threading homeTz through this hot loop. We also clamp to a sane
  // window — a corrupted date (year 0001, or a far-future timestamp) would
  // otherwise make the day-by-day loop below run for millions of iterations and
  // hang the page.
  const EPOCH_2000 = 946_684_800_000;
  const byDay = new Map<number, number>();
  let firstDay = Infinity;
  let lastDay = -Infinity;
  for (const w of workouts) {
    const day = dayKeyEpochMillis(w.date.slice(0, 10));
    if (!isFinite(day) || day < EPOCH_2000 || day > today + DAY_MS) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + workoutTss(w, ftp));
    if (day < firstDay) firstDay = day;
    if (day > lastDay) lastDay = day;
  }
  if (!isFinite(firstDay)) return null;

  const end = Math.max(lastDay, today);

  const series: FormPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let day = firstDay; day <= end; day += DAY_MS) {
    const tss = byDay.get(day) ?? 0;
    ctl += (tss - ctl) / 42;
    atl += (tss - atl) / 7;
    series.push({ day, tss, ctl, atl, tsb: ctl - atl });
  }

  const last = series[series.length - 1];
  const weekAgo = series[series.length - 8];
  const ramp = weekAgo ? last.ctl - weekAgo.ctl : last.ctl;

  const tsb = last.tsb;
  const band: FormBand =
    tsb > 25
      ? "transition"
      : tsb > 5
        ? "fresh"
        : tsb >= -10
          ? "neutral"
          : tsb >= -30
            ? "productive"
            : "overreaching";

  return { series, cp, ftp, ctl: last.ctl, atl: last.atl, tsb, ramp, band };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface PowerPoint {
  duration: number;
  watts: number;
}

/**
 * Mean-maximal power curve: the best *average* power sustained over each target
 * window length. Built from a time-integral of instantaneous watts so it works
 * with unevenly spaced strokes.
 */
export function powerCurve(strokes: Stroke[], durations?: number[]): PowerPoint[] {
  if (strokes.length < 2) return [];
  const total = strokes[strokes.length - 1].t;
  const windows = (durations ?? [5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800]).filter(
    (d) => d <= total,
  );

  // Prefix energy E[i] = ∫ watts dt up to strokes[i].t (trapezoidal).
  const t = strokes.map((s) => s.t);
  const w = strokes.map((s) => s.watts);
  const E = Array.from({ length: strokes.length }, () => 0);
  for (let i = 1; i < strokes.length; i++) {
    E[i] = E[i - 1] + ((w[i] + w[i - 1]) / 2) * (t[i] - t[i - 1]);
  }

  return windows.map((dur) => {
    let best = 0;
    let j = 0;
    for (let i = 0; i < strokes.length; i++) {
      const ta = t[i];
      const tb = ta + dur;
      if (tb > total) break;

      // Sliding window: advance j until t[j+1] is past tb
      while (j < t.length - 1 && t[j + 1] <= tb) {
        j++;
      }

      const eTb =
        j === t.length - 1
          ? E[j]
          : E[j] + ((E[j + 1] - E[j]) * (tb - t[j])) / (t[j + 1] - t[j] || 1);

      const avg = (eTb - E[i]) / dur;
      if (avg > best) best = avg;
    }
    return { duration: dur, watts: best };
  });
}

// ---------------------------------------------------------------------------
// Interval / rep breakdown
//
// A split is one work segment (a rep). We enrich each split with the stroke
// samples that fall inside it — pace, rate, HR, DPS, plus how the rep was
// paced internally (start vs end) — then compare reps to each other so you can
// see if you held the pieces together or faded across the set.
// ---------------------------------------------------------------------------

export interface IntervalRep {
  index: number;
  distance: number;
  time: number;
  pace: number;
  spm: number;
  hr?: number;
  dps: number;
  /** Within-rep fade: last-third pace vs first-third pace, % (>0 = slowed). */
  internalFade: number;
  /** Pace delta vs the set's average rep pace, sec/500m (<0 = faster). */
  vsAverage: number;
  /** True for the fastest rep in the set. */
  isFastest: boolean;
  /** True for the slowest rep in the set. */
  isSlowest: boolean;
}

export interface IntervalSet {
  reps: IntervalRep[];
  avgPace: number;
  /** Pace spread across reps as a coefficient of variation, % (lower = evener). */
  consistency: number;
  /** Set-level fade: last rep pace vs first rep pace, % (>0 = slowed down). */
  fade: number;
  fastest: number;
  slowest: number;
}

/**
 * Build a rep-by-rep breakdown from a workout's splits, using strokes (when
 * present) to compute distance-per-stroke and within-rep fade. Returns null for
 * single-segment pieces — there's nothing to compare.
 *
 * Stroke timestamps are assumed to be **continuous** (as normalised on read by
 * `mapStrokes` / `normalizeRawStrokes`). Rep boundaries are determined by
 * cumulative split durations rather than timestamp resets.
 */
export function intervalBreakdown(splits: Split[], strokes: Stroke[]): IntervalSet | null {
  if (splits.length < 2) return null;

  // Build cumulative time boundaries from split durations.
  const edges: number[] = [];
  let cum = 0;
  for (const sp of splits) {
    cum += sp.time;
    edges.push(cum);
  }

  // Assign each stroke to the first rep whose cumulative time boundary it
  // falls within. We use a two-pointer approach since both strokes and edges
  // are monotonically increasing in time, reducing O(N*M) to O(N).
  const buckets: Stroke[][] = splits.map(() => []);
  if (strokes.length) {
    let edgeIdx = 0;
    for (const s of strokes) {
      while (edgeIdx < edges.length && s.t > edges[edgeIdx]) {
        edgeIdx++;
      }
      const idx = edgeIdx < edges.length ? edgeIdx : buckets.length - 1;
      buckets[idx].push(s);
    }
  }

  // Bolt: Calculate avgPace, fastest, and slowest with a single pass for loop to prevent closures, intermediate arrays, and Max Call Stack size exceeded risk
  let paceSum = 0;
  let paceCount = 0;
  let fastest = Infinity;
  let slowest = -Infinity;
  for (let i = 0; i < splits.length; i++) {
    const p = splits[i].pace;
    if (p > 0) {
      paceSum += p;
      paceCount++;
      if (p < fastest) fastest = p;
      if (p > slowest) slowest = p;
    }
  }
  const avgPace = paceCount ? paceSum / paceCount : 0;
  if (paceCount === 0) {
    fastest = 0;
    slowest = 0;
  }

  const reps: IntervalRep[] = splits.map((sp, i) => {
    const bucket = buckets[i] ?? [];

    // Bolt: Single-pass loops avoid array allocations for spm, hr, and pace fades.
    // Only run the loop when sp.spm or sp.hr is missing to preserve short-circuiting.
    let computedSpm = 0;
    let computedHr: number | undefined;

    if (bucket.length > 0 && (sp.spm == null || sp.hr == null)) {
      let spmSum = 0;
      let hrSum = 0;
      let hrCount = 0;

      for (let j = 0; j < bucket.length; j++) {
        if (sp.spm == null) spmSum += bucket[j].spm;
        if (sp.hr == null && bucket[j].hr != null) {
          hrSum += bucket[j].hr!;
          hrCount++;
        }
      }

      if (sp.spm == null) computedSpm = spmSum / bucket.length;
      if (sp.hr == null && hrCount > 0) computedHr = Math.round(hrSum / hrCount);
    }

    const spm = sp.spm ?? computedSpm;
    const dps = sp.pace > 0 && spm > 0 ? distancePerStroke(sp.pace, spm) : 0;

    let internalFade = 0;
    if (bucket.length >= 6) {
      const third = Math.floor(bucket.length / 3);
      let firstSum = 0;
      for (let j = 0; j < third; j++) {
        firstSum += bucket[j].pace;
      }
      const first = firstSum / third;

      let lastSum = 0;
      const lastStart = bucket.length - third;
      for (let j = lastStart; j < bucket.length; j++) {
        lastSum += bucket[j].pace;
      }
      const last = lastSum / third;

      internalFade = first > 0 ? ((last - first) / first) * 100 : 0;
    }

    return {
      index: i,
      distance: sp.distance,
      time: sp.time,
      pace: sp.pace,
      spm: Math.round(spm),
      hr: sp.hr ?? computedHr,
      dps,
      internalFade,
      vsAverage: sp.pace > 0 ? sp.pace - avgPace : 0,
      isFastest: sp.pace === fastest && fastest > 0,
      isSlowest: sp.pace === slowest && slowest > 0 && fastest !== slowest,
    };
  });

  // Bolt: Single-pass for loop avoiding intermediate array allocations to compute the variance sum
  let sumSqDiff = 0;
  if (paceCount > 0) {
    for (let i = 0; i < splits.length; i++) {
      const p = splits[i].pace;
      if (p > 0) {
        sumSqDiff += (p - avgPace) ** 2;
      }
    }
  }
  const sd = paceCount > 0 ? Math.sqrt(sumSqDiff / paceCount) : 0;
  const consistency = avgPace > 0 ? (sd / avgPace) * 100 : 0;

  const firstPace = reps[0].pace;
  const lastPace = reps[reps.length - 1].pace;
  const fade = firstPace > 0 ? ((lastPace - firstPace) / firstPace) * 100 : 0;

  return { reps, avgPace, consistency, fade, fastest, slowest };
}

// ---------------------------------------------------------------------------
// Training calendar / consistency heatmap
// ---------------------------------------------------------------------------

export type VolumeMetric = "distance" | "time";

export interface DayVolume {
  day: string;
  distance: number;
  time: number;
  sessions: number;
}

/** Logbook day key with optional workout/home timezone resolution. */
export function workoutDayKey(date: string, workoutTz?: string, homeTz?: string): string {
  return workoutLocalDayKey(date, workoutTz, homeTz);
}

export function aggregateDailyVolume(workouts: Workout[], homeTz?: string): Map<string, DayVolume> {
  const map = new Map<string, DayVolume>();
  for (const w of workouts) {
    const day = workoutDayKey(w.date, w.timezone, homeTz);
    const e = map.get(day) ?? { day, distance: 0, time: 0, sessions: 0 };
    e.distance += w.distance;
    e.time += w.time;
    e.sessions += 1;
    map.set(day, e);
  }
  return map;
}

export function dayVolumeValue(v: DayVolume, metric: VolumeMetric): number {
  return metric === "distance" ? v.distance : v.time;
}

export interface CalendarCell {
  day: string;
  distance: number;
  time: number;
  sessions: number;
  level: number;
  week: number;
  dow: number;
}

export interface TrainingCalendar {
  cells: CalendarCell[];
  weeks: number;
  metric: VolumeMetric;
  maxVolume: number;
  maxLevel: number;
  startDay: string;
  endDay: string;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  monthLabels: { week: number; month: number }[];
}

/** Add calendar days to a `YYYY-MM-DD` key. PlainDate is timezone-free, so DST
 *  can never shift streak/grid math.
 *  Bolt: Optimized using Date.UTC and string slicing instead of Temporal.PlainDate
 *  to avoid massive object instantiation overhead in hot loops (~60x faster). */
export function addDaysToKey(key: string, days: number): string {
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  const d = parseInt(key.slice(8, 10), 10);
  const date = new Date(0);
  date.setUTCFullYear(y, m, d + days);
  return date.toISOString().slice(0, 10);
}

/** Day of week, 0 = Sunday … 6 = Saturday (matches the old `getUTCDay`).
 *  Bolt: Optimized using Date.UTC instead of Temporal (~15x faster). */
function dayOfWeekUtc(key: string): number {
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  const d = parseInt(key.slice(8, 10), 10);
  const date = new Date(0);
  date.setUTCFullYear(y, m, d);
  return date.getUTCDay();
}

function isConsecutiveDay(prev: string, next: string): boolean {
  return addDaysToKey(prev, 1) === next;
}

function monthNumberOfUtc(dayKey: string): number {
  return parseInt(dayKey.slice(5, 7), 10);
}

/** Compute the deduped quantile breakpoints for a pre-sorted volumes array. */
function computeLevelBreaks(sortedVolumes: number[], maxLevel: number): number[] {
  const breaks: number[] = [];
  for (let i = 1; i < maxLevel; i++) {
    const idx = Math.min(
      sortedVolumes.length - 1,
      Math.ceil((sortedVolumes.length * i) / maxLevel) - 1,
    );
    breaks.push(sortedVolumes[Math.max(0, idx)]);
  }
  return [...new Set(breaks)];
}

/** Map a value to a level using pre-computed breaks (call computeLevelBreaks once, then this per cell). */
function applyVolumeLevel(
  value: number,
  max: number,
  min: number,
  uniqueBreaks: number[],
  maxLevel: number,
): number {
  if (value <= 0) return 0;
  if (!uniqueBreaks.length) return 1;
  if (max !== min && value >= max) return maxLevel;
  // uniqueBreaks is Set-deduped; length===1 means no gradient (all volumes equal or maxLevel=2).
  if (uniqueBreaks[0] === uniqueBreaks[uniqueBreaks.length - 1]) return maxLevel;
  let level = maxLevel;
  for (let i = 0; i < uniqueBreaks.length; i++) {
    if (value <= uniqueBreaks[i]) {
      level = i + 1;
      break;
    }
  }
  return level;
}

export function volumeIntensityLevel(
  value: number,
  sortedVolumes: number[], // Pre-sorted in ascending order to avoid O(N log N) inside loops
  maxLevel = 4,
): number {
  if (value <= 0 || maxLevel < 1) return 0;
  if (!sortedVolumes.length) return 1;
  const max = sortedVolumes[sortedVolumes.length - 1];
  const min = sortedVolumes[0];
  // When there's a real gradient, any value at or above the max always gets maxLevel.
  if (max !== min && value >= max) return maxLevel;
  // When all volumes are identical, all breaks collapse to the same value.
  // Every cell would get level 1, which hides real training variation.
  // Deduplicate and fall back to maxLevel if there's no meaningful gradient.
  const unique = computeLevelBreaks(sortedVolumes, maxLevel);
  if (unique.length === 0 || unique[0] === unique[unique.length - 1])
    return value > 0 ? maxLevel : 0;
  if (unique.length === 1) return value <= unique[0] ? 1 : maxLevel;
  let level = maxLevel;
  for (let i = 0; i < unique.length; i++) {
    if (value <= unique[i]) {
      level = i + 1;
      break;
    }
  }
  return level;
}

export function trainingStreaks(
  activeDayKeys: string[],
  endDay: string,
): { current: number; longest: number } {
  if (!activeDayKeys.length) return { current: 0, longest: 0 };
  const set = new Set(activeDayKeys);
  const sorted = [...activeDayKeys].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    if (prev && isConsecutiveDay(prev, key)) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prev = key;
  }
  let current = 0;
  let cursor = endDay;
  // Grace period: streak still counts if they trained yesterday but not yet today.
  if (!set.has(cursor)) cursor = addDaysToKey(cursor, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDaysToKey(cursor, -1);
  }
  return { current, longest };
}

export function buildTrainingCalendar(
  workouts: Workout[],
  options?: {
    /** Inclusive end of the grid, `YYYY-MM-DD` (pass from server for SSR stability). */
    endDay?: string;
    weeks?: number;
    metric?: VolumeMetric;
    maxLevel?: number;
    /** User home IANA timezone for bucketing when workout tz is absent. */
    homeTz?: string;
  },
): TrainingCalendar {
  const weeks = options?.weeks ?? 53;
  const metric = options?.metric ?? "distance";
  const maxLevel = options?.maxLevel ?? 4;
  const homeTz = options?.homeTz;

  const byDay = aggregateDailyVolume(workouts, homeTz);
  const historyDays = [...byDay.keys()].sort();
  const endDay =
    options?.endDay ??
    (historyDays.length ? historyDays[historyDays.length - 1] : todayKeyForTz(homeTz));

  const endSunday = addDaysToKey(endDay, -dayOfWeekUtc(endDay));
  const startDay = addDaysToKey(endSunday, -(weeks - 1) * 7);

  const cells: CalendarCell[] = [];
  const volumesInRange: number[] = [];
  let activeDaysInRange = 0;

  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const day = addDaysToKey(startDay, col * 7 + row);
      if (day > endDay) {
        cells.push({ day: "", distance: 0, time: 0, sessions: 0, level: 0, week: col, dow: row });
        continue;
      }
      const vol = byDay.get(day);
      const distance = vol?.distance ?? 0;
      const time = vol?.time ?? 0;
      const sessions = vol?.sessions ?? 0;
      const value = metric === "distance" ? distance : time;
      if (sessions > 0) {
        volumesInRange.push(value);
        activeDaysInRange++;
      }
      cells.push({ day, distance, time, sessions, level: 0, week: col, dow: row });
    }
  }

  const sortedVolumes = [...volumesInRange].sort((a, b) => a - b);
  const maxVolume = sortedVolumes.length ? sortedVolumes[sortedVolumes.length - 1] : 0;
  // Precompute breaks once for all cells instead of recomputing inside each volumeIntensityLevel call.
  const calMin = sortedVolumes.length ? sortedVolumes[0] : 0;
  const uniqueBreaks = sortedVolumes.length ? computeLevelBreaks(sortedVolumes, maxLevel) : [];
  for (const cell of cells) {
    if (!cell.day) continue;
    const value = metric === "distance" ? cell.distance : cell.time;
    cell.level = applyVolumeLevel(value, maxVolume, calMin, uniqueBreaks, maxLevel);
  }

  const { current: currentStreak, longest: longestStreak } = trainingStreaks(historyDays, endDay);

  const monthLabels: { week: number; month: number }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < weeks; col++) {
    const weekStart = addDaysToKey(startDay, col * 7);
    const m = parseInt(weekStart.slice(5, 7), 10);
    if (m !== lastMonth) {
      if (monthLabels.length === 0 || col - monthLabels[monthLabels.length - 1].week >= 3) {
        monthLabels.push({ week: col, month: monthNumberOfUtc(weekStart) });
        lastMonth = m;
      }
    }
  }

  return {
    cells,
    weeks,
    metric,
    maxVolume,
    maxLevel,
    startDay,
    endDay,
    activeDays: activeDaysInRange,
    currentStreak,
    longestStreak,
    monthLabels,
  };
}

// ---------------------------------------------------------------------------
// Head-to-head workout comparison (static analytics, distance-aligned)
// ---------------------------------------------------------------------------

export interface DistanceOverlay {
  /** Shared distance axis in metres (0 … min(endA, endB)). */
  xs: number[];
  paceA: (number | null)[];
  paceB: (number | null)[];
  powerA: (number | null)[];
  powerB: (number | null)[];
  hrA: (number | null)[];
  hrB: (number | null)[];
  /** Max distance used for alignment. */
  alignedMetres: number;
}

/** Linearly interpolate a stroke sample at a cumulative distance. */
export function sampleStrokeAtDistance(strokes: Stroke[], metres: number): Stroke | null {
  if (!strokes.length) return null;
  const first = strokes[0];
  if (metres <= first.d) return first;
  const last = strokes[strokes.length - 1];
  if (metres >= last.d) return last;

  let low = 0;
  let high = strokes.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (strokes[mid].d < metres) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const prev = strokes[low - 1];
  const cur = strokes[low];
  const span = cur.d - prev.d;
  if (span <= 0) return cur;
  const f = (metres - prev.d) / span;
  const hrA = prev.hr;
  const hrB = cur.hr;
  let hr: number | undefined;
  if (hrA != null && hrB != null) hr = hrA + f * (hrB - hrA);
  else if (hrA != null) hr = hrA;
  else if (hrB != null) hr = hrB;
  return {
    t: prev.t + f * (cur.t - prev.t),
    d: metres,
    pace: prev.pace + f * (cur.pace - prev.pace),
    spm: prev.spm + f * (cur.spm - prev.spm),
    hr,
    watts: prev.watts + f * (cur.watts - prev.watts),
  };
}

/**
 * Resample two stroke streams onto a shared distance grid so pace / power / HR
 * can be overlaid on one chart (different durations align by metres covered).
 */
export function buildDistanceOverlay(
  strokesA: Stroke[],
  strokesB: Stroke[],
  steps = 120,
): DistanceOverlay | null {
  const endA = strokesA.at(-1)?.d ?? 0;
  const endB = strokesB.at(-1)?.d ?? 0;
  const aligned = Math.min(endA, endB);
  if (aligned <= 0 || !strokesA.length || !strokesB.length) return null;

  const xs: number[] = [];
  const paceA: (number | null)[] = [];
  const paceB: (number | null)[] = [];
  const powerA: (number | null)[] = [];
  const powerB: (number | null)[] = [];
  const hrA: (number | null)[] = [];
  const hrB: (number | null)[] = [];

  for (let i = 0; i <= steps; i++) {
    const d = (aligned * i) / steps;
    xs.push(d);
    const sa = sampleStrokeAtDistance(strokesA, d);
    const sb = sampleStrokeAtDistance(strokesB, d);
    paceA.push(sa && sa.pace > 0 ? sa.pace : null);
    paceB.push(sb && sb.pace > 0 ? sb.pace : null);
    powerA.push(sa && sa.watts > 0 ? sa.watts : null);
    powerB.push(sb && sb.watts > 0 ? sb.watts : null);
    hrA.push(sa?.hr ?? null);
    hrB.push(sb?.hr ?? null);
  }

  return { xs, paceA, paceB, powerA, powerB, hrA, hrB, alignedMetres: aligned };
}

export interface WorkoutSideStats {
  time: number;
  pace: number;
  avgWatts: number;
  /** Best 5-second average power (from powerCurve). */
  best5sPower: number;
  avgHr: number | null;
  peakHr: number | null;
  avgDps: number;
  /** Pace coefficient of variation (%); lower = more even splits. */
  paceConsistency: number;
}

export function workoutSideStats(detail: WorkoutDetail): WorkoutSideStats {
  const tech = techniqueSummary(detail.strokes);
  const pc = powerCurve(detail.strokes);

  let best5sPower = 0;
  for (let i = 0; i < pc.length; i++) {
    if (pc[i].watts > best5sPower) best5sPower = pc[i].watts;
  }

  let hrSum = 0;
  let hrCount = 0;
  let peakHr = 0;
  for (let i = 0; i < detail.strokes.length; i++) {
    const hr = detail.strokes[i].hr;
    if (hr != null && hr > 0) {
      hrSum += hr;
      hrCount++;
      if (hr > peakHr) peakHr = hr;
    }
  }
  const computedAvgHr = hrCount > 0 ? hrSum / hrCount : null;
  const finalPeakHr = hrCount > 0 ? peakHr : null;

  const avgHr =
    detail.heartRateAvg && detail.heartRateAvg > 0 ? detail.heartRateAvg : computedAvgHr;

  return {
    time: detail.time,
    pace: detail.pace,
    avgWatts: Math.round(workoutWatts(detail)),
    best5sPower: Math.round(best5sPower),
    avgHr: avgHr != null ? Math.round(avgHr) : null,
    peakHr: finalPeakHr != null ? Math.round(finalPeakHr) : null,
    avgDps: tech.avgDps,
    paceConsistency: tech.paceConsistency,
  };
}

export type CompareWinner = "a" | "b" | "tie";

export interface CompareVerdict {
  winner: CompareWinner;
  /** Seconds faster for workout A when distances are comparable. */
  timeDeltaSec: number | null;
  /** Pace delta (A − B) in sec/500m; negative = A is faster. */
  paceDelta: number | null;
}

/**
 * Decide which piece was "better" for like-for-like distances (same band),
 * otherwise compare average pace.
 */
export function compareVerdict(a: WorkoutDetail, b: WorkoutDetail): CompareVerdict {
  if (a.sport !== b.sport) return { winner: "tie", timeDeltaSec: null, paceDelta: null };

  const bandA = distanceBand(a.distance);
  const bandB = distanceBand(b.distance);
  const likeForLike = bandA.key === bandB.key;

  if (likeForLike && a.time > 0 && b.time > 0) {
    const timeDeltaSec = b.time - a.time; // positive = A faster
    let winner: CompareWinner = "tie";
    if (Math.abs(timeDeltaSec) >= 0.5) winner = timeDeltaSec > 0 ? "a" : "b";
    return { winner, timeDeltaSec, paceDelta: a.pace - b.pace };
  }

  const paceDelta = a.pace - b.pace;
  let winner: CompareWinner = "tie";
  if (a.pace > 0 && b.pace > 0 && Math.abs(paceDelta) >= 0.1) {
    winner = paceDelta < 0 ? "a" : "b";
  }
  return { winner, timeDeltaSec: null, paceDelta };
}

export interface IntervalCompareRow {
  index: number;
  paceA: number;
  paceB: number;
  /** A pace − B pace (sec/500m); negative = A faster on this rep. */
  paceDelta: number;
  timeA: number;
  timeB: number;
  /** B time − A time (sec); positive = A faster. */
  timeDelta: number;
}

/** Per-rep deltas when both workouts have interval splits (by index). */
export function compareIntervalReps(
  a: WorkoutDetail,
  b: WorkoutDetail,
): IntervalCompareRow[] | null {
  if (a.sport !== b.sport) return null;
  const setA = intervalBreakdown(a.splits, a.strokes);
  const setB = intervalBreakdown(b.splits, b.strokes);
  if (!setA || !setB) return null;
  const n = Math.min(setA.reps.length, setB.reps.length);
  if (n < 2) return null;

  const rows: IntervalCompareRow[] = [];
  for (let i = 0; i < n; i++) {
    const ra = setA.reps[i];
    const rb = setB.reps[i];
    rows.push({
      index: i + 1,
      paceA: ra.pace,
      paceB: rb.pace,
      paceDelta: ra.pace - rb.pace,
      timeA: ra.time,
      timeB: rb.time,
      timeDelta: rb.time - ra.time,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Goals, streaks, challenges (Task 5)
// ---------------------------------------------------------------------------

export type AnnualGoalKind = "meters" | "hours";

export interface AnnualGoal {
  year: number;
  kind: AnnualGoalKind;
  /** Target metres or seconds for the calendar year. */
  target: number;
}

export interface AnnualGoalProgress {
  year: number;
  kind: AnnualGoalKind;
  target: number;
  current: number;
  pct: number;
  daysElapsed: number;
  daysInYear: number;
  /** Linear “should have by now” target for pacing. */
  expected: number;
  onPace: boolean;
  /** Projected year-end total at the current daily rate. */
  projected: number;
}

function daysInCalendarYear(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}

// Bolt: Optimized using Date.UTC math instead of Temporal (~20x faster).
function dayOfYearUtc(dayKey: string): number {
  const y = parseInt(dayKey.slice(0, 4), 10);
  const m = parseInt(dayKey.slice(5, 7), 10) - 1;
  const d = parseInt(dayKey.slice(8, 10), 10);

  const current = new Date(0);
  current.setUTCFullYear(y, m, d);
  const start = new Date(0);
  start.setUTCFullYear(y, 0, 0); // Dec 31 of previous year

  return Math.floor((current.getTime() - start.getTime()) / 86400000);
}

// Bolt: Optimized using Date.UTC math instead of Temporal (~150x faster).
function daysBetweenUtc(from: string, to: string): number {
  const y1 = parseInt(from.slice(0, 4), 10);
  const m1 = parseInt(from.slice(5, 7), 10) - 1;
  const d1 = parseInt(from.slice(8, 10), 10);

  const y2 = parseInt(to.slice(0, 4), 10);
  const m2 = parseInt(to.slice(5, 7), 10) - 1;
  const d2 = parseInt(to.slice(8, 10), 10);

  const t1 = new Date(0);
  t1.setUTCFullYear(y1, m1, d1);
  const t2 = new Date(0);
  t2.setUTCFullYear(y2, m2, d2);

  return Math.max(0, Math.floor((t2.getTime() - t1.getTime()) / 86400000));
}

/** Year-to-date progress toward an annual distance or time goal. */
export function annualGoalProgress(
  workouts: Workout[],
  goal: AnnualGoal,
  endDay?: string,
  homeTz?: string,
): AnnualGoalProgress {
  const end = endDay ?? todayKeyForTz(homeTz);
  const year = goal.year;
  const yearPrefix = `${year}-`;
  // Pre-filter on the raw date's year (a cheap string slice) before the
  // Temporal-backed workoutDayKey: a tz shift moves a workout by at most one
  // day, so only the adjacent years can cross into `year`. This skips Temporal
  // work for the bulk of a multi-year history.
  const prevYearStr = String(year - 1);
  const nextYearStr = String(year + 1);

  const isMeterGoal = goal.kind === "meters";
  let current = 0;
  for (let i = 0, len = workouts.length; i < len; i++) {
    const w = workouts[i];
    const wYear = w.date.slice(0, 4);
    if (wYear === String(year) || wYear === prevYearStr || wYear === nextYearStr) {
      if (workoutDayKey(w.date, w.timezone, homeTz).startsWith(yearPrefix)) {
        current += isMeterGoal ? challengeDistanceMetres(w) : w.time;
      }
    }
  }

  const daysInYear = daysInCalendarYear(year);
  const yearEnd = `${year}-12-31`;
  const progressThrough = end.startsWith(yearPrefix) ? end : yearEnd;
  const daysElapsed = Math.min(dayOfYearUtc(progressThrough), daysInYear);
  const expected = goal.target > 0 ? (goal.target * daysElapsed) / daysInYear : 0;
  const rate = daysElapsed > 0 ? current / daysElapsed : 0;
  const projected = rate * daysInYear;
  const pct = goal.target > 0 ? Math.min(100, (current / goal.target) * 100) : 0;

  return {
    year,
    kind: goal.kind,
    target: goal.target,
    current,
    pct,
    daysElapsed,
    daysInYear,
    expected,
    onPace: current >= expected,
    projected,
  };
}

export interface TrainingStreakStats {
  currentStreak: number;
  longestStreak: number;
  /** Calendar days since the last session day (0 = trained today). */
  daysSinceLastSession: number | null;
  weeklyConsistency: { activeWeeks: number; totalWeeks: number };
}

export function weeklyConsistency(
  workouts: Workout[] | Set<string>,
  endDay: string,
  lookbackWeeks = 8,
  homeTz?: string,
): { activeWeeks: number; totalWeeks: number } {
  const activeDays =
    workouts instanceof Set
      ? workouts
      : new Set([...aggregateDailyVolume(workouts, homeTz).keys()].filter((d) => d <= endDay));
  let activeWeeks = 0;
  for (let w = 0; w < lookbackWeeks; w++) {
    const weekEnd = addDaysToKey(endDay, -w * 7);
    let any = false;
    for (let d = 0; d < 7; d++) {
      if (activeDays.has(addDaysToKey(weekEnd, -d))) {
        any = true;
        break;
      }
    }
    if (any) activeWeeks++;
  }
  return { activeWeeks, totalWeeks: lookbackWeeks };
}

export function trainingStreakStats(
  workouts: Workout[],
  endDay?: string,
  homeTz?: string,
): TrainingStreakStats {
  const end = endDay ?? todayKeyForTz(homeTz);
  const activeDaysList = [...aggregateDailyVolume(workouts, homeTz).keys()].filter((d) => d <= end);
  const historyDays = [...activeDaysList].sort();
  const { current: currentStreak, longest: longestStreak } = trainingStreaks(historyDays, end);
  const lastDay = historyDays.length ? historyDays[historyDays.length - 1] : null;
  const daysSinceLastSession = lastDay != null ? daysBetweenUtc(lastDay, end) : null;
  return {
    currentStreak,
    longestStreak,
    daysSinceLastSession,
    weeklyConsistency: weeklyConsistency(new Set(activeDaysList), end, 8, homeTz),
  };
}

export type BadgeId =
  | "meters_100k"
  | "meters_500k"
  | "meters_1m"
  | "meters_2m"
  | "meters_5m"
  | "club_500"
  | "club_1000"
  | "club_2000"
  | "club_5000"
  | "club_10000"
  | "every_sport_week";

export interface AthleteBadge {
  id: BadgeId;
  earned: boolean;
  /** 0–1 progress toward the next lifetime-meters milestone (when not earned). */
  progress?: number;
}

const LIFETIME_METER_BADGES: { id: BadgeId; meters: number }[] = [
  { id: "meters_100k", meters: 100_000 },
  { id: "meters_500k", meters: 500_000 },
  { id: "meters_1m", meters: 1_000_000 },
  { id: "meters_2m", meters: 2_000_000 },
  { id: "meters_5m", meters: 5_000_000 },
];

const CLUB_DISTANCES: { id: BadgeId; metres: number }[] = [
  { id: "club_500", metres: 500 },
  { id: "club_1000", metres: 1000 },
  { id: "club_2000", metres: 2000 },
  { id: "club_5000", metres: 5000 },
  { id: "club_10000", metres: 10000 },
];

/** Any rolling 7-day window with at least one session on each Concept2 sport. */
export function hasEverySportWeek(workouts: Workout[], homeTz?: string): boolean {
  const daySports = new Map<string, Set<Sport>>();
  for (const w of workouts) {
    const day = workoutDayKey(w.date, w.timezone, homeTz);
    if (!daySports.has(day)) daySports.set(day, new Set());
    daySports.get(day)!.add(w.sport);
  }
  const sorted = [...daySports.keys()].sort();
  for (const start of sorted) {
    const sports = new Set<Sport>();
    for (let offset = 0; offset < 7; offset++) {
      const s = daySports.get(addDaysToKey(start, offset));
      if (s) for (const sp of s) sports.add(sp);
    }
    if (sports.has("rower") && sports.has("skierg") && sports.has("bike")) return true;
  }
  return false;
}

export function athleteBadges(
  workouts: Workout[],
  pbs: ReturnType<typeof distancePBs>,
  homeTz?: string,
): AthleteBadge[] {
  let totalMeters = 0;
  for (let i = 0, len = workouts.length; i < len; i++) {
    totalMeters += challengeDistanceMetres(workouts[i]);
  }
  const pbDistances = new Set(pbs.map((p) => p.distance));
  const badges: AthleteBadge[] = [];

  for (const { id, meters } of LIFETIME_METER_BADGES) {
    const earned = totalMeters >= meters;
    badges.push({
      id,
      earned,
      progress: earned ? 1 : Math.min(1, totalMeters / meters),
    });
  }
  for (const { id, metres } of CLUB_DISTANCES) {
    badges.push({ id, earned: pbDistances.has(metres) });
  }
  badges.push({ id: "every_sport_week", earned: hasEverySportWeek(workouts, homeTz) });
  return badges;
}

/** Workout ids that currently hold a standard-distance PB (per sport). */
export function pbWorkoutIds(workouts: Workout[]): Set<number> {
  const ids = new Set<number>();
  const bySport = new Map<string, Workout[]>();
  for (let i = 0, len = workouts.length; i < len; i++) {
    const w = workouts[i];
    const arr = bySport.get(w.sport);
    if (arr) {
      arr.push(w);
    } else {
      bySport.set(w.sport, [w]);
    }
  }

  for (const sportWorkouts of bySport.values()) {
    for (let i = 0, dlen = STANDARD_DISTANCES.length; i < dlen; i++) {
      const target = STANDARD_DISTANCES[i];
      let best: Workout | null = null;
      let minTime = Infinity;
      const t02 = target * 0.02;

      for (let j = 0, slen = sportWorkouts.length; j < slen; j++) {
        const w = sportWorkouts[j];
        if (w.time > 0 && Math.abs(w.distance - target) <= t02) {
          if (w.time < minTime) {
            best = w;
            minTime = w.time;
          }
        }
      }

      if (best !== null) {
        ids.add(best.id);
      }
    }
  }
  return ids;
}

export type DistancePB = ReturnType<typeof distancePBs>[number];

/** PBs that improved (or are new) after a sync or data refresh. */
export function detectNewPBs(before: DistancePB[], after: DistancePB[]): DistancePB[] {
  const beforeMap = new Map(before.map((p) => [`${p.sport}-${p.distance}`, p]));
  const out: DistancePB[] = [];
  for (const pb of after) {
    const prev = beforeMap.get(`${pb.sport}-${pb.distance}`);
    if (!prev || pb.time < prev.time - 0.001) out.push(pb);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Full-fidelity analyses (HR recovery, work:rest, targets)
// ---------------------------------------------------------------------------

export interface HrRecoveryPoint {
  id: number;
  date: string;
  ending?: number;
  recovery?: number;
  /** ending − recovery; larger = better cardiac recovery */
  drop?: number;
}

/**
 * HR recovery trend across sessions. `ending` / `recovery` are only populated
 * from the detail endpoint (or D1 detail cache), not the workout list.
 */
export function hrRecoveryTrend(details: WorkoutDetail[]): HrRecoveryPoint[] {
  const points: HrRecoveryPoint[] = [];
  for (const d of details) {
    const ending = d.heartRate?.ending;
    const recovery = d.heartRate?.recovery;
    if (ending == null && recovery == null) continue;
    const drop = ending != null && recovery != null ? ending - recovery : undefined;
    points.push({ id: d.id, date: d.date, ending, recovery, drop });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface WorkRestEfficiency {
  workTime: number;
  restTime?: number;
  workDistance: number;
  restDistance?: number;
  /** work seconds per rest second */
  timeRatio?: number;
  avgWorkPace: number;
}

/** Work:rest summary for interval pieces using captured rest fields. */
export function workRestEfficiency(detail: WorkoutDetail): WorkRestEfficiency | null {
  if (!detail.isInterval) return null;

  let workTime = 0;
  let workDistance = 0;
  let restFromSplits = 0;
  let restDistanceFromSplits = 0;
  let hasRestDistance = false;
  let workCount = 0;
  let paceSum = 0;
  let paceCount = 0;

  for (let i = 0; i < detail.splits.length; i++) {
    const s = detail.splits[i];
    if (s.isRest) {
      restFromSplits += s.time;
      if (s.restDistance != null) {
        restDistanceFromSplits += s.restDistance;
        hasRestDistance = true;
      }
    } else {
      workCount++;
      workTime += s.time;
      workDistance += s.distance;
      if (s.pace > 0) {
        paceSum += s.pace;
        paceCount++;
      }
    }
  }

  if (workCount === 0) return null;

  const restTime = detail.restTime ?? (restFromSplits > 0 ? restFromSplits : undefined);
  const restDistance =
    detail.restDistance ?? (hasRestDistance ? restDistanceFromSplits : undefined);
  const avgWorkPace = paceCount > 0 ? paceSum / paceCount : detail.pace;
  const timeRatio = restTime != null && restTime > 0 ? workTime / restTime : undefined;

  return { workTime, restTime, workDistance, restDistance, timeRatio, avgWorkPace };
}

export type TargetMetric = "pace" | "watts" | "strokeRate" | "heartRateZone" | "calories";

export interface TargetVsActualRow {
  metric: TargetMetric;
  target: number;
  actual: number;
  delta: number;
  hit: boolean;
}

/** Compare logged targets to achieved summary metrics. */
export function targetVsActual(detail: WorkoutDetail): TargetVsActualRow[] {
  const t = detail.targets;
  if (!t) return [];
  const rows: TargetVsActualRow[] = [];
  if (t.pace != null && detail.pace > 0) {
    const delta = detail.pace - t.pace;
    rows.push({ metric: "pace", target: t.pace, actual: detail.pace, delta, hit: delta <= 0 });
  }
  if (t.watts != null) {
    const actual = workoutWatts(detail);
    if (actual > 0) {
      const delta = actual - t.watts;
      rows.push({ metric: "watts", target: t.watts, actual, delta, hit: delta >= 0 });
    }
  }
  if (t.strokeRate != null && detail.strokeRate != null) {
    const delta = detail.strokeRate - t.strokeRate;
    rows.push({
      metric: "strokeRate",
      target: t.strokeRate,
      actual: detail.strokeRate,
      delta,
      hit: Math.abs(delta) <= 1,
    });
  }
  if (t.calories != null && detail.caloriesTotal != null) {
    const delta = detail.caloriesTotal - t.calories;
    rows.push({
      metric: "calories",
      target: t.calories,
      actual: detail.caloriesTotal,
      delta,
      hit: delta >= 0,
    });
  }
  if (t.heartRateZone != null && detail.heartRateAvg != null) {
    // Target is a zone index (0–5); the achieved zone must be derived from the
    // average HR (bpm) before comparing — comparing bpm to a zone is nonsense.
    const hrMax = estimateHrMax(detail.strokes, detail.hrMax);
    const actualZone = hrZoneOf(detail.heartRateAvg, hrMax);
    const delta = actualZone - t.heartRateZone;
    rows.push({
      metric: "heartRateZone",
      target: t.heartRateZone,
      actual: actualZone,
      delta,
      hit: delta === 0,
    });
  }
  return rows;
}
