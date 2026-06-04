import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/leaderboard', () => ({
	publishWorkout: vi.fn().mockResolvedValue({ rank: 1, board: { sport: 'rower', distance: 2000 } }),
	withdrawWorkout: vi.fn().mockResolvedValue(undefined)
}));

import { DELETE, POST } from './+server';

function fakeEvent(body: unknown) {
	return {
		locals: { demo: false, user: { id: 7 } },
		request: {
			json: async () => {
				if (body === '__throw__') throw new Error('bad json');
				return body;
			}
		},
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

describe('POST /api/leaderboard/publish', () => {
	it('throws 400 when body is not valid JSON', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent('__throw__') as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when workoutId is missing', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({}) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when workoutId is not a positive integer', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({ workoutId: -1 }) as any)).rejects.toMatchObject({ status: 400 });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({ workoutId: 1.5 }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when body is null', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent(null) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns publish result for valid workoutId', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(fakeEvent({ workoutId: 1001 }) as any);
		const body = await res.json();
		expect(body.rank).toBe(1);
	});
});

describe('DELETE /api/leaderboard/publish', () => {
	it('throws 400 when workoutId is invalid', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(DELETE(fakeEvent({ workoutId: 'abc' }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns ok:true on success', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await DELETE(fakeEvent({ workoutId: 1001 }) as any);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});
});
