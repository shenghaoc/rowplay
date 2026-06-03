import { describe, expect, it } from 'vitest';
import {
	DETAIL_PAYLOAD_VERSION,
	countWorkouts,
	deleteAnnotation,
	deleteLeaderboardEntry,
	deleteUserData,
	getAllWorkouts,
	getAnnotations,
	getCachedDetail,
	getCachedDetailByShareToken,
	getLeaderboardEntries,
	getShareToken,
	getUserAnnualGoal,
	isWorkoutPublished,
	putAnnotation,
	putCachedDetail,
	purgePrivateCache,
	setShareToken,
	setSyncState,
	getSyncState,
	setUserAnnualGoal,
	upsertLeaderboardEntry
} from './db';
import type { WorkoutDetail } from '../types';

// ---------------------------------------------------------------------------
// Fake D1 — records SQL/args; optionally returns preset rows for all/first.
// ---------------------------------------------------------------------------

interface FakeStmt {
	sql: string;
	args: unknown[];
}

/**
 * opts.firstRow  — value returned by every `.first()` call
 * opts.allRows   — array returned by every `.all()` call
 */
function fakeDb(opts: { firstRow?: unknown; allRows?: unknown[] } = {}) {
	const executed: FakeStmt[] = [];

	const make = (sql: string) => {
		let bound: unknown[] = [];
		const stmt = {
			bind: (...args: unknown[]) => { bound = args; return stmt; },
			run: async () => {
				executed.push({ sql, args: bound });
				return { meta: { changes: 1, last_row_id: 99 } };
			},
			first: async <T>() => {
				executed.push({ sql, args: bound });
				return (opts.firstRow ?? null) as T;
			},
			all: async <T>() => {
				executed.push({ sql, args: bound });
				return { results: (opts.allRows ?? []) as T[] };
			}
		};
		return stmt;
	};

	return {
		executed,
		db: {
			prepare: make,
			batch: async (stmts: ReturnType<typeof make>[]) =>
				Promise.all(stmts.map((s) => s.run()))
		}
	};
}

// Shared detail fixture
const sampleDetail: WorkoutDetail = {
	id: 1001,
	date: '2026-05-01 06:00:00',
	sport: 'rower',
	distance: 2000,
	time: 480,
	pace: 120,
	hasStrokeData: true,
	strokes: [],
	splits: [],
	isInterval: false
};

// ---------------------------------------------------------------------------
// getCachedDetail
// ---------------------------------------------------------------------------

describe('getCachedDetail', () => {
	it('returns null when db is undefined', async () => {
		expect(await getCachedDetail(undefined, 1, 1001, undefined)).toBeNull();
	});

	it('returns null when no row is found', async () => {
		const { db } = fakeDb();
		expect(await getCachedDetail(db as never, 1, 1001, undefined)).toBeNull();
	});

	it('returns parsed detail when the row is fresh', async () => {
		const now = Date.now();
		const payload = JSON.stringify(sampleDetail);
		const { db } = fakeDb({ firstRow: { payload, cached_at: now - 1000 } });
		const result = await getCachedDetail(db as never, 1, 1001, undefined);
		expect(result?.id).toBe(1001);
	});

	it('swallows DB errors and returns null', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => { throw new Error('D1 failure'); }
			})
		};
		expect(await getCachedDetail(db as never, 1, 1001, undefined)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// putCachedDetail
// ---------------------------------------------------------------------------

describe('putCachedDetail', () => {
	it('is a no-op when db is undefined', async () => {
		await expect(putCachedDetail(undefined, 1, sampleDetail)).resolves.toBeUndefined();
	});

	it('executes an INSERT with the correct payload version', async () => {
		const { db, executed } = fakeDb();
		await putCachedDetail(db as never, 1, sampleDetail);
		expect(executed.length).toBeGreaterThan(0);
		expect(executed[0].sql).toContain('INSERT INTO workout_detail');
		// payload_version should be the last bound arg
		const args = executed[0].args;
		expect(args[args.length - 1]).toBe(DETAIL_PAYLOAD_VERSION);
	});

	it('swallows errors silently', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				run: async () => { throw new Error('write failed'); }
			})
		};
		await expect(putCachedDetail(db as never, 1, sampleDetail)).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// getAllWorkouts
// ---------------------------------------------------------------------------

describe('getAllWorkouts', () => {
	const row = {
		workout_id: 1001,
		date: '2026-05-01 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		stroke_rate: null,
		stroke_count: null,
		heart_rate: 155,
		hr_min: 140,
		hr_max: 170,
		calories: null,
		watt_minutes: null,
		drag_factor: null,
		workout_type: null,
		comments: null,
		has_stroke: 1
	};

	it('maps DB rows to Workout objects', async () => {
		const { db } = fakeDb({ allRows: [row] });
		const result = await getAllWorkouts(db as never, 42);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(1001);
		expect(result[0].heartRateAvg).toBe(155);
		expect(result[0].hrMin).toBe(140);
		expect(result[0].hrMax).toBe(170);
		expect(result[0].hasStrokeData).toBe(true);
	});

	it('maps null optional fields to undefined', async () => {
		const { db } = fakeDb({ allRows: [row] });
		const result = await getAllWorkouts(db as never, 42);
		expect(result[0].strokeRate).toBeUndefined();
		expect(result[0].caloriesTotal).toBeUndefined();
	});

	it('returns an empty array when there are no workouts', async () => {
		const { db } = fakeDb();
		const result = await getAllWorkouts(db as never, 42);
		expect(result).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// countWorkouts
// ---------------------------------------------------------------------------

describe('countWorkouts', () => {
	it('returns the count from the DB', async () => {
		const { db } = fakeDb({ firstRow: { n: 17 } });
		expect(await countWorkouts(db as never, 1)).toBe(17);
	});

	it('returns 0 when the query returns null', async () => {
		const { db } = fakeDb();
		expect(await countWorkouts(db as never, 1)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// getSyncState / setSyncState
// ---------------------------------------------------------------------------

describe('getSyncState', () => {
	it('returns null when db is undefined', async () => {
		expect(await getSyncState(undefined, 1)).toBeNull();
	});

	it('returns null when no row exists', async () => {
		const { db } = fakeDb();
		expect(await getSyncState(db as never, 1)).toBeNull();
	});

	it('swallows errors and returns null', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => { throw new Error('D1 error'); }
			})
		};
		expect(await getSyncState(db as never, 1)).toBeNull();
	});
});

describe('setSyncState', () => {
	it('executes an UPSERT into sync_state', async () => {
		const { db, executed } = fakeDb();
		await setSyncState(db as never, 1, '2026-05-01 06:00:00', 42);
		expect(executed[0].sql).toContain('INSERT INTO sync_state');
		expect(executed[0].args.slice(0, 3)).toEqual([1, '2026-05-01 06:00:00', expect.any(Number)]);
	});
});

// ---------------------------------------------------------------------------
// purgePrivateCache / deleteUserData
// ---------------------------------------------------------------------------

describe('purgePrivateCache', () => {
	it('runs a batch delete for workouts, detail, and sync_state', async () => {
		const sqls: string[] = [];
		const db = {
			prepare: (sql: string) => ({
				bind: function() { return this; },
				run: async () => { sqls.push(sql); return {}; }
			}),
			batch: async (stmts: unknown[]) => {
				// Execute each statement to populate sqls
				await Promise.all((stmts as Array<{ run: () => Promise<void> }>).map((s) => s.run()));
				return [];
			}
		};
		await purgePrivateCache(db as never, 7);
		expect(sqls).toContain('DELETE FROM workouts WHERE user_id = ?');
		expect(sqls).toContain('DELETE FROM workout_detail WHERE user_id = ?');
		expect(sqls).toContain('DELETE FROM sync_state WHERE user_id = ?');
		// Must NOT touch leaderboard entries
		expect(sqls.some((s) => s.includes('leaderboard_entry'))).toBe(false);
	});
});

describe('deleteUserData', () => {
	it('also deletes leaderboard entries (account deletion)', async () => {
		const sqls: string[] = [];
		const db = {
			prepare: (sql: string) => ({
				bind: function() { return this; },
				run: async () => { sqls.push(sql); return {}; }
			}),
			batch: async (stmts: unknown[]) => {
				await Promise.all((stmts as Array<{ run: () => Promise<void> }>).map((s) => s.run()));
				return [];
			}
		};
		await deleteUserData(db as never, 7);
		expect(sqls.some((s) => s.includes('leaderboard_entry'))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// isWorkoutPublished
// ---------------------------------------------------------------------------

describe('isWorkoutPublished', () => {
	it('returns false when db is undefined', async () => {
		expect(await isWorkoutPublished(undefined, 1, 1001)).toBe(false);
	});

	it('swallows errors and returns false', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => { throw new Error('D1 error'); }
			})
		};
		expect(await isWorkoutPublished(db as never, 1, 1001)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// setShareToken / clearShareToken / getShareToken / getCachedDetailByShareToken
// ---------------------------------------------------------------------------

describe('setShareToken', () => {
	it('returns true when the update changes a row', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				run: async () => ({ meta: { changes: 1 } })
			})
		};
		expect(await setShareToken(db as never, 1, 1001, 'abc123')).toBe(true);
	});

	it('returns false when no rows were changed (token already set)', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				run: async () => ({ meta: { changes: 0 } })
			})
		};
		expect(await setShareToken(db as never, 1, 1001, 'abc123')).toBe(false);
	});
});

describe('getShareToken', () => {
	it('returns null when db is undefined', async () => {
		expect(await getShareToken(undefined, 1, 1001)).toBeNull();
	});

	it('swallows errors and returns null', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => { throw new Error(); }
			})
		};
		expect(await getShareToken(db as never, 1, 1001)).toBeNull();
	});
});

describe('getCachedDetailByShareToken', () => {
	it('returns null when db is undefined', async () => {
		expect(await getCachedDetailByShareToken(undefined, 'token')).toBeNull();
	});

	it('returns null when token is empty', async () => {
		const { db } = fakeDb();
		expect(await getCachedDetailByShareToken(db as never, '')).toBeNull();
	});

	it('swallows parse errors and returns null', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => ({ payload: 'not-valid-json{' })
			})
		};
		expect(await getCachedDetailByShareToken(db as never, 'tok')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// getUserAnnualGoal / setUserAnnualGoal
// ---------------------------------------------------------------------------

describe('getUserAnnualGoal', () => {
	it('returns null when db is undefined', async () => {
		expect(await getUserAnnualGoal(undefined, 1, 2026)).toBeNull();
	});

	it('swallows errors and returns null', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => { throw new Error('DB error'); }
			})
		};
		expect(await getUserAnnualGoal(db as never, 1, 2026)).toBeNull();
	});

	it('returns null for an unknown kind in the stored row', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => ({ kind: 'bananas', target: 500 })
			})
		};
		expect(await getUserAnnualGoal(db as never, 1, 2026)).toBeNull();
	});
});

describe('setUserAnnualGoal', () => {
	it('executes an UPSERT into user_goals', async () => {
		const { db, executed } = fakeDb();
		await setUserAnnualGoal(db as never, 1, { year: 2026, kind: 'meters', target: 1_000_000 });
		expect(executed[0].sql).toContain('INSERT INTO user_goals');
		expect(executed[0].args.slice(0, 4)).toEqual([1, 2026, 'meters', 1_000_000]);
	});
});

// ---------------------------------------------------------------------------
// getAnnotations / putAnnotation / deleteAnnotation
// ---------------------------------------------------------------------------

describe('getAnnotations', () => {
	it('returns an empty array when db is undefined', async () => {
		expect(await getAnnotations(undefined, 1, 1001)).toEqual([]);
	});

	it('swallows errors and returns an empty array', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				all: async () => { throw new Error(); }
			})
		};
		expect(await getAnnotations(db as never, 1, 1001)).toEqual([]);
	});
});

describe('putAnnotation', () => {
	it('throws when db is undefined', async () => {
		await expect(
			putAnnotation(undefined, 1, 1001, { id: 0, timestamp: 30, text: 'hello' })
		).rejects.toThrow('Database not available');
	});

	it('inserts a new annotation when id is 0', async () => {
		const { db, executed } = fakeDb();
		const result = await putAnnotation(db as never, 1, 1001, { id: 0, timestamp: 30, text: 'note' });
		expect(executed[0].sql).toContain('INSERT INTO annotations');
		expect(result.text).toBe('note');
		expect(result.timestamp).toBe(30);
	});

	it('throws a 404-like error when updating a non-existent annotation', async () => {
		// first() returns null → "Annotation not found"
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				first: async () => null
			})
		};
		await expect(
			putAnnotation(db as never, 1, 1001, { id: 5, timestamp: 30, text: 'edit' })
		).rejects.toThrow('Annotation not found or unauthorized');
	});
});

describe('deleteAnnotation', () => {
	it('is a no-op when db is undefined', async () => {
		await expect(deleteAnnotation(undefined, 1, 1001, 5)).resolves.toBeUndefined();
	});

	it('executes a DELETE with the correct WHERE clause', async () => {
		const { db, executed } = fakeDb();
		await deleteAnnotation(db as never, 1, 1001, 5);
		expect(executed[0].sql).toContain('DELETE FROM annotations');
		expect(executed[0].args).toEqual([5, 1, 1001]);
	});

	it('propagates errors (unlike silent read paths)', async () => {
		const db = {
			prepare: () => ({
				bind: function() { return this; },
				run: async () => { throw new Error('constraint error'); }
			})
		};
		await expect(deleteAnnotation(db as never, 1, 1001, 5)).rejects.toThrow('constraint error');
	});
});

// ---------------------------------------------------------------------------
// upsertLeaderboardEntry / deleteLeaderboardEntry / getLeaderboardEntries
// ---------------------------------------------------------------------------

describe('upsertLeaderboardEntry', () => {
	it('is a no-op when db is undefined', async () => {
		await expect(upsertLeaderboardEntry(undefined, {
			sport: 'rower', distance: 2000, userId: 1, workoutId: 1001,
			displayName: 'Alice', time: 480, pace: 120, date: '2026-05-01'
		})).resolves.toBeUndefined();
	});

	it('executes an UPSERT into leaderboard_entry', async () => {
		const { db, executed } = fakeDb();
		await upsertLeaderboardEntry(db as never, {
			sport: 'rower', distance: 2000, userId: 1, workoutId: 1001,
			displayName: 'Alice', time: 480, pace: 120, date: '2026-05-01'
		});
		expect(executed[0].sql).toContain('INSERT INTO leaderboard_entry');
		expect(executed[0].sql).toContain('WHERE excluded.time < leaderboard_entry.time');
	});
});

describe('deleteLeaderboardEntry', () => {
	it('is a no-op when db is undefined', async () => {
		await expect(deleteLeaderboardEntry(undefined, 1, 'rower', 2000)).resolves.toBeUndefined();
	});

	it('executes a DELETE with user_id, sport, and distance', async () => {
		const { db, executed } = fakeDb();
		await deleteLeaderboardEntry(db as never, 1, 'rower', 2000);
		expect(executed[0].sql).toContain('DELETE FROM leaderboard_entry');
		expect(executed[0].args).toEqual([1, 'rower', 2000]);
	});
});

describe('getLeaderboardEntries', () => {
	it('returns an empty array when db is undefined', async () => {
		expect(await getLeaderboardEntries(undefined)).toEqual([]);
	});

	it('swallows errors and returns an empty array', async () => {
		const db = {
			prepare: () => ({
				all: async () => { throw new Error(); }
			})
		};
		expect(await getLeaderboardEntries(db as never)).toEqual([]);
	});
});
