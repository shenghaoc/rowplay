import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	syncWorkouts: vi.fn()
}));

import { POST } from './+server';
import { syncWorkouts } from '$lib/server/data';

function fakeEvent(demo = false) {
	return { locals: { demo }, platform: { env: { DB: {}, SESSIONS: {} } } };
}

describe('POST /api/live/poll', () => {
	it('returns empty result in demo mode without calling syncWorkouts', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(fakeEvent(true) as any);
		const body = await res.json();
		expect(body.added).toBe(0);
		expect(body.workouts).toEqual([]);
		expect(syncWorkouts).not.toHaveBeenCalled();
	});

	it('returns sync result on success', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue({ added: 2, total: 5, workouts: [], newPbs: [] });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(fakeEvent() as any);
		const body = await res.json();
		expect(body.added).toBe(2);
	});

	it('throws 503 on D1 migration error', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('D1_ERROR: no such table'));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent() as any)).rejects.toMatchObject({ status: 503 });
	});

	it('throws 502 on generic sync error', async () => {
		(syncWorkouts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent() as any)).rejects.toMatchObject({ status: 502 });
	});
});
