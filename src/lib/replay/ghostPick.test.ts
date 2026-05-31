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
});
