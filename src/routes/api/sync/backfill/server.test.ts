import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/data', () => ({
	backfillWorkouts: vi.fn()
}));

import { POST } from './+server';
import { backfillWorkouts } from '$lib/server/data';

type Mock = ReturnType<typeof vi.fn>;

function fakeEvent(opts: { demo?: boolean } = {}) {
	return {
		locals: { demo: opts.demo ?? false },
		request: { url: 'http://localhost/api/sync/backfill' },
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

describe('POST /api/sync/backfill', () => {
	beforeEach(() => {
		(backfillWorkouts as unknown as Mock).mockReset();
	});

	it('returns a completed no-op response in demo mode', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(fakeEvent({ demo: true }) as any);
		const body = await res.json();

		expect(body).toEqual({ added: 0, oldestDate: null, done: true });
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(backfillWorkouts).not.toHaveBeenCalled();
	});

	it('returns the backfill result on success', async () => {
		const result = { added: 4, oldestDate: '2025-01-01 06:00:00', done: false };
		(backfillWorkouts as unknown as Mock).mockResolvedValue(result);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(fakeEvent() as any);
		const body = await res.json();

		expect(body).toEqual(result);
		expect(res.headers.get('cache-control')).toBe('private, no-store');
	});

	it('maps Concept2 rate-limit failures to 429', async () => {
		(backfillWorkouts as unknown as Mock).mockRejectedValue(new Error('Concept2 failed (429)'));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent() as any)).rejects.toMatchObject({
			status: 429,
			body: { message: 'Rate limit exceeded on Concept2 API. Please try again later.' }
		});
	});

	it('maps missing D1 migrations to 503', async () => {
		(backfillWorkouts as unknown as Mock).mockRejectedValue(new Error('no such table: sync_state'));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent() as any)).rejects.toMatchObject({
			status: 503
		});
	});

	it('maps D1_ERROR failures to 503 alongside the no-such-table branch', async () => {
		(backfillWorkouts as unknown as Mock).mockRejectedValue(new Error('D1_ERROR: table not found'));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent() as any)).rejects.toMatchObject({
			status: 503
		});
	});

	it('maps unexpected backfill failures to 502', async () => {
		(backfillWorkouts as unknown as Mock).mockRejectedValue(new Error('Network timeout'));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent() as any)).rejects.toMatchObject({
			status: 502,
			body: { message: 'Backfill failed: Network timeout' }
		});
	});
});
