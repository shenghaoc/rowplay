import { distancePerStroke as dpsFromPaceSpm } from '$lib/analytics';
import type { Sport, Split, Stroke } from '$lib/types';

/** Concept2 wire representation reconstructed from a normalized stroke. */
export interface LoggedStroke {
	/** Tenths of a second since interval/workout start. */
	t: number;
	/** Decimetres. */
	d: number;
	/** Pace tenths; per-500m row/ski, per-1000m bike. */
	p: number;
	spm: number;
	hr?: number;
}

/** Inverse of `concept2.ts > mapStrokes` for a single sample. */
export function asLoggedStroke(s: Stroke, sport: Sport): LoggedStroke {
	const paceMul = sport === 'bike' ? 2 : 1;
	return {
		t: Math.round(s.t * 10),
		d: Math.round(s.d * 10),
		p: Math.round(s.pace * 10 * paceMul),
		spm: s.spm,
		...(s.hr != null ? { hr: Math.round(s.hr) } : {})
	};
}

/** Metres per stroke at this instant; undefined when pace or rate is invalid. */
export function distancePerStroke(s: Stroke): number | undefined {
	if (s.pace <= 0 || s.spm <= 0) return undefined;
	const dps = dpsFromPaceSpm(s.pace, s.spm);
	return dps > 0 ? dps : undefined;
}

/** Split/interval index (0-based) for cumulative distance, or null when no splits. */
export function splitIndexAt(splits: Split[], distanceM: number): number | null {
	if (!splits.length || distanceM < 0) return null;
	let cum = 0;
	for (let i = 0; i < splits.length; i++) {
		cum += splits[i].distance;
		if (distanceM <= cum) return i;
	}
	return splits.length - 1;
}
