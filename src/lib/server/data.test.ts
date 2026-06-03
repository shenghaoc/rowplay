import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies so we only exercise the data.ts orchestration logic.
vi.mock('./concept2', () => ({ Concept2Client: vi.fn() }));
vi.mock('./config', () => ({ getConfig: vi.fn(() => ({})) }));
vi.mock('./session', () => ({
	readSession: vi.fn(),
	TOKEN_COOKIE: 'rp_tok',
	destroySession: vi.fn()
}));
vi.mock('./tokenCrypto', () => ({ openToken: vi.fn() }));
vi.mock('./db', () => ({
	getAllWorkouts: vi.fn().mockResolvedValue([]),
	countWorkouts: vi.fn().mockResolvedValue(0),
	getPbWorkoutIds: vi.fn().mockResolvedValue(new Set()),
	queryWorkouts: vi.fn().mockResolvedValue([]),
	getCachedDetail: vi.fn().mockResolvedValue(null),
	putCachedDetail: vi.fn().mockResolvedValue(undefined),
	getUserAnnualGoal: vi.fn().mockResolvedValue(null),
	setUserAnnualGoal: vi.fn().mockResolvedValue(undefined),
	getSyncState: vi.fn().mockResolvedValue(null),
	getSportAggregates: vi.fn().mockResolvedValue([]),
	getPersonalBests: vi.fn().mockResolvedValue([]),
	getAnnotations: vi.fn().mockResolvedValue([]),
	putAnnotation: vi.fn(),
	deleteAnnotation: vi.fn().mockResolvedValue(undefined),
	deleteUserData: vi.fn().mockResolvedValue(undefined),
	destroySession: vi.fn().mockResolvedValue(undefined)
}));

import {
	loadAnnualGoal,
	loadAnnotations,
	loadDashboardAggregates,
	loadWorkoutDetail,
	loadWorkouts,
	removeAnnotation,
	saveAnnualGoal,
	saveAnnotation,
	syncStatus
} from './data';
import { mockWorkouts, mockAnnotations } from '../mockData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function demoEvent(extras: Record<string, unknown> = {}): any {
	return {
		locals: { demo: true, user: null },
		platform: { env: {} },
		url: new URL('http://localhost/'),
		cookies: { get: () => undefined, set: vi.fn() },
		...extras
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authedEvent(extras: Record<string, unknown> = {}): any {
	return {
		locals: { demo: false, user: { id: 7 }, sessionId: 'sid-test' },
		platform: { env: { DB: {}, SESSIONS: {} } },
		url: new URL('http://localhost/'),
		cookies: { get: () => null, set: vi.fn() },
		...extras
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadWorkouts — demo mode
// ---------------------------------------------------------------------------

describe('loadWorkouts — demo mode', () => {
	it('returns mock workouts without hitting the DB', async () => {
		const result = await loadWorkouts(demoEvent());
		expect(result).toEqual(mockWorkouts());
	});
});

// ---------------------------------------------------------------------------
// loadWorkoutDetail — demo mode
// ---------------------------------------------------------------------------

describe('loadWorkoutDetail — demo mode', () => {
	it('returns a mock workout detail for a known id', async () => {
		const detail = await loadWorkoutDetail(demoEvent(), 1001);
		expect(detail.id).toBe(1001);
	});

	it('throws a 404 for an unknown demo id', async () => {
		await expect(loadWorkoutDetail(demoEvent(), 99999)).rejects.toMatchObject({ status: 404 });
	});
});

// ---------------------------------------------------------------------------
// loadDashboardAggregates — demo mode
// ---------------------------------------------------------------------------

describe('loadDashboardAggregates — demo mode', () => {
	it('returns null in demo mode', async () => {
		expect(await loadDashboardAggregates(demoEvent())).toBeNull();
	});
});

describe('loadDashboardAggregates — no user / no db', () => {
	it('returns null when user is not authenticated', async () => {
		const event = authedEvent({ locals: { demo: false, user: null } });
		expect(await loadDashboardAggregates(event)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// loadAnnualGoal — demo mode
// ---------------------------------------------------------------------------

describe('loadAnnualGoal — demo mode', () => {
	it('returns the default goal when no cookie is set', async () => {
		const goal = await loadAnnualGoal(demoEvent(), 2026);
		expect(goal.year).toBe(2026);
		expect(goal.kind).toBe('meters');
	});

	it('returns a stored goal from the cookie', async () => {
		const cookieVal = JSON.stringify({ year: 2026, kind: 'hours', target: 200 });
		const event = demoEvent({ cookies: { get: () => cookieVal, set: vi.fn() } });
		const goal = await loadAnnualGoal(event, 2026);
		expect(goal.kind).toBe('hours');
		expect(goal.target).toBe(200);
	});

	it('ignores a cookie for a different year and returns the default', async () => {
		const cookieVal = JSON.stringify({ year: 2025, kind: 'hours', target: 100 });
		const event = demoEvent({ cookies: { get: () => cookieVal, set: vi.fn() } });
		const goal = await loadAnnualGoal(event, 2026);
		expect(goal.year).toBe(2026);
		expect(goal.kind).toBe('meters');
	});
});

// ---------------------------------------------------------------------------
// saveAnnualGoal — demo mode
// ---------------------------------------------------------------------------

describe('saveAnnualGoal — demo mode', () => {
	it('serializes the goal to a cookie', async () => {
		const setCookie = vi.fn();
		const event = demoEvent({ cookies: { get: () => undefined, set: setCookie } });
		await saveAnnualGoal(event, { year: 2026, kind: 'meters', target: 500_000 });
		expect(setCookie).toHaveBeenCalledOnce();
		const [cookieName, cookieValue] = setCookie.mock.calls[0];
		expect(cookieName).toBe('annual_goal');
		const parsed = JSON.parse(cookieValue);
		expect(parsed.target).toBe(500_000);
	});
});

describe('saveAnnualGoal — auth guard', () => {
	it('throws 401 when not authenticated and not demo', async () => {
		const event = authedEvent({ locals: { demo: false, user: null } });
		await expect(saveAnnualGoal(event, { year: 2026, kind: 'meters', target: 1e6 })).rejects.toMatchObject({ status: 401 });
	});
});

// ---------------------------------------------------------------------------
// syncStatus
// ---------------------------------------------------------------------------

describe('syncStatus', () => {
	it('returns null when there is no DB or no user', async () => {
		const event = authedEvent({ locals: { demo: false, user: null } });
		expect(await syncStatus(event)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// loadAnnotations — demo mode
// ---------------------------------------------------------------------------

describe('loadAnnotations — demo mode', () => {
	it('returns mock annotations for a known workout', async () => {
		const annotations = await loadAnnotations(demoEvent(), 1001);
		expect(Array.isArray(annotations)).toBe(true);
	});

	it('returns the default mock set on first load', async () => {
		const result = await loadAnnotations(demoEvent(), 1001);
		expect(result).toEqual(mockAnnotations(1001));
	});
});

// ---------------------------------------------------------------------------
// saveAnnotation — demo mode
// ---------------------------------------------------------------------------

describe('saveAnnotation — demo mode', () => {
	it('inserts a new annotation (id = 0) and returns it', async () => {
		const result = await saveAnnotation(demoEvent(), 2000, {
			id: 0,
			timestamp: 45,
			text: 'Good catch'
		});
		expect(result.text).toBe('Good catch');
		expect(result.timestamp).toBe(45);
		expect(result.id).toBeGreaterThan(0);
	});

	it('editing an existing annotation preserves createdAt', async () => {
		// First load to get an existing annotation id
		const existing = await loadAnnotations(demoEvent(), 1001);
		if (!existing.length) return; // no fixtures — skip
		const first = existing[0];
		const updated = await saveAnnotation(demoEvent(), 1001, {
			id: first.id,
			timestamp: first.timestamp + 5,
			text: 'Edited note'
		});
		expect(updated.createdAt).toBe(first.createdAt);
		expect(updated.text).toBe('Edited note');
	});

	it('throws 404 when editing a non-existent demo annotation', async () => {
		await expect(
			saveAnnotation(demoEvent(), 1001, { id: 999999, timestamp: 0, text: 'x' })
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('saveAnnotation — auth guard', () => {
	it('throws 401 when not authenticated and not demo', async () => {
		const event = authedEvent({ locals: { demo: false, user: null } });
		await expect(
			saveAnnotation(event, 1001, { id: 0, timestamp: 10, text: 'note' })
		).rejects.toMatchObject({ status: 401 });
	});
});

// ---------------------------------------------------------------------------
// removeAnnotation — demo mode
// ---------------------------------------------------------------------------

describe('removeAnnotation — demo mode', () => {
	it('removes an annotation so it no longer appears', async () => {
		const before = await loadAnnotations(demoEvent(), 1001);
		if (!before.length) return;
		const id = before[0].id;
		await removeAnnotation(demoEvent(), 1001, id);
		const after = await loadAnnotations(demoEvent(), 1001);
		expect(after.find((a) => a.id === id)).toBeUndefined();
	});

	it('is idempotent — removing a non-existent id does not throw', async () => {
		await expect(removeAnnotation(demoEvent(), 1001, 99999)).resolves.toBeUndefined();
	});
});
