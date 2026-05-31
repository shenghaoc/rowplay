import { distanceBand } from '$lib/analytics';
import type { Sport, Workout } from '$lib/types';

export interface GhostPickContext {
	id: number;
	distance: number;
	sport: Sport;
}

/**
 * Pick a meaningful default ghost rival: same distance band, closest metres,
 * then fastest pace (PB-like), then most recent session.
 */
export function pickDefaultGhostCandidate(
	candidates: Workout[],
	current: GhostPickContext
): Workout | null {
	const pool = candidates.filter((c) => c.id !== current.id && c.sport === current.sport);
	if (!pool.length) return null;

	const band = distanceBand(current.distance);
	const inBand = pool.filter((c) => distanceBand(c.distance).key === band.key);
	const ranked = [...(inBand.length ? inBand : pool)].sort((a, b) => {
		const distDiff = Math.abs(a.distance - current.distance) - Math.abs(b.distance - current.distance);
		if (distDiff !== 0) return distDiff;
		if (a.pace !== b.pace) return a.pace - b.pace;
		return b.date.localeCompare(a.date);
	});
	return ranked[0] ?? null;
}
