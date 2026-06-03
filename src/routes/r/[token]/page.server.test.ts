import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/share', () => ({
	loadSharedWorkout: vi.fn(),
	shareMeta: vi.fn().mockReturnValue({ title: 'Workout', description: '2000m' })
}));
vi.mock('$lib/server/db', () => ({
	getAnnotationsByShareToken: vi.fn().mockResolvedValue([])
}));
vi.mock('$lib/server/config', () => ({
	getConfig: vi.fn().mockReturnValue({ appUrl: 'https://rowplay.example.com' })
}));

import { load } from './+page.server';
import { loadSharedWorkout } from '$lib/server/share';

const sampleDetail = {
	id: 1001, date: '2026-01-01 06:00:00', sport: 'rower' as const,
	distance: 2000, time: 480, pace: 120, hasStrokeData: true,
	strokes: [], splits: [], isInterval: false
};

function fakeEvent(token: string) {
	return {
		params: { token },
		locals: { demo: true },
		platform: { env: { DB: {} } }
	};
}

async function runLoad(token: string): Promise<{ status: number } | Awaited<ReturnType<typeof load>>> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return await load(fakeEvent(token) as any);
	} catch (e) {
		return e as { status: number };
	}
}

describe('load /r/[token]', () => {
	it('throws 404 when loadSharedWorkout returns 404', async () => {
		(loadSharedWorkout as ReturnType<typeof vi.fn>).mockRejectedValue({ status: 404, body: { message: 'Not found' } });
		const result = await runLoad('sometoken');
		expect((result as { status: number }).status).toBe(404);
	});

	it('returns detail, meta and annotations on success', async () => {
		(loadSharedWorkout as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
		const data = await runLoad('abc123def456789012345678901234567890123456789abc');
		expect((data as typeof sampleDetail & { publicView: true }).publicView).toBe(true);
	});

	it('rethrows non-404 errors', async () => {
		(loadSharedWorkout as ReturnType<typeof vi.fn>).mockRejectedValue({ status: 503 });
		const result = await runLoad('sometoken');
		expect((result as { status: number }).status).toBe(503);
	});
});
