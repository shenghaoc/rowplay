import type { Sport, Workout } from "./types";

export interface DpsPoint {
  date: string;
  workoutId: number;
  sport: Sport;
  rawDps: number;
  normDps: number;
  avgPaceSecs: number;
  strokeCount: number;
}

export interface MovingAvgPoint {
  date: string;
  value: number;
}

const DEFAULT_REFERENCE_PACE = 120;

function median(values: number[]): number {
  if (values.length === 0) return DEFAULT_REFERENCE_PACE;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Compute one DpsPoint per workout that has a stroke count.
 * Workouts without strokeCount are excluded (not imputed).
 */
export function computeDpsTrend(workouts: Workout[], sport?: Sport): DpsPoint[] {
  const points: DpsPoint[] = [];
  const paces: number[] = [];

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    if (
      w.strokeCount != null &&
      w.strokeCount > 0 &&
      w.distance > 0 &&
      w.pace > 0 &&
      (!sport || w.sport === sport)
    ) {
      points.push({
        date: w.date,
        workoutId: w.id,
        sport: w.sport,
        rawDps: w.distance / w.strokeCount,
        avgPaceSecs: w.pace,
        strokeCount: w.strokeCount,
        normDps: 0,
      });
      paces.push(w.pace);
    }
  }

  const referencePace = paces.length >= 3 ? median(paces) : DEFAULT_REFERENCE_PACE;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    p.normDps = p.rawDps * Math.sqrt(referencePace / p.avgPaceSecs);
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Centred rolling mean over `windowDays` calendar days.
 * Points outside the window at either end use a shrinking window.
 */
export function movingAverage(
  points: DpsPoint[],
  metric: "rawDps" | "normDps",
  windowDays: number,
): MovingAvgPoint[] {
  if (points.length === 0) return [];
  const halfMs = (windowDays / 2) * 86_400_000;
  const epochs = points.map((p) => Date.parse(p.date.slice(0, 10) + "T00:00:00Z"));

  let left = 0;
  let right = 0;
  let sum = 0;

  return points.map((p, i) => {
    const pEpoch = epochs[i]!;
    const minEpoch = pEpoch - halfMs;
    const maxEpoch = pEpoch + halfMs;

    while (right < points.length && epochs[right]! <= maxEpoch) {
      sum += points[right]![metric];
      right++;
    }
    while (left < points.length && epochs[left]! < minEpoch) {
      sum -= points[left]![metric];
      left++;
    }
    const count = right - left;
    return { date: p.date, value: count > 0 ? sum / count : 0 };
  });
}
