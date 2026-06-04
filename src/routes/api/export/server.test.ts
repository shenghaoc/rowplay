import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	loadWorkouts: vi.fn()
}));
vi.mock('$lib/server/export', () => ({
	exportFilename: vi.fn().mockReturnValue('export.csv'),
	workoutsToCsv: vi.fn().mockReturnValue('date,distance\n2026-01-01,2000'),
	workoutsToJson: vi.fn().mockReturnValue('[]')
}));

import { GET } from './+server';
import { loadWorkouts } from '$lib/server/data';

const sampleWorkouts = [
	{ id: 1, date: '2026-01-01', distance: 2000, time: 480, pace: 120, sport: 'rower' }
];

function fakeEvent(format?: string) {
	const url = format
		? `http://localhost/api/export?format=${format}`
		: 'http://localhost/api/export';
	return {
		request: { url },
		locals: { demo: true },
		url: new URL(url)
	};
}

describe('GET /api/export', () => {
	it('throws 404 when no workouts exist', async () => {
		(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(GET(fakeEvent() as any)).rejects.toMatchObject({ status: 404 });
	});

	it('returns csv when format=csv', async () => {
		(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await GET(fakeEvent('csv') as any);
		expect(res.headers.get('content-type')).toContain('text/csv');
	});

	it('returns json when format=json (default)', async () => {
		(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await GET(fakeEvent('json') as any);
		expect(res.headers.get('content-type')).toContain('application/json');
	});

	it('defaults to json when no format specified', async () => {
		(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await GET(fakeEvent() as any);
		expect(res.headers.get('content-type')).toContain('application/json');
	});

	it('throws 400 for unsupported format', async () => {
		(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(GET(fakeEvent('xml') as any)).rejects.toMatchObject({ status: 400 });
	});
});
