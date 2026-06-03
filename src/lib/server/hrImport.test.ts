import { describe, expect, it, vi } from 'vitest';

vi.mock('./data', () => ({
	loadWorkoutDetail: vi.fn()
}));
vi.mock('./db', () => ({
	putCachedDetail: vi.fn().mockResolvedValue(undefined),
	getCachedDetail: vi.fn().mockResolvedValue(null)
}));
vi.mock('./session', () => ({
	readSession: vi.fn().mockResolvedValue(null)
}));
vi.mock('$lib/hrImport', () => ({
	strokesHaveHr: vi.fn(),
	applyHrImport: vi.fn((detail) => detail),
	stripHrFromDetail: vi.fn((detail) => detail)
}));

import { saveHrImport, clearHrImport } from './hrImport';
import { loadWorkoutDetail } from './data';
import { strokesHaveHr } from '$lib/hrImport';

const sampleDetail = {
	id: 1001, date: '2026-05-01 06:00:00', sport: 'rower' as const,
	distance: 2000, time: 480, pace: 120, hasStrokeData: true,
	strokes: [], splits: [], isInterval: false
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authedEvent(): any {
	return {
		locals: { demo: false, user: { id: 7 }, sessionId: 'sid' },
		platform: { env: { DB: {}, SESSIONS: {} } },
		cookies: { get: () => null }
	};
}

describe('saveHrImport', () => {
	it('throws 400 in demo mode', async () => {
		const event = { locals: { demo: true, user: null } };
		await expect(saveHrImport(event as never, 1001, [], 0)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 401 when not authenticated', async () => {
		const event = { locals: { demo: false, user: null } };
		await expect(saveHrImport(event as never, 1001, [], 0)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 409 when the workout already has HR data', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
		(strokesHaveHr as ReturnType<typeof vi.fn>).mockReturnValue(true);
		await expect(saveHrImport(authedEvent(), 1001, [], 0)).rejects.toMatchObject({ status: 409 });
	});

	it('returns the merged detail when HR is successfully applied', async () => {
		(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
		(strokesHaveHr as ReturnType<typeof vi.fn>).mockReturnValue(false);
		const result = await saveHrImport(authedEvent(), 1001, [{ t: 0, hr: 140 }], 0);
		expect(result).toBeDefined();
		expect(result.id).toBe(1001);
	});
});

describe('clearHrImport', () => {
	it('throws 400 in demo mode', async () => {
		const event = { locals: { demo: true, user: null } };
		await expect(clearHrImport(event as never, 1001)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 401 when not authenticated', async () => {
		const event = { locals: { demo: false, user: null } };
		await expect(clearHrImport(event as never, 1001)).rejects.toMatchObject({ status: 401 });
	});
});
