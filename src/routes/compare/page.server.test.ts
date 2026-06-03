import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	loadWorkouts: vi.fn().mockResolvedValue([{ id: 1001 }, { id: 1002 }]),
	loadWorkoutDetail: vi.fn()
}));

import { load } from './+page.server';
import { loadWorkoutDetail } from '$lib/server/data';

const sampleDetailA = {
	id: 1001, date: '2026-01-01 06:00:00', sport: 'rower' as const,
	distance: 2000, time: 480, pace: 120, hasStrokeData: true,
	strokes: [], splits: [], isInterval: false
};

const sampleDetailB = {
	id: 1002, date: '2026-02-01 06:00:00', sport: 'rower' as const,
	distance: 5000, time: 1200, pace: 120, hasStrokeData: true,
	strokes: [], splits: [], isInterval: false
};

function fakeEvent(opts: {
	demo?: boolean;
	user?: { id: number } | null;
	a?: string;
	b?: string;
} = {}) {
	const params = new URLSearchParams();
	if (opts.a) params.set('a', opts.a);
	if (opts.b) params.set('b', opts.b);
	return {
		locals: { demo: opts.demo ?? false, user: opts.user ?? null },
		url: new URL(`http://localhost/compare?${params.toString()}`),
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

describe('load /compare', () => {
	// clearAllMocks resets call history so per-test call-count assertions are clean.
	beforeEach(() => vi.clearAllMocks());

	it('redirects to login when not demo and not authenticated', async () => {
		const event = fakeEvent({ demo: false, user: null });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load(event as any)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
	});

	it('returns null details when no ids provided', async () => {
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.detailA).toBeNull();
		expect(data.detailB).toBeNull();
		expect(data.idA).toBeNull();
		expect(data.idB).toBeNull();
	});

	it('loads both workout details when ids are provided', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce(sampleDetailA)
			.mockResolvedValueOnce(sampleDetailB);
		const event = fakeEvent({ demo: true, a: '1001', b: '1002' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.detailA?.id).toBe(1001);
		expect(data.detailB?.id).toBe(1002);
	});

	it('sets detail to null when loadWorkoutDetail throws', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));
		const event = fakeEvent({ demo: true, a: '9999' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.detailA).toBeNull();
		expect(data.idA).toBeNull();
	});

	it('ignores invalid (non-numeric) ids', async () => {
		const event = fakeEvent({ demo: true, a: 'abc', b: 'xyz' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.idA).toBeNull();
		expect(data.idB).toBeNull();
		// vi.clearAllMocks resets call counts in beforeEach — no call expected here
		expect((loadWorkoutDetail as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
	});
});
