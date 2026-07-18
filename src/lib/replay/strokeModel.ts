import type { Sport, Stroke } from "../types";
import { warpStrokePhase } from "./motion";

const TAU = Math.PI * 2;

export interface StrokeTimelineEntry {
  index: number;
  /** Integrated cycle position at the entry bounds (used by synthetic timelines). */
  startCycle: number;
  endCycle: number;
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
  /**
   * Stroke-row index, used both as the cycle counter and the catch-transition
   * key — `catchTransitions` triggers on each index increment, so seek
   * scrubs that re-enter the same row don't double-fire splash effects.
   */
  index: number;
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
  /** Restrained scale for decorative surge/bob only; never primary joint range. */
  amplitude: number;
  /** Inferred analytics cue retained for compatibility; renderers must not use it for posture. */
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

function metersFromPace(seconds: number, pace: number): number {
  // Concept2 BikeErg API pace is normalised to /500 m by mapStrokes, matching
  // rower and SkiErg by the time it reaches the replay model.
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pace) || pace <= 0) return 0;
  return (seconds / pace) * 500;
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
): Omit<StrokeTimelineEntry, "startCycle" | "endCycle"> {
  let endT = finite(stroke.t, startT);
  if (!(endT > startT)) endT = startT + secondsFromRate(stroke.spm, sport);
  let endD = finite(stroke.d, startD);
  if (!(endD >= startD)) endD = startD + metersFromPace(endT - startT, stroke.pace);
  // Second pass: zero-distance real rows (e.g. rest strokes with d unchanged).
  // pace is re-checked because it may be valid even when d has not advanced.
  if (endD === startD) endD += metersFromPace(endT - startT, stroke.pace);
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

function isNonAdvancingAnchor(stroke: Stroke, startT: number, startD: number): boolean {
  if (!Number.isFinite(stroke.t) || !Number.isFinite(stroke.d)) return false;
  // Concept2 interval boundaries can repeat the current cumulative coordinate.
  // Those rows are anchors, not strokes, and must not fabricate a full cycle.
  return Math.abs(stroke.t - startT) < 1e-6 && Math.abs(stroke.d - startD) < 1e-6;
}

export function buildStrokeTimeline(strokes: Stroke[], sport: Sport, real = true): StrokeTimeline {
  let startT = 0;
  let startD = 0;
  let startCycle = 0;
  const entries: StrokeTimelineEntry[] = [];
  strokes.forEach((stroke) => {
    if (isNonAdvancingAnchor(stroke, startT, startD)) return;
    const normalized = normalizeEntry(stroke, entries.length, startT, startD, sport);
    const cycleSpan = real
      ? 1
      : Math.max(0, normalized.endT - normalized.startT) / secondsFromRate(normalized.spm, sport);
    const entry: StrokeTimelineEntry = {
      ...normalized,
      startCycle,
      endCycle: startCycle + cycleSpan,
    };
    entries.push(entry);
    startT = entry.endT;
    startD = entry.endD;
    startCycle = entry.endCycle;
  });

  // Bolt: Single-pass loops for aggregates to avoid map/filter chains and spread Math.max
  const watts: number[] = [];
  const dps: number[] = [];
  const hrs: number[] = [];
  let peakWatts = 0;
  let maxHr = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.watts > 0) {
      watts.push(e.watts);
      if (e.watts > peakWatts) peakWatts = e.watts;
    }
    const d = e.endD - e.startD;
    if (d > 0) dps.push(d);
    const h = e.hr ?? 0;
    if (h > 0) {
      hrs.push(h);
      if (h > maxHr) maxHr = h;
    }
  }

  return {
    sport,
    real: real && entries.length > 0,
    entries,
    duration: entries.at(-1)?.endT ?? 0,
    distance: entries.at(-1)?.endD ?? 0,
    medianWatts: median(watts, 0),
    peakWatts,
    medianDps: median(dps, sport === "bike" ? 5 : sport === "skierg" ? 8 : 11),
    medianHr: median(hrs, 0),
    maxHr,
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
    amplitude: clamp(0.94 + input.intensity * 0.12, 0.94, 1.06),
    fatigue: clamp(input.fatigue, 0, 1),
    real: input.real,
  };
}

function syntheticPoseAt(timeline: StrokeTimeline, t: number): StrokePose {
  const entry = entryAt(timeline.entries, t);
  const sport = timeline.sport;
  const rate = entry?.spm || (sport === "bike" ? 80 : sport === "skierg" ? 32 : 28);
  const entryProgress = entry
    ? clamp((Math.max(0, t) - entry.startT) / Math.max(0.05, entry.endT - entry.startT), 0, 1)
    : 0;
  const cycle = entry
    ? entry.startCycle + (entry.endCycle - entry.startCycle) * entryProgress
    : Math.max(0, t) / secondsFromRate(rate, sport);
  const phase = cycle * TAU;
  const watts = entry?.watts ?? 0;
  const intensity = timeline.peakWatts > 0 ? watts / timeline.peakWatts : rate / 45;
  const cycleFrac = (((phase / TAU) % 1) + 1) % 1;
  return makePose({
    sport,
    index: Math.floor(Math.max(0, cycle)),
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
  // Rate ceilings tuned to elite-sprint peaks: bike sprints reach ~120 rpm,
  // rowing 2K sprints peak around 36-38 spm. Cap rowers/skiers at 36 so a
  // 36 spm finish maps to rateNorm ≈ 1 rather than 0.86 against a 42 spm
  // ceiling.
  const rateNorm = entry.spm / (timeline.sport === "bike" ? 120 : 36);
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
  if (!(next.index > prev.index)) return 0;
  const diff = next.index - prev.index;
  return diff <= maxCatches ? diff : 0;
}
