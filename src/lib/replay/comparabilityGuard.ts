import { distanceBand, durationBand } from '$lib/analytics';
import type { Sport } from '$lib/types';

export type { DurationBand } from '$lib/analytics';
export { durationBand } from '$lib/analytics';

export type ComparabilityAxis = 'distance' | 'time';

// Concept2 workout_type is machine-agnostic: `JustRow` is the only "Just*" value
// (it covers every erg, recording elapsed time as its axis), and `FixedTime`
// catches the documented `FixedTimeSplits` / `FixedTimeInterval` types. There is
// no `JustSki` / `JustBike` in the API.
const TIME_AXIS_MARKERS = ['JustRow', 'FixedTime'] as const;

/**
 * Map a Concept2 workout_type string to its comparability axis.
 * Time-axis types are explicitly timed workouts; everything else — including
 * undefined / unknown strings, and the calorie / watt-minute / variable-interval
 * types (`FixedCalorie*`, `FixedWattMinute*`, `VariableInterval*`) — falls
 * through to distance-axis. That fallback is a safe default: Concept2's default
 * piece is fixed-distance, so an unclassified type is bucketed by distance band
 * rather than blocked outright.
 */
export function classifyAxis(workoutType: string | null | undefined): ComparabilityAxis {
	if (!workoutType) return 'distance';
	const upper = workoutType.toUpperCase();
	for (const marker of TIME_AXIS_MARKERS) {
		if (upper.includes(marker.toUpperCase())) return 'time';
	}
	return 'distance';
}

export interface ComparableContext {
	sport: Sport;
	/** Total distance in metres. */
	distance: number;
	/** Total elapsed time in seconds. */
	time: number;
	/** Concept2 workout_type string (may be absent; D1 columns are string | null). */
	workoutType?: string | null;
}

/**
 * Hard-block predicate. Returns true only when a and b are genuinely
 * like-for-like: same sport, same axis (distance vs time), same axis-band.
 */
export function areComparable(a: ComparableContext, b: ComparableContext): boolean {
	if (a.sport !== b.sport) return false;
	const axisA = classifyAxis(a.workoutType);
	const axisB = classifyAxis(b.workoutType);
	if (axisA !== axisB) return false;
	if (axisA === 'distance') {
		return distanceBand(a.distance).key === distanceBand(b.distance).key;
	}
	return durationBand(a.time).key === durationBand(b.time).key;
}
