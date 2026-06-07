import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	syncWorkouts: vi.fn(),
	syncStatus: vi.fn()
}));

import { POST } from './+server';
import { syncWorkouts, syncStatus } from '$lib/server/data';

function fakeEvent(opts: { demo?: boolean; url?: string } = {}) {
	return {
		locals: { demo: opts.demo ?? false },
		request: { url: opts.url ?? 'http://localhost/api/sync' },
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

describe('POST /api/sync', () => {
	it('throws 400 in demo mode', async () => {
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(event as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns sync result on success', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue({ added: 5, total: 10, workouts: [], newPbs: [] });
		(syncStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ backfillDone: true, inProgress: false });
		const event = fakeEvent({ url: 'http://localhost/api/sync' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(event as any);
		const body = await res.json();
		expect(body.added).toBe(5);
	});

	it('passes full=1 param to syncWorkouts', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue({ added: 0, total: 0, workouts: [], newPbs: [] });
		(syncStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ backfillDone: true, inProgress: false });
		const event = fakeEvent({ url: 'http://localhost/api/sync?full=1' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await POST(event as any);
		expect(syncWorkouts).toHaveBeenCalledWith(expect.anything(), true);
	});

	it('throws 503 when D1 migration is missing', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no such table: workouts'));
		const event = fakeEvent();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(event as any)).rejects.toMatchObject({ status: 503 });
	});

	it('includes sync state in successful response', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue({ added: 5, total: 10, workouts: [], newPbs: [] });
		(syncStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
			lastDate: '2026-06-01', lastSyncAt: 1717000000000, total: 10,
			oldestDate: '2025-06-01', backfillDone: true,
			inProgress: false, lastError: null, lastErrorAt: 0,
			historyWindowMonths: 12
		});
		const event = fakeEvent({ url: 'http://localhost/api/sync' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(event as any);
		const body = await res.json();
		expect(body.sync).toBeDefined();
		expect(body.sync.backfillDone).toBe(true);
		expect(body.sync.inProgress).toBe(false);
	});

	it('throws 502 on other sync errors', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network timeout'));
		const event = fakeEvent();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(event as any)).rejects.toMatchObject({ status: 502 });
	});
});
