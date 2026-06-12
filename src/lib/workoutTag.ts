import type { Split, Workout } from "./types";

export const WORKOUT_TAGS = [
  "steady-state",
  "interval",
  "race-piece",
  "time-trial",
  "warmup-cooldown",
  "unknown",
] as const;

export type WorkoutTag = (typeof WORKOUT_TAGS)[number];

export interface TagContext {
  /** Athlete median pace (sec/500m); rules that need it are skipped when absent. */
  medianPaceSecs?: number;
}

/** Workout row or detail payload used for tag detection and display. */
export type TaggableWorkout = Workout & { splits?: Split[] };

export function isValidWorkoutTag(tag: string | null | undefined): tag is WorkoutTag {
  return tag != null && (WORKOUT_TAGS as readonly string[]).includes(tag);
}

/** Median pace across a workout list — used as the athlete baseline for tag rules. */
export function athleteMedianPace(workouts: Workout[]): number | undefined {
  const paces = workouts.map((w) => w.pace).filter((p) => p > 0);
  if (!paces.length) return undefined;
  const sorted = paces.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isRestSplit(s: Split): boolean {
  return !!s.isRest || (s.distance === 0 && s.time > 0);
}

function countWorkAndRest(workout: TaggableWorkout): { work: number; rest: number } {
  const splits = workout.splits;
  if (!splits?.length) {
    if ((workout.restTime ?? 0) > 0 || workout.isInterval) {
      return { work: 2, rest: 1 };
    }
    return { work: 1, rest: 0 };
  }

  let work = 0;
  let rest = 0;
  for (const s of splits) {
    if (isRestSplit(s)) rest++;
    else work++;
  }

  if (work >= 2 && rest === 0) {
    const workSplits = splits.filter((s) => !isRestSplit(s) && s.pace > 0);
    for (let i = 1; i < workSplits.length; i++) {
      if (Math.abs(workSplits[i]!.pace - workSplits[i - 1]!.pace) > 30) {
        rest++;
        break;
      }
    }
  }

  return { work, rest };
}

function isIntervalStructure(workout: TaggableWorkout): boolean {
  const { work, rest } = countWorkAndRest(workout);
  return work >= 2 && rest >= 1;
}

function isSinglePiece(workout: TaggableWorkout): boolean {
  return !isIntervalStructure(workout);
}

function averagePace(workout: TaggableWorkout): number {
  if (workout.pace > 0) return workout.pace;
  const paces =
    workout.splits?.filter((s) => !isRestSplit(s) && s.pace > 0).map((s) => s.pace) ?? [];
  if (!paces.length) return 0;
  return paces.reduce((a, p) => a + p, 0) / paces.length;
}

function paceStdDev(workout: TaggableWorkout): number {
  const paces =
    workout.splits?.filter((s) => !isRestSplit(s) && s.pace > 0).map((s) => s.pace) ?? [];
  if (paces.length < 2) return 0;
  const mean = paces.reduce((a, p) => a + p, 0) / paces.length;
  const variance = paces.reduce((a, p) => a + (p - mean) ** 2, 0) / paces.length;
  return Math.sqrt(variance);
}

/**
 * Auto-detect the workout type from split / interval structure (no network, no DOM).
 */
export function autoDetectTag(workout: TaggableWorkout, ctx?: TagContext): WorkoutTag {
  if (workout.distance <= 0 || workout.time <= 0) return "unknown";
  if (isIntervalStructure(workout)) return "interval";
  if (!isSinglePiece(workout)) return "unknown";

  const durationMin = workout.time / 60;
  const median = ctx?.medianPaceSecs;
  const avgPace = averagePace(workout);
  const std = paceStdDev(workout);

  if (median != null && median > 0 && durationMin < 8 && avgPace > median * 1.25) {
    return "warmup-cooldown";
  }

  if (durationMin < 12 || workout.distance <= 2000) {
    if (median == null || median <= 0 || avgPace <= median * 1.25) {
      return "race-piece";
    }
  }

  if (durationMin >= 12 && durationMin <= 35 && std < 3) return "time-trial";
  if (durationMin > 35 && std < 6) return "steady-state";

  return "unknown";
}

/** Effective tag: valid user override, otherwise auto-detected. */
export function resolveTag(workout: TaggableWorkout, ctx?: TagContext): WorkoutTag {
  if (isValidWorkoutTag(workout.userTag)) return workout.userTag;
  return autoDetectTag(workout, ctx);
}

export function tagBadgeClass(tag: WorkoutTag): string {
  switch (tag) {
    case "steady-state":
      return "badge-info";
    case "race-piece":
    case "time-trial":
      return "badge-success";
    case "interval":
      return "badge-warning";
    case "warmup-cooldown":
      return "badge-neutral";
    default:
      return "badge-ghost";
  }
}
