import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	loadWorkoutDetail: vi.fn()
}));

import { GET } from './+server';
import { loadWorkoutDetail } from '$lib/server/data';

const sampleDetail = {
	id: 1001, date: '2026-01-01 06:00:00', sport: 'rower' as const,
	distance: 2000, time: 480, pace: 120, hasStrokeData: true,
	strokes: [], splits: [], isInterval: false
};

function fakeEvent(id: string) {
	return {
		params: { id },
		locals: { demo: true },
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

describe('GET /api/workouts/[id]', () => {
	it('throws 400 for non-numeric id', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(GET(fakeEvent('abc') as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns workout detail for valid id', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await GET(fakeEvent('1001') as any);
		const body = await res.json();
		expect(body.id).toBe(1001);
	});
});
