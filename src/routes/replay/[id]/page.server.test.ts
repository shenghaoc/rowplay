import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	loadWorkoutDetail: vi.fn(),
	loadAnnotations: vi.fn().mockResolvedValue([]),
	loadWorkouts: vi.fn().mockResolvedValue([])
}));
vi.mock('$lib/server/db', () => ({
	isWorkoutPublished: vi.fn().mockResolvedValue(false)
}));

import { load } from './+page.server';
import { loadWorkoutDetail, loadWorkouts } from '$lib/server/data';

const sampleDetail = {
	id: 1001, date: '2026-01-01 06:00:00', sport: 'rower' as const,
	distance: 2000, time: 480, pace: 120, hasStrokeData: true,
	strokes: [], splits: [], isInterval: false
};

function fakeEvent(opts: { demo?: boolean; user?: { id: number } | null; id?: string } = {}) {
	return {
		params: { id: opts.id ?? '1001' },
		locals: { demo: opts.demo ?? false, user: opts.user ?? null },
		platform: { env: { DB: {} } }
	};
}

describe('load /replay/[id]', () => {
	it('redirects to login when not demo and not authenticated', async () => {
		const event = fakeEvent({ demo: false, user: null });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load(event as any)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
	});

	it('returns detail in demo mode', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.detail.id).toBe(1001);
		expect(data.demo).toBe(true);
	});

	it('filters candidates to same sport, excluding current workout', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
		(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 1001, sport: 'rower', pace: 120 }, // same id → excluded
			{ id: 1002, sport: 'rower', pace: 115 }, // same sport → included
			{ id: 1003, sport: 'bike', pace: 100 }   // different sport → excluded
		]);
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.candidates).toHaveLength(1);
		expect(data.candidates[0].id).toBe(1002);
	});

	it('sets published=false in demo mode (no DB check)', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
		const event = fakeEvent({ demo: true });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(data.published).toBe(false);
	});
});
