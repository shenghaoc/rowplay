import { distanceBand, durationBand } from '$lib/analytics';
import type { Sport } from '$lib/types';

export type { DurationBand } from '$lib/analytics';
export { durationBand } from '$lib/analytics';

export type ComparabilityAxis = 'distance' | 'time';

const TIME_AXIS_MARKERS = ['JustRow', 'JustSki', 'JustBike', 'FixedTime'] as const;

/**
 * Map a Concept2 workout_type string to its comparability axis.
 * Time-axis types are explicitly timed workouts; everything else —
 * including undefined / unknown strings — is distance-axis.
 */
export function classifyAxis(workoutType: string | undefined): ComparabilityAxis {
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
	/** Concept2 workout_type string (may be absent). */
	workoutType?: string;
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
