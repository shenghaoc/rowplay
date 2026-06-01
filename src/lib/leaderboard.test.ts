import { describe, expect, it } from 'vitest';
import {
	boardKey,
	buildBoards,
	findBoard,
	matchStandardDistance,
	rankEntries,
	STANDARD_DISTANCES,
	type LeaderboardEntry
} from './leaderboard';

function entry(p: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'time'>): LeaderboardEntry {
	return {
		sport: 'rower',
		distance: 2000,
		displayName: 'Otter',
		pace: p.time / (2000 / 500),
		date: '2026-05-01 06:00:00',
		workoutId: 1,
		...p
	};
}

describe('matchStandardDistance', () => {
	it('snaps an exact standard distance to itself', () => {
		for (const std of STANDARD_DISTANCES) {
			expect(matchStandardDistance(std)).toBe(std);
		}
	});

	it('snaps a near-standard distance within tolerance', () => {
		expect(matchStandardDistance(2008)).toBe(2000); // within 2%
		expect(matchStandardDistance(497)).toBe(500); // within max(10, 2%)
		expect(matchStandardDistance(10090)).toBe(10000);
	});

	it('rejects a distance outside tolerance', () => {
		expect(matchStandardDistance(2200)).toBeNull();
		expect(matchStandardDistance(750)).toBeNull(); // between 500 and 1000
		expect(matchStandardDistance(0)).toBeNull();
		expect(matchStandardDistance(NaN)).toBeNull();
	});

	it('snaps within the ±10m floor for short distances', () => {
		expect(matchStandardDistance(508)).toBe(500); // diff 8 <= 10m floor
		expect(matchStandardDistance(511)).toBeNull(); // diff 11 > 10m floor
	});
});

describe('rankEntries', () => {
	it('orders fastest-first with 1-based ranks and gaps', () => {
		const ranked = rankEntries([
			entry({ time: 420, displayName: 'Slow' }),
			entry({ time: 400, displayName: 'Fast' }),
			entry({ time: 410, displayName: 'Mid' })
		]);
		expect(ranked.map((e) => e.displayName)).toEqual(['Fast', 'Mid', 'Slow']);
		expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
		expect(ranked.map((e) => e.gapSeconds)).toEqual([0, 10, 20]);
	});

	it('shares a rank on a time tie and skips the tied position after', () => {
		const ranked = rankEntries([
			entry({ time: 400, displayName: 'A', date: '2026-05-01 06:00:00' }),
			entry({ time: 400, displayName: 'B', date: '2026-05-02 06:00:00' }),
			entry({ time: 410, displayName: 'C' })
		]);
		// Tie at rank 1 (newer date lists first); next distinct time is rank 3.
		expect(ranked.map((e) => e.displayName)).toEqual(['B', 'A', 'C']);
		expect(ranked.map((e) => e.rank)).toEqual([1, 1, 3]);
	});

	it('returns an empty array for no entries', () => {
		expect(rankEntries([])).toEqual([]);
	});
});

describe('buildBoards', () => {
	it('groups by (sport, distance) and ranks each board', () => {
		const boards = buildBoards([
			entry({ sport: 'rower', distance: 2000, time: 410 }),
			entry({ sport: 'rower', distance: 2000, time: 400 }),
			entry({ sport: 'rower', distance: 500, time: 95 }),
			entry({ sport: 'skierg', distance: 1000, time: 200 })
		]);
		// Stable order: rower 500, rower 2000, skierg 1000.
		expect(boards.map((b) => boardKey(b.sport, b.distance))).toEqual([
			'rower:500',
			'rower:2000',
			'skierg:1000'
		]);
		const rower2k = findBoard(boards, 'rower', 2000)!;
		expect(rower2k.entries.map((e) => e.time)).toEqual([400, 410]);
		expect(rower2k.entries[0].rank).toBe(1);
	});

	it('findBoard returns null for an absent board', () => {
		const boards = buildBoards([entry({ time: 400 })]);
		expect(findBoard(boards, 'bike', 8000)).toBeNull();
	});
});
