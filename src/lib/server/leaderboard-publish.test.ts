import { describe, expect, it, vi } from 'vitest';

// Mock heavy dependencies that require real D1/KV infrastructure.
vi.mock('./data', () => ({ loadWorkouts: vi.fn() }));
vi.mock('./db', () => ({
	getLeaderboardEntries: vi.fn().mockResolvedValue([]),
	upsertLeaderboardEntry: vi.fn().mockResolvedValue(undefined),
	deleteLeaderboardEntry: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./share', () => ({
	createWorkoutShare: vi.fn().mockResolvedValue({ token: 'abc123tok', path: '/r/abc123tok', url: 'https://example.com/r/abc123tok', created: true })
}));

import { loadBoards, publishWorkout } from './leaderboard';
import { loadWorkouts } from './data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function demoEvent(): any {
	return {
		locals: { demo: true, user: null },
		platform: { env: { DB: undefined } }
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authedEvent(user: { id: number; username: string }): any {
	return {
		locals: { demo: false, user },
		platform: { env: { DB: { prepare: () => ({ bind: function() { return this; }, first: async () => ({ rank: 3 }) }) } } }
	};
}

describe('loadBoards — demo mode', () => {
	it('returns boards with entries in demo mode', async () => {
		const boards = await loadBoards(demoEvent());
		expect(Array.isArray(boards)).toBe(true);
		expect(boards.length).toBeGreaterThan(0);
	});

	it('each board has sport, distance, and entries array', async () => {
		const boards = await loadBoards(demoEvent());
		for (const b of boards) {
			expect(b.sport).toBeDefined();
			expect(b.distance).toBeGreaterThan(0);
			expect(Array.isArray(b.entries)).toBe(true);
		}
	});
});

describe('publishWorkout — demo mode', () => {
	it('returns a valid PublishResult for a standard-distance demo workout', async () => {
		// id 1001 is a 2000m workout in mock data
		const result = await publishWorkout(demoEvent(), 1001);
		expect(result.board.distance).toBe(2000);
		expect(result.board.sport).toBeDefined();
		expect(typeof result.rank).toBe('number');
	});

	it('throws 404 when the workout id is not in demo data', async () => {
		await expect(publishWorkout(demoEvent(), 99999)).rejects.toMatchObject({ status: 404 });
	});

	it('throws 422 for a non-standard distance workout', async () => {
		// id 1004 is a BikeErg 8000m — not a standard board distance
		await expect(publishWorkout(demoEvent(), 1004)).rejects.toMatchObject({ status: 422 });
	});
});

describe('publishWorkout — auth guard', () => {
	it('throws 401 when not authenticated and not demo', async () => {
		(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		const event = { locals: { demo: false, user: null }, platform: { env: { DB: {} } } };
		await expect(publishWorkout(event as never, 1001)).rejects.toMatchObject({ status: 401 });
	});
});
