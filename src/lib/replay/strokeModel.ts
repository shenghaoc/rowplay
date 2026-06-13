import type { Sport, Stroke } from "../types";
import { warpStrokePhase } from "./motion";

const TAU = Math.PI * 2;

export interface StrokeTimelineEntry {
  index: number;
  startT: number;
  endT: number;
  startD: number;
  endD: number;
  pace: number;
  spm: number;
  hr?: number;
  watts: number;
}

export interface StrokeTimeline {
  sport: Sport;
  real: boolean;
  entries: StrokeTimelineEntry[];
  duration: number;
  distance: number;
  medianWatts: number;
  peakWatts: number;
  medianDps: number;
  medianHr: number;
  maxHr: number;
}

export interface StrokePose {
  /** Stroke-row index used for exact catch transition detection. */
  index: number;
  catchIndex: number;
  /** Continuous phase in radians; one full cycle per modeled stroke. */
  phase: number;
  /** Phase warped with an inferred drive/recovery split. */
  warpedPhase: number;
  /** 0..1 within the current stroke cycle. */
  cycleFrac: number;
  /** Estimated drive share of the stroke cycle; not a force curve. */
  driveFrac: number;
  drive: boolean;
  driveProgress: number;
  recoveryProgress: number;
  strokeSeconds: number;
  strokeMeters: number;
  rate: number;
  watts: number;
  intensity: number;
  amplitude: number;
  fatigue: number;
  real: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function finite(v: number | undefined, fallback: number): number {
  return Number.isFinite(v) ? (v as number) : fallback;
}

function median(values: number[], fallback: number): number {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return fallback;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

function secondsFromRate(spm: number, sport: Sport): number {
  const base = sport === "bike" ? 80 : sport === "skierg" ? 32 : 28;
  return 60 / clamp(spm || base, sport === "bike" ? 25 : 10, sport === "bike" ? 130 : 60);
}

function metersFromPace(seconds: number, pace: number, sport: Sport): number {
  const metresPerPaceUnit = sport === "bike" ? 1000 : 500;
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pace) || pace <= 0) return 0;
  return (seconds / pace) * metresPerPaceUnit;
}

function driveFraction(sport: Sport, seconds: number, rate: number, intensity: number): number {
  if (sport === "bike") return 0.5;
  const base = sport === "skierg" ? 0.34 : 0.38;
  const rateBias = clamp((rate - (sport === "skierg" ? 32 : 28)) / 40, -0.12, 0.12);
  const powerBias = (intensity - 0.5) * 0.08;
  const durationBias = clamp((2.0 - seconds) / 8, -0.06, 0.06);
  return clamp(base + rateBias + powerBias + durationBias, 0.28, 0.46);
}

function normalizeEntry(
  stroke: Stroke,
  index: number,
  startT: number,
  startD: number,
  sport: Sport,
): StrokeTimelineEntry {
  let endT = finite(stroke.t, startT);
  if (!(endT > startT)) endT = startT + secondsFromRate(stroke.spm, sport);
  let endD = finite(stroke.d, startD);
  if (!(endD >= startD)) endD = startD + metersFromPace(endT - startT, stroke.pace, sport);
  // Second pass: zero-distance real rows (e.g. rest strokes with d unchanged).
  // pace is re-checked because it may be valid even when d has not advanced.
  if (endD === startD) endD += metersFromPace(endT - startT, stroke.pace, sport);
  return {
    index,
    startT,
    endT,
    startD,
    endD,
    pace: finite(stroke.pace, 0),
    spm: finite(stroke.spm, 0),
    hr: stroke.hr,
    watts: finite(stroke.watts, 0),
  };
}

export function buildStrokeTimeline(strokes: Stroke[], sport: Sport, real = true): StrokeTimeline {
  let startT = 0;
  let startD = 0;
  const entries: StrokeTimelineEntry[] = [];
  strokes.forEach((stroke, index) => {
    const entry = normalizeEntry(stroke, index, startT, startD, sport);
    entries.push(entry);
    startT = entry.endT;
    startD = entry.endD;
  });

  const watts = entries.map((e) => e.watts).filter((w) => w > 0);
  const dps = entries.map((e) => e.endD - e.startD).filter((d) => d > 0);
  const hrs = entries.map((e) => e.hr ?? 0).filter((h) => h > 0);

  return {
    sport,
    real: real && entries.length > 0,
    entries,
    duration: entries.at(-1)?.endT ?? 0,
    distance: entries.at(-1)?.endD ?? 0,
    medianWatts: median(watts, 0),
    peakWatts: Math.max(0, ...watts),
    medianDps: median(dps, sport === "bike" ? 5 : sport === "skierg" ? 8 : 11),
    medianHr: median(hrs, 0),
    maxHr: Math.max(0, ...hrs),
  };
}

function entryAt(entries: StrokeTimelineEntry[], t: number): StrokeTimelineEntry | null {
  if (!entries.length) return null;
  if (t <= entries[0].startT) return entries[0];
  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (t < entries[mid].endT) hi = mid;
    else lo = mid + 1;
  }
  return entries[lo];
}

export function fallbackStrokePose(sport: Sport, phase = 0, rate = 0): StrokePose {
  const cycleFrac = (((phase / TAU) % 1) + 1) % 1;
  const intensity = clamp(rate / (sport === "bike" ? 120 : 40), 0, 1);
  const driveFrac = sport === "bike" ? 0.5 : sport === "skierg" ? 0.34 : 0.38;
  return makePose({
    sport,
    index: Math.floor(Math.max(0, phase) / TAU),
    cycleFrac,
    strokeSeconds: secondsFromRate(rate, sport),
    strokeMeters: sport === "bike" ? 5 : sport === "skierg" ? 8 : 11,
    rate,
    watts: 0,
    intensity,
    fatigue: 0,
    driveFrac,
    real: false,
  });
}

function makePose(input: {
  sport: Sport;
  index: number;
  cycleFrac: number;
  strokeSeconds: number;
  strokeMeters: number;
  rate: number;
  watts: number;
  intensity: number;
  fatigue: number;
  driveFrac: number;
  real: boolean;
}): StrokePose {
  const cycleFrac = clamp(input.cycleFrac, 0, 0.999999);
  const phase = (input.index + cycleFrac) * TAU;
  const drive = cycleFrac < input.driveFrac;
  const driveProgress = drive ? cycleFrac / input.driveFrac : 1;
  const recoveryProgress = drive ? 0 : (cycleFrac - input.driveFrac) / (1 - input.driveFrac);
  return {
    index: input.index,
    catchIndex: input.index,
    phase,
    warpedPhase: warpStrokePhase(phase, input.driveFrac),
    cycleFrac,
    driveFrac: input.driveFrac,
    drive,
    driveProgress: clamp(driveProgress, 0, 1),
    recoveryProgress: clamp(recoveryProgress, 0, 1),
    strokeSeconds: input.strokeSeconds,
    strokeMeters: input.strokeMeters,
    rate: input.rate,
    watts: input.watts,
    intensity: clamp(input.intensity, 0, 1),
    amplitude: clamp(0.78 + input.intensity * 0.44 + input.fatigue * 0.08, 0.72, 1.32),
    fatigue: clamp(input.fatigue, 0, 1),
    real: input.real,
  };
}

function syntheticPoseAt(timeline: StrokeTimeline, t: number): StrokePose {
  const entry = entryAt(timeline.entries, t);
  const sport = timeline.sport;
  const rate = entry?.spm || (sport === "bike" ? 80 : sport === "skierg" ? 32 : 28);
  const phase = Math.max(0, t) * (rate / 60) * TAU;
  const watts = entry?.watts ?? 0;
  const intensity = timeline.peakWatts > 0 ? watts / timeline.peakWatts : rate / 45;
  const cycleFrac = (((phase / TAU) % 1) + 1) % 1;
  return makePose({
    sport,
    index: Math.floor(Math.max(0, phase) / TAU),
    cycleFrac,
    strokeSeconds: secondsFromRate(rate, sport),
    strokeMeters: entry
      ? Math.max(0, entry.endD - entry.startD)
      : sport === "bike"
        ? 5
        : sport === "skierg"
          ? 8
          : 11,
    rate,
    watts,
    intensity: clamp(intensity, 0, 1),
    fatigue: 0,
    driveFrac: sport === "bike" ? 0.5 : sport === "skierg" ? 0.34 : 0.38,
    real: false,
  });
}

export function strokePoseAt(timeline: StrokeTimeline, t: number): StrokePose {
  if (!timeline.real || timeline.entries.length === 0) return syntheticPoseAt(timeline, t);
  const entry = entryAt(timeline.entries, Math.max(0, t));
  if (!entry) return fallbackStrokePose(timeline.sport, 0, 0);

  const seconds = Math.max(0.05, entry.endT - entry.startT);
  const meters = Math.max(0, entry.endD - entry.startD);
  const cycleFrac = clamp((Math.max(0, t) - entry.startT) / seconds, 0, 0.999999);
  const wattsNorm =
    timeline.peakWatts > 0
      ? entry.watts / timeline.peakWatts
      : timeline.medianWatts > 0
        ? entry.watts / timeline.medianWatts
        : 0.35;
  const dpsNorm = timeline.medianDps > 0 ? meters / timeline.medianDps : 1;
  const rateNorm = entry.spm / (timeline.sport === "bike" ? 120 : 42);
  const intensity = clamp(
    wattsNorm * 0.55 + clamp(dpsNorm / 1.45, 0, 1) * 0.3 + rateNorm * 0.15,
    0,
    1,
  );
  const hr = entry.hr ?? 0;
  const hrFatigue =
    hr > 0 && timeline.maxHr > 0
      ? clamp(
          (hr - Math.max(0, timeline.medianHr - 5)) /
            Math.max(20, timeline.maxHr - timeline.medianHr + 10),
          0,
          1,
        )
      : 0;
  const progress = timeline.duration > 0 ? clamp(entry.endT / timeline.duration, 0, 1) : 0;
  const fatigue = clamp(
    hrFatigue * 0.65 + progress * 0.25 + Math.max(0, intensity - 0.75) * 0.1,
    0,
    1,
  );
  const driveFrac = driveFraction(timeline.sport, seconds, entry.spm, intensity);

  return makePose({
    sport: timeline.sport,
    index: entry.index,
    cycleFrac,
    strokeSeconds: seconds,
    strokeMeters: meters,
    rate: entry.spm,
    watts: entry.watts,
    intensity,
    fatigue,
    driveFrac,
    real: true,
  });
}

/** Count stroke-row catch transitions without firing on seeks/backward scrubs. */
export function catchTransitions(
  prev: StrokePose | null,
  next: StrokePose | undefined,
  maxCatches = 3,
): number {
  if (!prev || !next) return 0;
  if (!(next.catchIndex > prev.catchIndex)) return 0;
  const diff = next.catchIndex - prev.catchIndex;
  return diff <= maxCatches ? diff : 0;
}
