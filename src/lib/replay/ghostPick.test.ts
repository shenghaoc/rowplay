import { describe, expect, it } from 'vitest';
import { pickDefaultGhostCandidate } from './ghostPick';
import type { Workout } from '$lib/types';

function w(id: number, distance: number, pace: number, date: string): Workout {
	return {
		id,
		date,
		sport: 'rower',
		distance,
		time: 600,
		pace,
		hasStrokeData: true,
		workoutType: 'test'
	};
}

describe('pickDefaultGhostCandidate', () => {
	it('prefers same distance band and closest metres', () => {
		const current = { id: 1, distance: 2000, sport: 'rower' as const };
		const candidates = [
			w(2, 5000, 110, '2026-01-01'),
			w(3, 2010, 115, '2026-02-01'),
			w(4, 10000, 120, '2026-03-01')
		];
		expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
	});

	it('excludes the current workout id', () => {
		const current = { id: 2, distance: 2000, sport: 'rower' as const };
		const candidates = [w(2, 2000, 110, '2026-01-01'), w(3, 2005, 112, '2026-02-01')];
		expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
	});

	it('falls back to the full pool when no candidate shares the band', () => {
		const current = { id: 1, distance: 2000, sport: 'rower' as const };
		const candidates = [w(2, 5000, 110, '2026-01-01'), w(3, 10000, 120, '2026-03-01')];
		// No 2k-band candidate, so it ranks the whole pool by closest metres.
		expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(2);
	});

	it('breaks an equidistant tie by fastest pace, not most recent', () => {
		const current = { id: 1, distance: 2000, sport: 'rower' as const };
		const candidates = [
			w(2, 1950, 120, '2026-05-01'), // equidistant, slower pace, more recent
			w(3, 2050, 110, '2026-01-01') // equidistant, faster pace, older
		];
		expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
	});

	it('breaks a distance+pace tie by most recent date', () => {
		const current = { id: 1, distance: 2000, sport: 'rower' as const };
		const candidates = [
			w(2, 1950, 115, '2026-01-01'),
			w(3, 2050, 115, '2026-05-01') // same metres-diff and pace, more recent
		];
		expect(pickDefaultGhostCandidate(candidates, current)?.id).toBe(3);
	});
});
