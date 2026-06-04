import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/mockData', () => ({
	mockWorkouts: vi.fn().mockReturnValue([{ id: 1001 }, { id: 1002 }]),
	generateMockWorkout: vi.fn().mockReturnValue({ id: 2001, date: '2026-06-01', distance: 2000, time: 480, pace: 120, sport: 'rower' })
}));

import { POST } from './+server';

describe('POST /api/live/mock', () => {
	it('throws 400 when not in demo mode', async () => {
		const event = { locals: { demo: false } };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(event as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns generated workout in demo mode', async () => {
		const event = { locals: { demo: true } };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(event as any);
		const body = await res.json();
		expect(body.workouts).toHaveLength(1);
		expect(body.added).toBe(1);
	});
});
