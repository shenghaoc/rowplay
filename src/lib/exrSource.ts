import type { Workout } from './types';

/**
 * Returns true when the workout was logged by EXR (the virtual rowing game),
 * whose pace/power figures are algorithmically synthesised rather than
 * read from the PM5. Case-insensitive to tolerate future API capitalisation
 * changes.
 */
export function isExrSource(workout: Pick<Workout, 'source'>): boolean {
	return workout.source?.toUpperCase() === 'EXR';
}
