import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	loadWorkouts: vi.fn().mockResolvedValue([
		{ id: 1001, hasStrokeData: true, date: '2026-01-01' },
		{ id: 1002, hasStrokeData: false, date: '2026-01-02' }
	]),
	syncStatus: vi.fn().mockResolvedValue({ lastSyncAt: '2026-01-02T00:00:00Z' }),
	loadHomeTimezone: vi.fn().mockResolvedValue(undefined)
}));

import { load } from './+page.server';

function fakeEvent(opts: { demo?: boolean; user?: { id: number } | null } = {}) {
	return {
		locals: { demo: opts.demo ?? false, user: opts.user ?? null },
		platform: { env: { DB: {}, SESSIONS: {} } },
		setHeaders: vi.fn()
	};
}

describe('load /settings', () => {
	it('redirects to login when not demo and not authenticated', async () => {
		const event = fakeEvent({ demo: false, user: null });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load(event as any)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
	});

	it('returns workoutCount and null sync in demo mode', async () => {
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.workoutCount).toBe(2);
		expect(data.sync).toBeNull();
		expect(data.demo).toBe(true);
	});

	it('only includes workouts with hasStrokeData in tcxWorkouts', async () => {
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.tcxWorkouts).toHaveLength(1);
		expect(data.tcxWorkouts[0].id).toBe(1001);
	});

	it('returns sync status for authenticated user', async () => {
		const event = fakeEvent({ demo: false, user: { id: 7 } });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.sync).toBeDefined();
	});
});
