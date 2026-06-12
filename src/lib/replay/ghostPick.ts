import { distanceBand } from "$lib/analytics";
import { areComparable, classifyAxis } from "$lib/replay/comparabilityGuard";
import type { Sport, Workout } from "$lib/types";

export interface GhostPickContext {
  id: number;
  distance: number;
  sport: Sport;
  /** Total elapsed seconds (for time-axis comparability). */
  time?: number;
  /** Concept2 workout_type (for axis classification; D1 columns are string | null). */
  workoutType?: string | null;
}

function toComparable(current: GhostPickContext) {
  return {
    sport: current.sport,
    distance: current.distance,
    time: current.time ?? 0,
    workoutType: current.workoutType,
  };
}

function workoutToComparable(w: Workout) {
  return {
    sport: w.sport,
    distance: w.distance,
    time: w.time,
    workoutType: w.workoutType,
  };
}

/**
 * Pick a meaningful default ghost rival: same comparability band, closest metres,
 * then fastest pace (PB-like), then most recent session.
 */
export function pickDefaultGhostCandidate(
  candidates: Workout[],
  current: GhostPickContext,
): Workout | null {
  const currentCtx = toComparable(current);
  const pool = candidates.filter(
    (c) => c.id !== current.id && areComparable(currentCtx, workoutToComparable(c)),
  );
  if (!pool.length) return null;

  // `pool` is already band-matched by areComparable. For time-axis pieces the
  // shared band is the duration band, so ranking by distance band (below) would
  // wrongly drop a legitimately comparable session that happens to cover a
  // different distance (e.g. two 30-min rows at 7500 m vs 6500 m). Rank those by
  // closeness in elapsed time instead.
  if (classifyAxis(current.workoutType) === "time") {
    const target = current.time ?? 0;
    const ranked = [...pool].sort((a, b) => {
      const dt = Math.abs(a.time - target) - Math.abs(b.time - target);
      if (dt !== 0) return dt;
      if (a.pace !== b.pace) return a.pace - b.pace;
      return b.date.localeCompare(a.date);
    });
    return ranked[0] ?? null;
  }

  const band = distanceBand(current.distance);
  const inBand = pool.filter((c) => distanceBand(c.distance).key === band.key);
  const ranked = [...(inBand.length ? inBand : pool)].sort((a, b) => {
    const distDiff =
      Math.abs(a.distance - current.distance) - Math.abs(b.distance - current.distance);
    if (distDiff !== 0) return distDiff;
    if (a.pace !== b.pace) return a.pace - b.pace;
    return b.date.localeCompare(a.date);
  });
  return ranked[0] ?? null;
}
