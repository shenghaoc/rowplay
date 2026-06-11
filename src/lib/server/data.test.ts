import { afterEach, describe, expect, it, vi, beforeEach } from "vite-plus/test";

// Mock all heavy dependencies so we only exercise the data.ts orchestration logic.
vi.mock("./concept2", () => ({ Concept2Client: vi.fn() }));
vi.mock("./config", () => ({ getConfig: vi.fn(() => ({})) }));
vi.mock("./session", () => ({
  readSession: vi.fn(),
  TOKEN_COOKIE: "rp_tok",
  destroySession: vi.fn(),
}));
vi.mock("./tokenCrypto", () => ({ openToken: vi.fn() }));
vi.mock("./db", () => ({
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
  destroySession: vi.fn().mockResolvedValue(undefined),
  upsertWorkouts: vi.fn().mockResolvedValue(undefined),
  setSyncState: vi.fn().mockResolvedValue(undefined),
}));

import {
	backfillWorkouts,
	loadAnnualGoal,
	loadAnnotations,
	loadDashboardAggregates,
	loadWorkoutDetail,
	loadWorkoutList,
	loadWorkouts,
	removeAnnotation,
	resetDemoAnnotationStore,
	saveAnnualGoal,
	saveAnnotation,
	scheduleConnectSync,
	syncWorkouts,
	syncStatus
} from './data';
import { Concept2Client } from './concept2';
import {
	countWorkouts,
	getAllWorkouts,
	getPbWorkoutIds,
	getSyncState,
	queryWorkouts,
	setSyncState,
	upsertWorkouts
} from './db';
import { readSession } from './session';
import { openToken } from './tokenCrypto';
import { mockWorkouts, mockAnnotations } from '../mockData';
import type { Workout } from '../types';

type Mock = ReturnType<typeof vi.fn>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function demoEvent(extras: Record<string, unknown> = {}): any {
  return {
    locals: { demo: true, user: null },
    platform: { env: {} },
    url: new URL("http://localhost/"),
    cookies: { get: () => undefined, set: vi.fn() },
    ...extras,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authedEvent(extras: Record<string, unknown> = {}): any {
  return {
    locals: { demo: false, user: { id: 7 }, sessionId: "sid-test" },
    platform: { env: { DB: {}, SESSIONS: {}, SESSION_SECRET: 'test-secret' } },
    url: new URL("http://localhost/"),
    cookies: { get: () => 'sealed-token', set: vi.fn() },
    ...extras,
  };
}

beforeEach(() => {
	vi.clearAllMocks();
	(Concept2Client as unknown as Mock).mockReset();
	(readSession as unknown as Mock).mockReset();
	(openToken as unknown as Mock).mockReset();
	(getAllWorkouts as unknown as Mock).mockReset().mockResolvedValue([]);
	(countWorkouts as unknown as Mock).mockReset().mockResolvedValue(0);
	(getPbWorkoutIds as unknown as Mock).mockReset().mockResolvedValue(new Set());
	(queryWorkouts as unknown as Mock).mockReset().mockResolvedValue([]);
	(getSyncState as unknown as Mock).mockReset().mockResolvedValue(null);
	(upsertWorkouts as unknown as Mock).mockReset().mockResolvedValue(undefined);
	(setSyncState as unknown as Mock).mockReset().mockResolvedValue(undefined);
	(readSession as unknown as Mock).mockResolvedValue({
		user: { id: 7, username: 'athlete' },
		personal: true,
		tokens: { accessToken: '', refreshToken: '', expiresAt: 0, scope: '' }
	});
	(openToken as unknown as Mock).mockResolvedValue('personal-token');
});

afterEach(() => {
  resetDemoAnnotationStore();
});

// ---------------------------------------------------------------------------
// loadWorkouts — demo mode
// ---------------------------------------------------------------------------

describe("loadWorkouts — demo mode", () => {
  it("returns mock workouts without hitting the DB", async () => {
    const result = await loadWorkouts(demoEvent());
    expect(result).toEqual(mockWorkouts());
  });
});

describe('loadWorkouts — authenticated cache gate', () => {
	const dbWorkout: Workout = {
		id: 5001,
		date: '2026-06-01 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: false
	};
	const liveWorkout: Workout = {
		id: 5002,
		date: '2026-06-02 06:00:00',
		sport: 'rower',
		distance: 5000,
		time: 1260,
		pace: 126,
		hasStrokeData: false
	};

	it('serves completed D1 cache as full history', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({
			lastDate: '2026-06-01 06:00:00',
			lastSyncAt: 1717000000000,
			total: 1,
			oldestDate: '2026-06-01 06:00:00',
			backfillDone: true,
			inProgress: false,
			lastError: null,
			lastErrorAt: 0
		});
		(getAllWorkouts as unknown as Mock).mockResolvedValue([dbWorkout]);
		const listWorkouts = vi.fn().mockResolvedValue([liveWorkout]);
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkouts }; });

		await expect(loadWorkouts(authedEvent())).resolves.toEqual([dbWorkout]);

		expect(getAllWorkouts).toHaveBeenCalledOnce();
		expect(listWorkouts).not.toHaveBeenCalled();
	});

	it('falls back to a live page while sync is in progress so partial D1 is not treated as complete', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({
			lastDate: '2026-06-01 06:00:00',
			lastSyncAt: 1717000000000,
			total: 1,
			oldestDate: '2026-06-01 06:00:00',
			backfillDone: false,
			inProgress: true,
			lastError: null,
			lastErrorAt: 0
		});
		(getAllWorkouts as unknown as Mock).mockResolvedValue([dbWorkout]);
		const listWorkouts = vi.fn().mockResolvedValue([liveWorkout]);
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkouts }; });

		await expect(loadWorkouts(authedEvent())).resolves.toEqual([liveWorkout]);

		expect(getAllWorkouts).not.toHaveBeenCalled();
		expect(listWorkouts).toHaveBeenCalledOnce();
	});

	it('falls back to a live page when the completed cache is empty to avoid a blank dashboard', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({
			lastDate: '2026-06-01 06:00:00',
			lastSyncAt: 1717000000000,
			total: 0,
			oldestDate: '2026-06-01 06:00:00',
			backfillDone: true,
			inProgress: false,
			lastError: null,
			lastErrorAt: 0
		});
		(getAllWorkouts as unknown as Mock).mockResolvedValue([]);
		const listWorkouts = vi.fn().mockResolvedValue([liveWorkout]);
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkouts }; });

		await expect(loadWorkouts(authedEvent())).resolves.toEqual([liveWorkout]);

		expect(getAllWorkouts).toHaveBeenCalledOnce();
		expect(listWorkouts).toHaveBeenCalledOnce();
	});
});

describe('loadWorkoutList — authenticated cache gate', () => {
	const q = { sort: 'date' as const, dir: 'desc' as const };
	const liveWorkout: Workout = {
		id: 5101,
		date: '2026-06-03 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: false
	};

	it('queries D1 when sync state is complete and rows exist', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({
			lastDate: '2026-06-01 06:00:00',
			lastSyncAt: 1717000000000,
			total: 2,
			oldestDate: '2025-06-01 06:00:00',
			backfillDone: true,
			inProgress: false,
			lastError: null,
			lastErrorAt: 0
		});
		(countWorkouts as unknown as Mock).mockResolvedValue(2);
		(queryWorkouts as unknown as Mock).mockResolvedValue([liveWorkout]);
		const listWorkouts = vi.fn().mockResolvedValue([]);
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkouts }; });

		await expect(loadWorkoutList(authedEvent(), q)).resolves.toEqual([liveWorkout]);

		expect(queryWorkouts).toHaveBeenCalledWith(expect.anything(), 7, q, undefined);
		expect(listWorkouts).not.toHaveBeenCalled();
	});

	it('uses live fallback when backfill is still in progress instead of querying a partial list', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({
			lastDate: '2026-06-01 06:00:00',
			lastSyncAt: 1717000000000,
			total: 2,
			oldestDate: '2025-06-01 06:00:00',
			backfillDone: false,
			inProgress: true,
			lastError: null,
			lastErrorAt: 0
		});
		(countWorkouts as unknown as Mock).mockResolvedValue(2);
		const listWorkouts = vi.fn().mockResolvedValue([liveWorkout]);
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkouts }; });

		await expect(loadWorkoutList(authedEvent(), q)).resolves.toEqual([liveWorkout]);

		expect(countWorkouts).not.toHaveBeenCalled();
		expect(queryWorkouts).not.toHaveBeenCalled();
		expect(listWorkouts).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// loadWorkoutDetail — demo mode
// ---------------------------------------------------------------------------

describe("loadWorkoutDetail — demo mode", () => {
  it("returns a mock workout detail for a known id", async () => {
    const detail = await loadWorkoutDetail(demoEvent(), 1001);
    expect(detail.id).toBe(1001);
  });

  it("throws a 404 for an unknown demo id", async () => {
    await expect(loadWorkoutDetail(demoEvent(), 99999)).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// loadDashboardAggregates — demo mode
// ---------------------------------------------------------------------------

describe("loadDashboardAggregates — demo mode", () => {
  it("returns null in demo mode", async () => {
    expect(await loadDashboardAggregates(demoEvent())).toBeNull();
  });
});

describe("loadDashboardAggregates — no user / no db", () => {
  it("returns null when user is not authenticated", async () => {
    const event = authedEvent({ locals: { demo: false, user: null } });
    expect(await loadDashboardAggregates(event)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadAnnualGoal — demo mode
// ---------------------------------------------------------------------------

describe("loadAnnualGoal — demo mode", () => {
  it("returns the default goal when no cookie is set", async () => {
    const goal = await loadAnnualGoal(demoEvent(), 2026);
    expect(goal.year).toBe(2026);
    expect(goal.kind).toBe("meters");
  });

  it("returns a stored goal from the cookie", async () => {
    const cookieVal = JSON.stringify({ year: 2026, kind: "hours", target: 200 });
    const event = demoEvent({ cookies: { get: () => cookieVal, set: vi.fn() } });
    const goal = await loadAnnualGoal(event, 2026);
    expect(goal.kind).toBe("hours");
    expect(goal.target).toBe(200);
  });

  it("ignores a cookie for a different year and returns the default", async () => {
    const cookieVal = JSON.stringify({ year: 2025, kind: "hours", target: 100 });
    const event = demoEvent({ cookies: { get: () => cookieVal, set: vi.fn() } });
    const goal = await loadAnnualGoal(event, 2026);
    expect(goal.year).toBe(2026);
    expect(goal.kind).toBe("meters");
  });
});

// ---------------------------------------------------------------------------
// saveAnnualGoal — demo mode
// ---------------------------------------------------------------------------

describe("saveAnnualGoal — demo mode", () => {
  it("serializes the goal to a cookie", async () => {
    const setCookie = vi.fn();
    const event = demoEvent({ cookies: { get: () => undefined, set: setCookie } });
    await saveAnnualGoal(event, { year: 2026, kind: "meters", target: 500_000 });
    expect(setCookie).toHaveBeenCalledOnce();
    const [cookieName, cookieValue] = setCookie.mock.calls[0];
    expect(cookieName).toBe("annual_goal");
    const parsed = JSON.parse(cookieValue);
    expect(parsed.target).toBe(500_000);
  });
});

describe("saveAnnualGoal — auth guard", () => {
  it("throws 401 when not authenticated and not demo", async () => {
    const event = authedEvent({ locals: { demo: false, user: null } });
    await expect(
      saveAnnualGoal(event, { year: 2026, kind: "meters", target: 1e6 }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// ---------------------------------------------------------------------------
// scheduleConnectSync — BYOT privacy
// ---------------------------------------------------------------------------

describe("scheduleConnectSync", () => {
  it("keeps the plaintext token in the in-memory client and out of D1 writes", async () => {
    const personalToken = "plain-personal-token";
    const workout: Workout = {
      id: 1001,
      date: "2026-05-01 06:00:00",
      sport: "rower",
      distance: 2000,
      time: 480,
      pace: 120,
      hasStrokeData: false,
    };
    const listWorkoutsPage = vi.fn().mockResolvedValue({ workouts: [workout], totalPages: 1 });
    (Concept2Client as unknown as Mock).mockImplementation(function (_cfg, _kv, _sid, session) {
      expect(session.tokens.accessToken).toBe(personalToken);
      return { listWorkoutsPage };
    });
    let scheduled: Promise<unknown> | undefined;
    const db = { marker: "fake-d1" };
    const sessions = { marker: "fake-kv" };
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduled = promise;
    });
    const event = authedEvent({
      platform: {
        env: { DB: db, SESSIONS: sessions },
        context: { waitUntil },
      },
    });

    scheduleConnectSync(event, "sid-123", { id: 7, username: "athlete" }, personalToken);

    expect(waitUntil).toHaveBeenCalledOnce();
    await scheduled;
    expect(listWorkoutsPage).toHaveBeenCalledWith(1, undefined);
    expect(upsertWorkouts).toHaveBeenCalledWith(db, 7, [workout]);
    expect(setSyncState).toHaveBeenCalledWith(
      db,
      7,
      expect.objectContaining({
        lastDate: "2026-05-01 06:00:00",
        oldestDate: "2026-05-01 06:00:00",
        total: 0,
        backfillDone: true,
      }),
    );
    const persistedWorkouts = (upsertWorkouts as Mock).mock.calls[0]?.[2] as Workout[];
    const persistedSyncPatch = (setSyncState as Mock).mock.calls[0]?.[2] as Record<string, unknown>;
    expect(persistedWorkouts).toEqual([workout]);
    expect(Object.values(persistedSyncPatch)).not.toContain(personalToken);
  });
});

// ---------------------------------------------------------------------------
// syncWorkouts / backfillWorkouts — authenticated orchestration
// ---------------------------------------------------------------------------

describe('syncWorkouts', () => {
	const workout: Workout = {
		id: 6001,
		date: '2026-06-04 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: false
	};

	it('no-ops when another sync is already in progress', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({
			lastDate: '2026-06-01 06:00:00',
			lastSyncAt: 1717000000000,
			total: 42,
			oldestDate: '2025-06-01 06:00:00',
			backfillDone: false,
			inProgress: true,
			lastError: null,
			lastErrorAt: 0
		});
		const listWorkoutsPage = vi.fn().mockResolvedValue({ workouts: [workout], totalPages: 1 });
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });

		await expect(syncWorkouts(authedEvent())).resolves.toEqual({
			added: 0,
			total: 42,
			newPbs: [],
			workouts: []
		});

		expect(listWorkoutsPage).not.toHaveBeenCalled();
		expect(setSyncState).not.toHaveBeenCalled();
	});

	it('marks sync complete and clears stale errors after a successful page fetch', async () => {
		(countWorkouts as unknown as Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
		const listWorkoutsPage = vi.fn().mockResolvedValue({ workouts: [workout], totalPages: 1 });
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });
		const db = { marker: 'fake-d1' };

		const result = await syncWorkouts(authedEvent({ platform: { env: { DB: db, SESSIONS: {}, SESSION_SECRET: 'test-secret' } } }));

		expect(result).toMatchObject({ added: 1, total: 1, workouts: [workout] });
		expect(listWorkoutsPage).toHaveBeenCalledWith(1, expect.any(String));
		expect(upsertWorkouts).toHaveBeenCalledWith(db, 7, [workout]);
		expect(setSyncState).toHaveBeenLastCalledWith(
			db,
			7,
			expect.objectContaining({
				lastDate: workout.date,
				oldestDate: expect.any(String),
				inProgress: false,
				lastError: null,
				lastErrorAt: 0
			})
		);
	});

	it('resets inProgress and preserves last successful sync timestamp when the API fails', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({
			lastDate: '2026-06-01 06:00:00',
			lastSyncAt: 1717000000000,
			total: 2,
			oldestDate: '2025-06-01 06:00:00',
			backfillDone: false,
			inProgress: false,
			lastError: null,
			lastErrorAt: 0
		});
		(countWorkouts as unknown as Mock).mockResolvedValue(2);
		const listWorkoutsPage = vi.fn().mockRejectedValue(new Error('Concept2 failed (500)'));
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });

		await expect(syncWorkouts(authedEvent())).rejects.toThrow('Concept2 failed');

		expect(setSyncState).toHaveBeenLastCalledWith(
			expect.anything(),
			7,
			expect.objectContaining({
				lastDate: '2026-06-01 06:00:00',
				total: 2,
				oldestDate: '2025-06-01 06:00:00',
				backfillDone: false,
				inProgress: false,
				lastError: 'Concept2 failed (500)',
				lastSyncAt: 1717000000000
			})
		);
	});

	it('still clears inProgress when counting workouts fails during error recovery', async () => {
		(countWorkouts as unknown as Mock)
			.mockResolvedValueOnce(5)
			.mockRejectedValueOnce(new Error('count unavailable'));
		const listWorkoutsPage = vi.fn().mockRejectedValue(new Error('Concept2 failed (500)'));
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });

		await expect(syncWorkouts(authedEvent())).rejects.toThrow('Concept2 failed');

		expect(setSyncState).toHaveBeenLastCalledWith(
			expect.anything(),
			7,
			expect.objectContaining({
				total: 0,
				inProgress: false,
				lastError: 'Concept2 failed (500)'
			})
		);
	});
});

describe('backfillWorkouts', () => {
	const state = {
		lastDate: '2026-06-01 06:00:00',
		lastSyncAt: 1717000000000,
		total: 12,
		oldestDate: '2025-09-01 06:00:00',
		backfillDone: false,
		inProgress: false,
		lastError: null,
		lastErrorAt: 0
	};
	const oldWorkout: Workout = {
		id: 6101,
		date: '2024-12-31 06:00:00',
		sport: 'rower',
		distance: 5000,
		time: 1260,
		pace: 126,
		hasStrokeData: false
	};

	it('no-ops when another sync/backfill run is already in progress', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({ ...state, inProgress: true });
		const listWorkoutsPage = vi.fn().mockResolvedValue({ workouts: [oldWorkout], totalPages: 1 });
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });

		await expect(backfillWorkouts(authedEvent())).resolves.toEqual({
			added: 0,
			oldestDate: state.oldestDate,
			done: false
		});

		expect(listWorkoutsPage).not.toHaveBeenCalled();
		expect(setSyncState).not.toHaveBeenCalled();
	});

	it('fetches an older chunk and advances the oldest watermark', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue(state);
		(countWorkouts as unknown as Mock).mockResolvedValueOnce(12).mockResolvedValueOnce(13);
		const listWorkoutsPage = vi.fn().mockResolvedValue({ workouts: [oldWorkout], totalPages: 1 });
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });

		await expect(backfillWorkouts(authedEvent())).resolves.toEqual({
			added: 1,
			oldestDate: oldWorkout.date,
			done: true
		});

		expect(listWorkoutsPage).toHaveBeenCalledWith(1, undefined, expect.any(String));
		expect(upsertWorkouts).toHaveBeenCalledWith(expect.anything(), 7, [oldWorkout]);
		expect(setSyncState).toHaveBeenLastCalledWith(
			expect.anything(),
			7,
			expect.objectContaining({
				lastDate: state.lastDate,
				total: 13,
				oldestDate: oldWorkout.date,
				backfillDone: true,
				inProgress: false,
				lastError: null,
				lastErrorAt: 0
			})
		);
	});

	it('clears inProgress when the planner reports done for an already-latched user', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue({ ...state, backfillDone: true });
		(countWorkouts as unknown as Mock).mockResolvedValue(12);
		const listWorkoutsPage = vi.fn().mockResolvedValue({ workouts: [oldWorkout], totalPages: 1 });
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });

		await expect(backfillWorkouts(authedEvent())).resolves.toEqual({
			added: 0,
			oldestDate: state.oldestDate,
			done: true
		});

		expect(listWorkoutsPage).not.toHaveBeenCalled();
		expect(setSyncState).toHaveBeenLastCalledWith(
			expect.anything(),
			7,
			expect.objectContaining({
				backfillDone: true,
				inProgress: false
			})
		);
	});

	it('resets inProgress and records rate-limit failures', async () => {
		(getSyncState as unknown as Mock).mockResolvedValue(state);
		(countWorkouts as unknown as Mock).mockResolvedValue(12);
		const listWorkoutsPage = vi.fn().mockRejectedValue(new Error('Concept2 failed (429)'));
		(Concept2Client as unknown as Mock).mockImplementation(function () { return { listWorkoutsPage }; });

		await expect(backfillWorkouts(authedEvent())).rejects.toThrow('Concept2 failed (429)');

		expect(setSyncState).toHaveBeenLastCalledWith(
			expect.anything(),
			7,
			expect.objectContaining({
				lastDate: state.lastDate,
				oldestDate: state.oldestDate,
				backfillDone: false,
				inProgress: false,
				lastError: 'Concept2 failed (429)',
				lastSyncAt: state.lastSyncAt
			})
		);
	});
});

// ---------------------------------------------------------------------------
// syncStatus
// ---------------------------------------------------------------------------

describe("syncStatus", () => {
  it("returns null when there is no DB or no user", async () => {
    const event = authedEvent({ locals: { demo: false, user: null } });
    expect(await syncStatus(event)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadAnnotations — demo mode
// ---------------------------------------------------------------------------

describe("loadAnnotations — demo mode", () => {
  it("returns mock annotations for a known workout", async () => {
    const annotations = await loadAnnotations(demoEvent(), 1001);
    expect(Array.isArray(annotations)).toBe(true);
  });

  it("returns the default mock set on first load", async () => {
    const result = await loadAnnotations(demoEvent(), 1001);
    expect(result).toEqual(mockAnnotations(1001));
  });
});

// ---------------------------------------------------------------------------
// saveAnnotation — demo mode
// ---------------------------------------------------------------------------

describe("saveAnnotation — demo mode", () => {
  it("inserts a new annotation (id = 0) and returns it", async () => {
    const result = await saveAnnotation(demoEvent(), 2000, {
      id: 0,
      timestamp: 45,
      text: "Good catch",
    });
    expect(result.text).toBe("Good catch");
    expect(result.timestamp).toBe(45);
    expect(result.id).toBeGreaterThan(0);
  });

  it("editing an existing annotation preserves createdAt", async () => {
    // First load to get an existing annotation id
    const existing = await loadAnnotations(demoEvent(), 1001);
    if (!existing.length) return; // no fixtures — skip
    const first = existing[0];
    const updated = await saveAnnotation(demoEvent(), 1001, {
      id: first.id,
      timestamp: first.timestamp + 5,
      text: "Edited note",
    });
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.text).toBe("Edited note");
  });

  it("throws 404 when editing a non-existent demo annotation", async () => {
    await expect(
      saveAnnotation(demoEvent(), 1001, { id: 999999, timestamp: 0, text: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("saveAnnotation — auth guard", () => {
  it("throws 401 when not authenticated and not demo", async () => {
    const event = authedEvent({ locals: { demo: false, user: null } });
    await expect(
      saveAnnotation(event, 1001, { id: 0, timestamp: 10, text: "note" }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// ---------------------------------------------------------------------------
// removeAnnotation — demo mode
// ---------------------------------------------------------------------------

describe("removeAnnotation — demo mode", () => {
  it("removes an annotation so it no longer appears", async () => {
    const before = await loadAnnotations(demoEvent(), 1001);
    if (!before.length) return;
    const id = before[0].id;
    await removeAnnotation(demoEvent(), 1001, id);
    const after = await loadAnnotations(demoEvent(), 1001);
    expect(after.find((a) => a.id === id)).toBeUndefined();
  });

  it("is idempotent — removing a non-existent id does not throw", async () => {
    await expect(removeAnnotation(demoEvent(), 1001, 99999)).resolves.toBeUndefined();
  });
});
