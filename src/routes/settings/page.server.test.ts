import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('$lib/server/data', () => ({
	loadWorkouts: vi.fn().mockResolvedValue([
		{ id: 1001, hasStrokeData: true, date: '2026-01-01' },
		{ id: 1002, hasStrokeData: false, date: '2026-01-02' }
	]),
	syncStatus: vi.fn().mockResolvedValue(null),
	loadHomeTimezone: vi.fn().mockResolvedValue(undefined)
}));

import { loadWorkouts, syncStatus } from '$lib/server/data';
import { load } from './+page.server';

function authedEvent(opts: { demo?: boolean } = {}) {
	return {
		locals: { demo: opts.demo ?? false, user: { id: 7 } },
		platform: { env: { DB: {}, SESSIONS: {} } },
		setHeaders: vi.fn()
	};
}

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

	it('loads sync state with inProgress flag', async () => {
		(loadWorkouts as Mock).mockResolvedValue([]);
		(syncStatus as Mock).mockResolvedValue({
			lastDate: '2026-06-01', lastSyncAt: 1717000000000, total: 5,
			oldestDate: '2025-01-01', backfillDone: false,
			inProgress: true, lastError: null, lastErrorAt: 0,
			historyWindowMonths: 12
		});
		const event = authedEvent();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await load(event as any) as any;
		expect(result.sync?.inProgress).toBe(true);
	});

	it('loads sync state with lastError', async () => {
		(loadWorkouts as Mock).mockResolvedValue([]);
		(syncStatus as Mock).mockResolvedValue({
			lastDate: null, lastSyncAt: 0, total: 0,
			oldestDate: null, backfillDone: false,
			inProgress: false, lastError: 'Network timeout', lastErrorAt: 1717000000000,
			historyWindowMonths: 12
		});
		const event = authedEvent();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await load(event as any) as any;
		expect(result.sync?.lastError).toBe('Network timeout');
	});
});
