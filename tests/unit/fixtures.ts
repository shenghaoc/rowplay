import type { Split, Sport, Stroke, Workout } from '../../src/lib/types';

/** Minimal stroke ladder for interpolation tests. */
export function ladderStrokes(): Stroke[] {
	return [
		{ t: 0, d: 0, pace: 120, spm: 28, hr: 140, watts: 100 },
		{ t: 10, d: 50, pace: 110, spm: 30, hr: 150, watts: 120 },
		{ t: 20, d: 100, pace: 100, spm: 32, hr: 160, watts: 140 }
	];
}

/** Two-interval strokes with per-interval `t` reset (post-normalisation shape). */
export function intervalResetStrokes(): Stroke[] {
	const rep1: Stroke[] = [
		{ t: 0, d: 0, pace: 120, spm: 28, watts: 100 },
		{ t: 5, d: 25, pace: 118, spm: 29, watts: 105 },
		{ t: 10, d: 50, pace: 116, spm: 30, watts: 110 }
	];
	const rep2: Stroke[] = [
		{ t: 0, d: 0, pace: 122, spm: 27, watts: 95 },
		{ t: 5, d: 25, pace: 120, spm: 28, watts: 100 },
		{ t: 10, d: 50, pace: 118, spm: 29, watts: 105 }
	];
	return [...rep1, ...rep2];
}

export const intervalSplits: Split[] = [
	{ index: 0, distance: 500, time: 120, pace: 120, spm: 28 },
	{ index: 1, distance: 500, time: 122, pace: 122, spm: 27 }
];

export function workout(overrides: Partial<Workout> & Pick<Workout, 'id'>): Workout {
	return {
		date: '2026-05-01 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: true,
		...overrides
	};
}

/**
 * Bike logbook pace is per-1000m (tenths of a second in the API).
 * Normalised sec/500m matches `concept2.ts > mapStrokes`.
 */
export function bikePaceSecPer500(apiPaceTenths: number): number {
	return apiPaceTenths / 10 / 2;
}

export function normalizeRawStrokes(
	raw: { t: number; d: number; p: number; spm: number; hr?: number }[],
	sport: Sport
): Stroke[] {
	const paceDiv = sport === 'bike' ? 2 : 1;
	let tOffset = 0;
	let dOffset = 0;
	let prevT = 0;
	let prevD = 0;
	return raw.map((s) => {
		const rawT = s.t / 10;
		const rawD = s.d / 10;
		if (rawT < prevT) tOffset += prevT;
		if (rawD < prevD) dOffset += prevD;
		prevT = rawT;
		prevD = rawD;
		const pace = s.p / 10 / paceDiv;
		return {
			t: rawT + tOffset,
			d: rawD + dOffset,
			pace,
			spm: s.spm,
			hr: s.hr,
			watts: 0
		};
	});
}
