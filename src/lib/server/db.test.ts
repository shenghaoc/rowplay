import { describe, expect, it } from "vite-plus/test";
import {
  DETAIL_PAYLOAD_VERSION,
  clearShareToken,
  countWorkouts,
  deleteAnnotation,
  deleteLeaderboardEntry,
  deleteUserData,
  getAllWorkouts,
  getAnnotations,
  getAnnotationsByShareToken,
  getCachedDetail,
  getCachedDetailByShareToken,
  getLeaderboardEntries,
  getPersonalBests,
  getShareToken,
  getSportAggregates,
  getUserAnnualGoal,
  isWorkoutPublished,
  getPbWorkoutIds,
  putAnnotation,
  putCachedDetail,
  purgePrivateCache,
  queryWorkouts,
  setShareToken,
  setSyncState,
  getSyncState,
  setUserAnnualGoal,
  setWorkoutTag,
  upsertLeaderboardEntry,
  upsertWorkouts,
} from "./db";
import type { Workout, WorkoutDetail } from "../types";

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
      bind: (...args: unknown[]) => {
        bound = args;
        return stmt;
      },
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
      },
    };
    return stmt;
  };

  const batchCalls: ReturnType<typeof make>[][] = [];

  return {
    executed,
    batchCalls,
    db: {
      prepare: make,
      batch: async (stmts: ReturnType<typeof make>[]) => {
        batchCalls.push(stmts);
        return Promise.all(stmts.map((s) => s.run()));
      },
    },
  };
}

// Shared detail fixture
const sampleDetail: WorkoutDetail = {
  id: 1001,
  date: "2026-05-01 06:00:00",
  sport: "rower",
  distance: 2000,
  time: 480,
  pace: 120,
  hasStrokeData: true,
  strokes: [],
  splits: [],
  isInterval: false,
};

// ---------------------------------------------------------------------------
// getCachedDetail
// ---------------------------------------------------------------------------

describe("getCachedDetail", () => {
  it("returns null when db is undefined", async () => {
    expect(await getCachedDetail(undefined, 1, 1001, undefined)).toBeNull();
  });

  it("returns null when no row is found", async () => {
    const { db } = fakeDb();
    expect(await getCachedDetail(db as never, 1, 1001, undefined)).toBeNull();
  });

  it("returns parsed detail when the row is fresh", async () => {
    const now = Temporal.Now.instant().epochMilliseconds;
    const payload = JSON.stringify(sampleDetail);
    const { db } = fakeDb({ firstRow: { payload, cached_at: now - 1000 } });
    const result = await getCachedDetail(db as never, 1, 1001, undefined);
    expect(result?.id).toBe(1001);
  });

  it("swallows DB errors and returns null", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => {
          throw new Error("D1 failure");
        },
      }),
    };
    expect(await getCachedDetail(db as never, 1, 1001, undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// putCachedDetail
// ---------------------------------------------------------------------------

describe("putCachedDetail", () => {
  it("is a no-op when db is undefined", async () => {
    await expect(putCachedDetail(undefined, 1, sampleDetail)).resolves.toBeUndefined();
  });

  it("executes an INSERT with the correct payload version", async () => {
    const { db, executed } = fakeDb();
    await putCachedDetail(db as never, 1, sampleDetail);
    expect(executed.length).toBeGreaterThan(0);
    expect(executed[0].sql).toContain("INSERT INTO workout_detail");
    // payload_version should be the last bound arg
    const args = executed[0].args;
    expect(args[args.length - 1]).toBe(DETAIL_PAYLOAD_VERSION);
  });

  it("swallows errors silently", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        run: async () => {
          throw new Error("write failed");
        },
      }),
    };
    await expect(putCachedDetail(db as never, 1, sampleDetail)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllWorkouts
// ---------------------------------------------------------------------------

describe("getAllWorkouts", () => {
  const row = {
    workout_id: 1001,
    date: "2026-05-01 06:00:00",
    sport: "rower",
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
    timezone: null,
    has_stroke: 1,
    user_tag: null,
  };

  it("maps DB rows to Workout objects", async () => {
    const { db } = fakeDb({ allRows: [row] });
    const result = await getAllWorkouts(db as never, 42);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1001);
    expect(result[0].heartRateAvg).toBe(155);
    expect(result[0].hrMin).toBe(140);
    expect(result[0].hrMax).toBe(170);
    expect(result[0].hasStrokeData).toBe(true);
  });

  it("maps null optional fields to undefined", async () => {
    const { db } = fakeDb({ allRows: [row] });
    const result = await getAllWorkouts(db as never, 42);
    expect(result[0].strokeRate).toBeUndefined();
    expect(result[0].caloriesTotal).toBeUndefined();
  });

  it("returns an empty array when there are no workouts", async () => {
    const { db } = fakeDb();
    const result = await getAllWorkouts(db as never, 42);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// countWorkouts
// ---------------------------------------------------------------------------

describe("countWorkouts", () => {
  it("returns the count from the DB", async () => {
    const { db } = fakeDb({ firstRow: { n: 17 } });
    expect(await countWorkouts(db as never, 1)).toBe(17);
  });

  it("returns 0 when the query returns null", async () => {
    const { db } = fakeDb();
    expect(await countWorkouts(db as never, 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSyncState / setSyncState
// ---------------------------------------------------------------------------

describe("getSyncState", () => {
  it("returns null when db is undefined", async () => {
    expect(await getSyncState(undefined, 1)).toBeNull();
  });

  it("returns null when no row exists", async () => {
    const { db } = fakeDb();
    expect(await getSyncState(db as never, 1)).toBeNull();
  });

  it("swallows errors and returns null", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => {
          throw new Error("D1 error");
        },
      }),
    };
    expect(await getSyncState(db as never, 1)).toBeNull();
  });
});

describe("setSyncState", () => {
  it("executes an UPSERT into sync_state", async () => {
    const { db, executed } = fakeDb();
    await setSyncState(db as never, 1, {
      lastDate: "2026-05-01 06:00:00",
      total: 42,
      oldestDate: "2025-05-01 06:00:00",
      backfillDone: false,
      inProgress: false,
    });
    expect(executed[0].sql).toContain("INSERT INTO sync_state");
    expect(executed[0].args.slice(0, 3)).toEqual([1, "2026-05-01 06:00:00", expect.any(Number)]);
    // Windowed sync columns are persisted alongside the watermark (#71).
    expect(executed[0].args.slice(3, 6)).toEqual([42, "2025-05-01 06:00:00", 0]);
    // New progress/error columns default to 0, null, 0.
    expect(executed[0].args.slice(6)).toEqual([0, null, 0]);
  });
});

// ---------------------------------------------------------------------------
// purgePrivateCache / deleteUserData
// ---------------------------------------------------------------------------

describe("purgePrivateCache", () => {
  it("runs a batch delete for workouts, detail, and sync_state", async () => {
    const sqls: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: function () {
          return this;
        },
        run: async () => {
          sqls.push(sql);
          return {};
        },
      }),
      batch: async (stmts: unknown[]) => {
        // Execute each statement to populate sqls
        await Promise.all((stmts as Array<{ run: () => Promise<void> }>).map((s) => s.run()));
        return [];
      },
    };
    await purgePrivateCache(db as never, 7);
    expect(sqls).toContain("DELETE FROM workouts WHERE user_id = ?");
    expect(sqls).toContain("DELETE FROM workout_detail WHERE user_id = ?");
    expect(sqls).toContain("DELETE FROM sync_state WHERE user_id = ?");
    // Must NOT touch leaderboard entries
    expect(sqls.some((s) => s.includes("leaderboard_entry"))).toBe(false);
  });
});

describe("deleteUserData", () => {
  it("also deletes leaderboard entries (account deletion)", async () => {
    const sqls: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: function () {
          return this;
        },
        run: async () => {
          sqls.push(sql);
          return {};
        },
      }),
      batch: async (stmts: unknown[]) => {
        await Promise.all((stmts as Array<{ run: () => Promise<void> }>).map((s) => s.run()));
        return [];
      },
    };
    await deleteUserData(db as never, 7);
    expect(sqls.some((s) => s.includes("leaderboard_entry"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isWorkoutPublished
// ---------------------------------------------------------------------------

describe("isWorkoutPublished", () => {
  it("returns false when db is undefined", async () => {
    expect(await isWorkoutPublished(undefined, 1, 1001)).toBe(false);
  });

  it("swallows errors and returns false", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => {
          throw new Error("D1 error");
        },
      }),
    };
    expect(await isWorkoutPublished(db as never, 1, 1001)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setShareToken / clearShareToken / getShareToken / getCachedDetailByShareToken
// ---------------------------------------------------------------------------

describe("setShareToken", () => {
  it("returns true when the update changes a row", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        run: async () => ({ meta: { changes: 1 } }),
      }),
    };
    expect(await setShareToken(db as never, 1, 1001, "abc123")).toBe(true);
  });

  it("returns false when no rows were changed (token already set)", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        run: async () => ({ meta: { changes: 0 } }),
      }),
    };
    expect(await setShareToken(db as never, 1, 1001, "abc123")).toBe(false);
  });
});

describe("getShareToken", () => {
  it("returns null when db is undefined", async () => {
    expect(await getShareToken(undefined, 1, 1001)).toBeNull();
  });

  it("swallows errors and returns null", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => {
          throw new Error();
        },
      }),
    };
    expect(await getShareToken(db as never, 1, 1001)).toBeNull();
  });
});

describe("getCachedDetailByShareToken", () => {
  it("returns null when db is undefined", async () => {
    expect(await getCachedDetailByShareToken(undefined, "token")).toBeNull();
  });

  it("returns null when token is empty", async () => {
    const { db } = fakeDb();
    expect(await getCachedDetailByShareToken(db as never, "")).toBeNull();
  });

  it("swallows parse errors and returns null", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => ({ payload: "not-valid-json{" }),
      }),
    };
    expect(await getCachedDetailByShareToken(db as never, "tok")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getUserAnnualGoal / setUserAnnualGoal
// ---------------------------------------------------------------------------

describe("getUserAnnualGoal", () => {
  it("returns null when db is undefined", async () => {
    expect(await getUserAnnualGoal(undefined, 1, 2026)).toBeNull();
  });

  it("swallows errors and returns null", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => {
          throw new Error("DB error");
        },
      }),
    };
    expect(await getUserAnnualGoal(db as never, 1, 2026)).toBeNull();
  });

  it("returns null for an unknown kind in the stored row", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => ({ kind: "bananas", target: 500 }),
      }),
    };
    expect(await getUserAnnualGoal(db as never, 1, 2026)).toBeNull();
  });
});

describe("setUserAnnualGoal", () => {
  it("executes an UPSERT into user_goals", async () => {
    const { db, executed } = fakeDb();
    await setUserAnnualGoal(db as never, 1, { year: 2026, kind: "meters", target: 1_000_000 });
    expect(executed[0].sql).toContain("INSERT INTO user_goals");
    expect(executed[0].args.slice(0, 4)).toEqual([1, 2026, "meters", 1_000_000]);
  });
});

// ---------------------------------------------------------------------------
// getAnnotations / putAnnotation / deleteAnnotation
// ---------------------------------------------------------------------------

describe("getAnnotations", () => {
  it("returns an empty array when db is undefined", async () => {
    expect(await getAnnotations(undefined, 1, 1001)).toEqual([]);
  });

  it("swallows errors and returns an empty array", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        all: async () => {
          throw new Error();
        },
      }),
    };
    expect(await getAnnotations(db as never, 1, 1001)).toEqual([]);
  });
});

describe("putAnnotation", () => {
  it("throws when db is undefined", async () => {
    await expect(
      putAnnotation(undefined, 1, 1001, { id: 0, timestamp: 30, text: "hello" }),
    ).rejects.toThrow("Database not available");
  });

  it("inserts a new annotation when id is 0", async () => {
    const { db, executed } = fakeDb();
    const result = await putAnnotation(db as never, 1, 1001, {
      id: 0,
      timestamp: 30,
      text: "note",
    });
    expect(executed[0].sql).toContain("INSERT INTO annotations");
    expect(result.text).toBe("note");
    expect(result.timestamp).toBe(30);
  });

  it("throws a 404-like error when updating a non-existent annotation", async () => {
    // first() returns null → "Annotation not found"
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        first: async () => null,
      }),
    };
    await expect(
      putAnnotation(db as never, 1, 1001, { id: 5, timestamp: 30, text: "edit" }),
    ).rejects.toThrow("Annotation not found or unauthorized");
  });
});

describe("deleteAnnotation", () => {
  it("is a no-op when db is undefined", async () => {
    await expect(deleteAnnotation(undefined, 1, 1001, 5)).resolves.toBeUndefined();
  });

  it("executes a DELETE with the correct WHERE clause", async () => {
    const { db, executed } = fakeDb();
    await deleteAnnotation(db as never, 1, 1001, 5);
    expect(executed[0].sql).toContain("DELETE FROM annotations");
    expect(executed[0].args).toEqual([5, 1, 1001]);
  });

  it("propagates errors (unlike silent read paths)", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        run: async () => {
          throw new Error("constraint error");
        },
      }),
    };
    await expect(deleteAnnotation(db as never, 1, 1001, 5)).rejects.toThrow("constraint error");
  });
});

// ---------------------------------------------------------------------------
// upsertLeaderboardEntry / deleteLeaderboardEntry / getLeaderboardEntries
// ---------------------------------------------------------------------------

describe("upsertLeaderboardEntry", () => {
  it("is a no-op when db is undefined", async () => {
    await expect(
      upsertLeaderboardEntry(undefined, {
        sport: "rower",
        distance: 2000,
        userId: 1,
        workoutId: 1001,
        displayName: "Alice",
        time: 480,
        pace: 120,
        date: "2026-05-01",
      }),
    ).resolves.toBeUndefined();
  });

  it("executes an UPSERT into leaderboard_entry", async () => {
    const { db, executed } = fakeDb();
    await upsertLeaderboardEntry(db as never, {
      sport: "rower",
      distance: 2000,
      userId: 1,
      workoutId: 1001,
      displayName: "Alice",
      time: 480,
      pace: 120,
      date: "2026-05-01",
    });
    expect(executed[0].sql).toContain("INSERT INTO leaderboard_entry");
    expect(executed[0].sql).toContain("WHERE excluded.time < leaderboard_entry.time");
  });
});

describe("deleteLeaderboardEntry", () => {
  it("is a no-op when db is undefined", async () => {
    await expect(deleteLeaderboardEntry(undefined, 1, "rower", 2000)).resolves.toBeUndefined();
  });

  it("executes a DELETE with user_id, sport, and distance", async () => {
    const { db, executed } = fakeDb();
    await deleteLeaderboardEntry(db as never, 1, "rower", 2000);
    expect(executed[0].sql).toContain("DELETE FROM leaderboard_entry");
    expect(executed[0].args).toEqual([1, "rower", 2000]);
  });
});

describe("getLeaderboardEntries", () => {
  it("returns an empty array when db is undefined", async () => {
    expect(await getLeaderboardEntries(undefined)).toEqual([]);
  });

  it("swallows errors and returns an empty array", async () => {
    const db = {
      prepare: () => ({
        all: async () => {
          throw new Error();
        },
      }),
    };
    expect(await getLeaderboardEntries(db as never)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Additional coverage for previously untested exported functions
// ---------------------------------------------------------------------------

function makeWorkout(id: number): Workout {
  return {
    id,
    date: "2026-01-01 06:00:00",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: false,
  } as Workout;
}

describe("getPbWorkoutIds", () => {
  it("returns an empty set when no PBs match", async () => {
    const { db } = fakeDb();
    const ids = await getPbWorkoutIds(db as never, 1);
    expect(ids.size).toBe(0);
  });

  it("returns a set containing the PB workout id", async () => {
    const db = {
      prepare: () => ({
        bind: function () {
          return this;
        },
        run: async () => ({ meta: { changes: 1 }, results: [{ workout_id: 42 }] }),
      }),
      batch: async () => [{ results: [{ workout_id: 42 }] }],
    };
    const ids = await getPbWorkoutIds(db as never, 1);
    expect(ids.has(42)).toBe(true);
  });

  it("applies sport filter when provided", async () => {
    const sqlsSeen: string[] = [];
    const db = {
      prepare: (sql: string) => {
        sqlsSeen.push(sql);
        return {
          bind: function () {
            return this;
          },
          run: async () => ({ meta: { changes: 1 }, results: [] }),
        };
      },
      batch: async () => [],
    };
    await getPbWorkoutIds(db as never, 1, "bike");
    expect(sqlsSeen.some((s) => s.includes("sport = ?"))).toBe(true);
  });
});

describe("setWorkoutTag", () => {
  it("updates user_tag for the owned workout row", async () => {
    const { db, executed } = fakeDb();
    await setWorkoutTag(db as never, 7, 1001, "interval");
    expect(executed[0].sql).toContain("UPDATE workouts SET user_tag = ?");
    expect(executed[0].args).toEqual(["interval", 7, 1001]);
  });

  it("clears user_tag when tag is null", async () => {
    const { db, executed } = fakeDb();
    await setWorkoutTag(db as never, 7, 1001, null);
    expect(executed[0].args).toEqual([null, 7, 1001]);
  });
});

describe("upsertWorkouts", () => {
  it("executes an INSERT for each workout", async () => {
    const { db, executed } = fakeDb();
    await upsertWorkouts(db as never, 7, [makeWorkout(1001), makeWorkout(1002)]);
    expect(executed.length).toBe(2);
    expect(executed[0].sql).toContain("INSERT INTO workouts");
  });

  it("processes 101 workouts across two batch calls", async () => {
    const { db, executed, batchCalls } = fakeDb();
    const workouts = Array.from({ length: 101 }, (_, i) => makeWorkout(1000 + i));
    await upsertWorkouts(db as never, 7, workouts);
    expect(executed.length).toBe(101);
    expect(batchCalls.length).toBe(2);
    expect(batchCalls[0].length).toBe(100);
    expect(batchCalls[1].length).toBe(1);
  });
});

describe("clearShareToken", () => {
  it("executes an UPDATE to set share_token to NULL", async () => {
    const { db, executed } = fakeDb();
    await clearShareToken(db as never, 7, 1001);
    expect(executed[0].sql).toContain("share_token = NULL");
    expect(executed[0].args).toEqual([7, 1001]);
  });
});

describe("queryWorkouts", () => {
  it("returns mapped workout rows", async () => {
    const row = {
      workout_id: 1001,
      user_id: 7,
      date: "2026-01-01 06:00:00",
      sport: "rower",
      distance: 2000,
      time: 480,
      pace: 120,
      stroke_rate: null,
      stroke_count: null,
      heart_rate: null,
      hr_min: null,
      hr_max: null,
      calories: null,
      watt_minutes: null,
      drag_factor: null,
      workout_type: null,
      comments: null,
      timezone: null,
      has_stroke: 0,
      user_tag: "steady-state",
    };
    const { db } = fakeDb({ allRows: [row] });
    const results = await queryWorkouts(db as never, 7, { sort: "date", dir: "desc" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(1001);
  });

  it("applies sport filter when provided", async () => {
    const { db, executed } = fakeDb({ allRows: [] });
    await queryWorkouts(db as never, 7, { sort: "date", dir: "desc", sport: "bike" });
    expect(executed[0].sql).toContain("sport = ?");
  });

  it("returns empty array when pbsOnly is true but pbIds is empty", async () => {
    const { db } = fakeDb({ allRows: [] });
    const results = await queryWorkouts(
      db as never,
      7,
      { sort: "date", dir: "desc", pbsOnly: true },
      new Set(),
    );
    expect(results).toHaveLength(0);
  });

  it("applies distance band filter", async () => {
    const { db, executed } = fakeDb({ allRows: [] });
    await queryWorkouts(db as never, 7, { sort: "date", dir: "desc", distanceBandKey: "2000m" });
    expect(executed[0].sql).toContain("BETWEEN");
  });

  it("filters mapped rows by resolved workout tag", async () => {
    const rows = [
      {
        workout_id: 1001,
        user_id: 7,
        date: "2026-01-01 06:00:00",
        sport: "rower",
        distance: 2000,
        time: 480,
        pace: 120,
        stroke_rate: null,
        stroke_count: null,
        heart_rate: null,
        hr_min: null,
        hr_max: null,
        calories: null,
        watt_minutes: null,
        drag_factor: null,
        workout_type: null,
        comments: null,
        timezone: null,
        has_stroke: 0,
        user_tag: "interval",
      },
      {
        workout_id: 1002,
        user_id: 7,
        date: "2026-01-02 06:00:00",
        sport: "rower",
        distance: 5000,
        time: 1200,
        pace: 120,
        stroke_rate: null,
        stroke_count: null,
        heart_rate: null,
        hr_min: null,
        hr_max: null,
        calories: null,
        watt_minutes: null,
        drag_factor: null,
        workout_type: null,
        comments: null,
        timezone: null,
        has_stroke: 0,
        user_tag: "steady-state",
      },
    ];
    const { db } = fakeDb({ allRows: rows });
    const results = await queryWorkouts(db as never, 7, {
      sort: "date",
      dir: "desc",
      tag: "interval",
    });
    expect(results.map((w) => w.id)).toEqual([1001]);
  });
});

describe("getSportAggregates", () => {
  it("returns empty array when no rows", async () => {
    const { db } = fakeDb({ allRows: [] });
    const rows = await getSportAggregates(db as never, 7);
    expect(rows).toEqual([]);
  });

  it("returns aggregated rows", async () => {
    const row = {
      sport: "rower",
      sessions: 10,
      total_distance: 20000,
      total_time: 4800,
      avg_pace: 120,
      best_pace: 115,
      longest: 5000,
    };
    const { db } = fakeDb({ allRows: [row] });
    const rows = await getSportAggregates(db as never, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0].sport).toBe("rower");
  });
});

describe("getPersonalBests", () => {
  it("returns empty array when no PBs", async () => {
    const { db } = fakeDb({ allRows: [] });
    const rows = await getPersonalBests(db as never, 7);
    expect(rows).toEqual([]);
  });

  it("returns PB rows", async () => {
    const row = {
      sport: "rower",
      target_distance: 2000,
      best_time: 420,
      pace: 105,
      date: "2026-01-01 06:00:00",
    };
    const { db } = fakeDb({ allRows: [row] });
    const rows = await getPersonalBests(db as never, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0].target_distance).toBe(2000);
  });
});

describe("getAnnotationsByShareToken", () => {
  it("returns empty array when db is undefined", async () => {
    const rows = await getAnnotationsByShareToken(undefined, "tok", 1001);
    expect(rows).toEqual([]);
  });

  it("returns mapped annotations by share token", async () => {
    const row = {
      id: 5,
      user_id: 7,
      workout_id: 1001,
      timestamp: 30,
      text: "Good pace",
      created_at: "2026-01-01T06:00:00Z",
    };
    const { db } = fakeDb({ allRows: [row] });
    const rows = await getAnnotationsByShareToken(db as never, "mytoken", 1001);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("Good pace");
  });

  it("swallows errors and returns empty array", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => {
            throw new Error();
          },
        }),
      }),
    };
    const rows = await getAnnotationsByShareToken(db as never, "tok", 1001);
    expect(rows).toEqual([]);
  });
});
