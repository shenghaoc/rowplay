import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	listQueryFromEvent: vi.fn().mockReturnValue({ sport: null, distance: null, sort: 'date' }),
	loadWorkouts: vi.fn().mockResolvedValue([]),
	loadWorkoutList: vi.fn().mockResolvedValue([]),
	loadDashboardAggregates: vi.fn().mockResolvedValue({ totalDistance: 0, totalTime: 0, workoutCount: 0 }),
	loadAnnualGoal: vi.fn().mockResolvedValue(null),
	syncStatus: vi.fn().mockResolvedValue({ lastSyncAt: null }),
	loadHomeTimezone: vi.fn().mockResolvedValue(undefined)
}));

import { load } from './+page.server';

function fakeEvent(opts: { demo?: boolean; user?: { id: number } | null } = {}) {
	return {
		locals: { demo: opts.demo ?? false, user: opts.user ?? null },
		url: new URL('http://localhost/dashboard'),
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

describe('load /dashboard', () => {
	it('redirects to login when not demo and not authenticated', async () => {
		const event = fakeEvent({ demo: false, user: null });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load(event as any)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
	});

	it('returns data in demo mode', async () => {
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.demo).toBe(true);
		expect(Array.isArray(data.workouts)).toBe(true);
		expect(data.sync).toBeNull(); // demo mode => no sync
	});

	it('returns data for authenticated user', async () => {
		const event = fakeEvent({ demo: false, user: { id: 7 } });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.demo).toBe(false);
		expect(data.workouts).toBeDefined();
	});

	it('includes calendarEndDay in ISO format', async () => {
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.calendarEndDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
