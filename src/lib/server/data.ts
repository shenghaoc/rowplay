import { nowEpochMillis } from "$lib/datetime";
import type { RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import type { D1Database } from "@cloudflare/workers-types";
import type { Annotation, Sport, Workout, WorkoutDetail } from "../types";
import { mockAnnotations, mockWorkoutDetail, mockWorkouts } from "../mockData";
import { Concept2Client } from "./concept2";
import { getConfig } from "./config";
import {
  getHomeTimezone,
  readSession,
  setHomeTimezone,
  TOKEN_COOKIE,
  type SessionData,
  type SessionUser,
} from "./session";
import { openToken } from "./tokenCrypto";
import { detectNewPBs, distancePBs, type DistancePB } from "$lib/analytics";
import {
  filterAndSortWorkouts,
  parseWorkoutListQuery,
  pbWorkoutIds,
  type WorkoutListQuery,
} from "$lib/workoutQuery";
import {
  BACKFILL_PAGES_PER_RUN,
  historyWindowStart,
  mergeWatermark,
  planSync,
  HISTORY_WINDOW_MONTHS,
} from "./historyWindow";
import {
  countWorkouts,
  deleteAnnotation as dbDeleteAnnotation,
  deleteUserData,
  getAllWorkouts,
  getAnnotations as dbGetAnnotations,
  getCachedDetail,
  getPbWorkoutIds,
  getPersonalBests,
  getSportAggregates,
  getSyncState,
  getUserAnnualGoal,
  putAnnotation as dbPutAnnotation,
  putCachedDetail,
  queryWorkouts,
  setSyncState,
  setUserAnnualGoal,
  setWorkoutTag,
  upsertWorkouts,
  type SyncState,
} from "./db";
import { type WorkoutTag } from "../workoutTag";
import type { SportSummary, AnnualGoal } from "$lib/analytics";
import { destroySession } from "./session";
import { defaultAnnualGoal, parseGoalsCookie } from "$lib/goals";
import { createLogger } from "./logger";

const logger = createLogger(console);

async function client(event: RequestEvent): Promise<Concept2Client | null> {
  const env = event.platform?.env;
  if (!env?.SESSIONS || !event.locals.sessionId) return null;
  const session = await readSession(env.SESSIONS, event.locals.sessionId);
  if (!session) return null;
  if (session.personal) {
    // BYOT: the credential isn't in KV — it's sealed in the cookie. Open it
    // just-in-time and inject it into the in-memory session. A missing/rotated/
    // tampered cookie (or no secret) yields no token → null → callers 401 →
    // reconnect. Legacy KV-token sessions have no cookie and land here too.
    const sealed = event.cookies.get(TOKEN_COOKIE);
    const secret = env.SESSION_SECRET;
    const token = sealed && secret ? await openToken(secret, sealed) : null;
    if (!token) return null;
    session.tokens = { ...session.tokens, accessToken: token };
  }
  // OAuth sessions carry a clientId for refresh; personal-token sessions don't
  // need one, so the client is built from whatever config is present.
  return new Concept2Client(getConfig(event), env.SESSIONS, event.locals.sessionId, session);
}

/** Per-request memo: a single dashboard load calls loadWorkouts directly *and*
 *  via loadWorkoutList's cold fallback, which would otherwise race two live API
 *  pages on first connect. Keyed by the request event, so it's scoped to one
 *  request and garbage-collected with it. */
const workoutsByEvent = new WeakMap<RequestEvent, Promise<Workout[]>>();

/**
 * Per-request memo of the user's sync state. D1 is treated as the authoritative
 * FULL history only once a sync has completed AND is not in-progress — a mid-fill
 * cache may hold just the most recent page, and returning that as the full
 * history would skew PBs/aggregates/export until the backfill finishes.
 *
 * Important: this WeakMap is per-RequestEvent. The sync API handler (POST /api/sync)
 * calls runSync() directly via getSyncState() (bypassing this memo), so the
 * WeakMap is empty when syncStatus() is called after a sync — it reads the freshly
 * updated state from D1. If a future handler reads from this memo before syncing,
 * syncStatus() will get the stale pre-sync value. Keep loadWorkouts/isCacheComplete
 * and syncStatus calls ordered accordingly.
 */
const syncStateByEvent = new WeakMap<RequestEvent, Promise<SyncState | null>>();
function syncStateFor(event: RequestEvent): Promise<SyncState | null> {
  let cached = syncStateByEvent.get(event);
  if (!cached) {
    const db = event.platform?.env?.DB;
    const userId = event.locals.user?.id;
    cached =
      db && userId != null ? getSyncState(db, userId).catch(() => null) : Promise.resolve(null);
    syncStateByEvent.set(event, cached);
  }
  return cached;
}

/**
 * True when the D1 cache is safe to read as the full history. The gate only
 * checks `inProgress` — `backfillDone` is irrelevant here because a completed
 * forward-sync still marks the cache as complete (the backfill flag only
 * controls whether older pages have been fetched, not whether the cache is
 * safe to serve as the authoritative source).
 */
async function isCacheComplete(event: RequestEvent): Promise<boolean> {
  const s = await syncStateFor(event);
  return !!s && !s.inProgress;
}

/**
 * List workouts for display/analytics. In live mode this reads the user's FULL
 * history from D1 (synced separately) so PBs/trends span everything — not just
 * the most recent API page. If D1 is empty (never synced) it falls back to a
 * single live API page so the dashboard is never blank.
 */
export function loadWorkouts(event: RequestEvent): Promise<Workout[]> {
  let cached = workoutsByEvent.get(event);
  if (!cached) {
    cached = loadWorkoutsFresh(event);
    workoutsByEvent.set(event, cached);
  }
  return cached;
}

async function loadWorkoutsFresh(event: RequestEvent): Promise<Workout[]> {
  if (event.locals.demo) return applyDemoWorkoutTags(mockWorkouts());
  const userId = event.locals.user?.id;
  const db = event.platform?.env?.DB;

  // Serve D1 only once a sync has completed AND is not in-progress — a mid-fill
  // cache may hold just the most recent page, and returning that as the full
  // history would skew PBs/aggregates/export until the backfill finishes.
  if (db && userId != null && (await isCacheComplete(event))) {
    const fromDb = await getAllWorkouts(db, userId).catch(() => []);
    if (fromDb.length) return fromDb;
  }
  // Not synced yet: show one live page so the dashboard isn't blank. We do NOT
  // persist it — a partial page must never masquerade as the complete history
  // (that's what the sync-state gate above guards). The background connect-sync
  // (or a manual Sync) fills D1 fully and writes sync state, flipping the gate.
  const c = await client(event);
  if (!c) throw error(401, "Not authenticated.");
  return c.listWorkouts();
}

/**
 * Workout list for the dashboard — filtered/sorted in D1 when possible, else in JS.
 */
export async function loadWorkoutList(
  event: RequestEvent,
  q: WorkoutListQuery,
): Promise<Workout[]> {
  if (event.locals.demo) {
    const all = mockWorkouts();
    const pbs = q.pbsOnly ? pbWorkoutIds(all, q.sport) : undefined;
    return filterAndSortWorkouts(all, q, pbs);
  }

  const userId = event.locals.user?.id;
  const db = event.platform?.env?.DB;

  // As in loadWorkouts: only query D1 once a sync has completed, so a partial
  // cache can't yield a truncated (and mis-paginated) list.
  if (db && userId != null && (await isCacheComplete(event))) {
    const count = await countWorkouts(db, userId).catch(() => 0);
    if (count > 0) {
      const pbs = q.pbsOnly ? await getPbWorkoutIds(db, userId, q.sport) : undefined;
      return queryWorkouts(db, userId, q, pbs);
    }
  }

  const all = await loadWorkouts(event);
  const pbs = q.pbsOnly ? pbWorkoutIds(all, q.sport) : undefined;
  return filterAndSortWorkouts(all, q, pbs);
}

export function listQueryFromEvent(event: RequestEvent): WorkoutListQuery {
  return parseWorkoutListQuery(event.url.searchParams);
}

export interface SyncResult {
  added: number;
  total: number;
  newPbs: DistancePB[];
  /** Summaries upserted during this sync (for live-mode optimistic UI). */
  workouts: Workout[];
  /** Populated when the sync fails — client uses this for retry UI. */
  error?: string;
}

/**
 * Page through the Concept2 logbook and upsert summaries into D1. First connect
 * uses a recent window (`HISTORY_WINDOW_MONTHS`); later runs are incremental
 * unless `full` forces a complete re-sync.
 */
export async function syncWorkouts(event: RequestEvent, full = false): Promise<SyncResult> {
  const c = await client(event);
  const db = event.platform?.env?.DB;
  const userId = event.locals.user?.id;
  if (!c) throw error(401, "Not authenticated.");
  if (!db || userId == null) throw error(500, "Database (D1) is not configured.");
  return runSync(db, userId, c, full);
}

/**
 * Core sync loop, decoupled from `RequestEvent` so it can also run in a
 * background task (`waitUntil`) right after connect — see `scheduleConnectSync`.
 */
async function runSync(
  db: D1Database,
  userId: number,
  c: Concept2Client,
  full: boolean,
): Promise<SyncResult> {
  const state = await getSyncState(db, userId);
  // Guard against concurrent sync runs: if another sync is already in flight,
  // bail out instead of racing it. The post-connect `waitUntil` full sync is
  // the most common concurrent caller; the caller can retry once the flag clears.
  if (state?.inProgress) {
    return { added: 0, total: state?.total ?? 0, newPbs: [], workouts: [] };
  }
  // Mark in-progress so concurrent requests don't race
  await setSyncState(db, userId, {
    lastDate: state?.lastDate ?? null,
    total: await countWorkouts(db, userId),
    oldestDate: state?.oldestDate ?? null,
    backfillDone: state?.backfillDone ?? false,
    inProgress: true,
  });

  try {
    const now = Temporal.Now.plainDateISO("UTC");
    const plan = planSync(state, now, full ? "full" : "forward");
    const from =
      plan.kind === "window" ? plan.from : plan.kind === "incremental" ? plan.from : undefined;

    let allBeforeFailed = false;
    const allBefore = await getAllWorkouts(db, userId).catch(() => {
      allBeforeFailed = true;
      return [] as Workout[];
    });
    const beforePbs = distancePBs(allBefore);

    let page = 1;
    let totalPages = 1;
    let added = 0;
    const synced: Workout[] = [];

    do {
      const { workouts, totalPages: tp } = await c.listWorkoutsPage(page, from);
      totalPages = tp;
      if (workouts.length) {
        await upsertWorkouts(db, userId, workouts);
        synced.push(...workouts);
        added += workouts.length;
      }
      page++;
    } while (page <= totalPages);

    const dates = synced.map((w) => w.date);
    let wm = mergeWatermark(
      {
        lastDate: state?.lastDate ?? null,
        oldestDate: state?.oldestDate ?? null,
        backfillDone: state?.backfillDone ?? false,
      },
      dates,
      false,
    );

    if (plan.kind === "window") {
      wm = { ...wm, oldestDate: historyWindowStart(now), backfillDone: false };
    }
    if (full) {
      wm = { ...wm, backfillDone: true };
    }

    const total = await countWorkouts(db, userId);
    await setSyncState(db, userId, {
      lastDate: wm.lastDate,
      total,
      oldestDate: wm.oldestDate,
      backfillDone: wm.backfillDone,
      inProgress: false,
      lastError: null,
      lastErrorAt: 0,
    });
    // Compute afterPbs from the saved pre-sync list merged with this sync's batch,
    // avoiding a second full-table scan on every sync.
    // If the initial read failed, fall back to a fresh query so PB detection is accurate.
    let afterPbs: DistancePB[];
    if (allBeforeFailed) {
      afterPbs = distancePBs(await getAllWorkouts(db, userId));
    } else {
      const syncedById = new Map(synced.map((w) => [w.id, w]));
      const existingIds = new Set(allBefore.map((w) => w.id));
      const afterWorkouts = [
        ...allBefore.map((w) => syncedById.get(w.id) ?? w),
        ...synced.filter((w) => !existingIds.has(w.id)),
      ];
      afterPbs = distancePBs(afterWorkouts);
    }
    const newPbs = detectNewPBs(beforePbs, afterPbs);
    return { added, total, newPbs, workouts: synced };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[sync] runSync failed:", msg);
    // Reset inProgress and record the error. Preserve lastSyncAt so the
    // UI still shows the last *successful* sync time, not this failure.
    await setSyncState(db, userId, {
      lastDate: state?.lastDate ?? null,
      total: await countWorkouts(db, userId).catch(() => 0),
      oldestDate: state?.oldestDate ?? null,
      backfillDone: state?.backfillDone ?? false,
      inProgress: false,
      lastError: msg,
      lastErrorAt: nowEpochMillis(),
      lastSyncAt: state?.lastSyncAt ?? undefined,
    }).catch(() => {});
    throw e;
  }
}

export interface BackfillResult {
  added: number;
  oldestDate: string | null;
  done: boolean;
}

/** One chunked backfill pass — older than the persisted watermark. */
export async function backfillWorkouts(event: RequestEvent): Promise<BackfillResult> {
  const c = await client(event);
  const db = event.platform?.env?.DB;
  const userId = event.locals.user?.id;
  if (!c) throw error(401, "Not authenticated.");
  if (!db || userId == null) throw error(500, "Database (D1) is not configured.");

  const state = await getSyncState(db, userId);
  // Guard against concurrent backfill runs
  if (state?.inProgress) {
    return { added: 0, oldestDate: state?.oldestDate ?? null, done: state?.backfillDone ?? false };
  }
  // Mark in-progress so concurrent requests don't race
  await setSyncState(db, userId, {
    lastDate: state?.lastDate ?? null,
    total: await countWorkouts(db, userId),
    oldestDate: state?.oldestDate ?? null,
    backfillDone: state?.backfillDone ?? false,
    inProgress: true,
  });

  try {
    const now = Temporal.Now.plainDateISO("UTC");
    const plan = planSync(state, now, "backfill");
    if (plan.kind !== "backfill") {
      // Latch backfill_done so already-synced users stop re-triggering the loop.
      if (plan.kind === "done" && state && !state.backfillDone) {
        await setSyncState(db, userId, {
          lastDate: state.lastDate,
          total: await countWorkouts(db, userId),
          oldestDate: state.oldestDate,
          backfillDone: true,
          inProgress: false,
        });
      } else {
        // Clear in-progress flag even when no latch update is needed
        await setSyncState(db, userId, {
          lastDate: state?.lastDate ?? null,
          total: await countWorkouts(db, userId),
          oldestDate: state?.oldestDate ?? null,
          backfillDone: state?.backfillDone ?? false,
          inProgress: false,
        });
      }
      return {
        added: 0,
        oldestDate: state?.oldestDate ?? null,
        done: plan.kind === "done",
      };
    }

    let page = 1;
    let totalPages = 1;
    let added = 0;
    const dates: string[] = [];
    let pagesFetched = 0;

    while (page <= totalPages && pagesFetched < BACKFILL_PAGES_PER_RUN) {
      const { workouts, totalPages: tp } = await c.listWorkoutsPage(page, undefined, plan.to);
      totalPages = tp;
      if (workouts.length) {
        await upsertWorkouts(db, userId, workouts);
        added += workouts.length;
        dates.push(...workouts.map((w) => w.date));
      }
      page++;
      pagesFetched++;
    }

    const wm = mergeWatermark(
      {
        lastDate: state?.lastDate ?? null,
        oldestDate: state?.oldestDate ?? null,
        backfillDone: state?.backfillDone ?? false,
      },
      dates,
      dates.length === 0 || page > totalPages,
    );

    const total = await countWorkouts(db, userId);
    await setSyncState(db, userId, {
      lastDate: wm.lastDate,
      total,
      oldestDate: wm.oldestDate,
      backfillDone: wm.backfillDone,
      inProgress: false,
      lastError: null,
      lastErrorAt: 0,
    });

    return { added, oldestDate: wm.oldestDate, done: wm.backfillDone };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[sync] backfillWorkouts failed:", msg);
    // Reset inProgress and record the error. Preserve lastSyncAt so the
    // UI still shows the last *successful* sync time, not this failure.
    await setSyncState(db, userId, {
      lastDate: state?.lastDate ?? null,
      total: await countWorkouts(db, userId).catch(() => 0),
      oldestDate: state?.oldestDate ?? null,
      backfillDone: state?.backfillDone ?? false,
      inProgress: false,
      lastError: msg,
      lastErrorAt: nowEpochMillis(),
      lastSyncAt: state?.lastSyncAt ?? undefined,
    }).catch(() => {});
    throw e;
  }
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Right after a BYOT connect, kick a full history backfill into the D1 cache in
 * the background. Sets in_progress=1 in the sync_state row while running so the
 * dashboard can show a "syncing…" indicator; clears it on completion or error.
 * Runs via the Workers `waitUntil`; best-effort, no-op without Workers runtime.
 */
export function scheduleConnectSync(
  event: RequestEvent,
  sid: string,
  user: SessionUser,
  token: string,
): void {
  const env = event.platform?.env;
  const ctx = event.platform?.context;
  const db = env?.DB;
  if (!db || !env?.SESSIONS || typeof ctx?.waitUntil !== "function") return;
  // In-memory session carrying the real token (KV still holds none); for a
  // personal session the client uses tokens.accessToken directly with no refresh.
  const session: SessionData = {
    user,
    personal: true,
    tokens: {
      accessToken: token,
      refreshToken: "",
      expiresAt: nowEpochMillis() + YEAR_MS,
      scope: "",
    },
  };
  const c = new Concept2Client(getConfig(event), env.SESSIONS, sid, session);
  ctx.waitUntil(
    runSync(db, user.id, c, true).catch((e) => {
      logger.error(
        "[sync] connectSync background sync failed:",
        e instanceof Error ? e.message : String(e),
      );
    }),
  );
}

export async function loadAnnualGoal(event: RequestEvent, year: number): Promise<AnnualGoal> {
  if (event.locals.demo) {
    const fromCookie = parseGoalsCookie(event.cookies.get("annual_goal") ?? undefined);
    if (fromCookie?.year === year) return fromCookie;
    return defaultAnnualGoal(year);
  }
  const userId = event.locals.user?.id;
  const db = event.platform?.env?.DB;
  if (db && userId != null) {
    const stored = await getUserAnnualGoal(db, userId, year);
    if (stored) return stored;
  }
  return defaultAnnualGoal(year);
}

export async function loadHomeTimezone(event: RequestEvent): Promise<string | undefined> {
  if (event.locals.demo) return undefined;
  const env = event.platform?.env;
  if (!env?.SESSIONS || !event.locals.sessionId) return undefined;
  const session = await readSession(env.SESSIONS, event.locals.sessionId);
  return session ? getHomeTimezone(session) : undefined;
}

export async function saveHomeTimezone(
  event: RequestEvent,
  timezone: string | undefined,
): Promise<void> {
  if (event.locals.demo) return;
  const env = event.platform?.env;
  if (!env?.SESSIONS || !event.locals.sessionId) throw error(401, "Not authenticated.");
  const session = await readSession(env.SESSIONS, event.locals.sessionId);
  if (!session) throw error(401, "Not authenticated.");
  await setHomeTimezone(env.SESSIONS, event.locals.sessionId, session, timezone);
}

export async function saveAnnualGoal(event: RequestEvent, goal: AnnualGoal): Promise<void> {
  if (event.locals.demo) {
    event.cookies.set("annual_goal", JSON.stringify(goal), {
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
      sameSite: "lax",
      httpOnly: false,
    });
    return;
  }
  const userId = event.locals.user?.id;
  if (userId == null) throw error(401, "Not authenticated.");
  const db = event.platform?.env?.DB;
  if (!db) throw error(500, "Database (D1) is not configured.");
  await setUserAnnualGoal(db, userId, goal);
}

export type SyncStatusPayload = SyncState & { historyWindowMonths: number };

export async function syncStatus(event: RequestEvent): Promise<SyncStatusPayload | null> {
  // Reuse the per-request sync-state memo (main) so a dashboard load that also
  // gates loadWorkouts/aggregates on sync state doesn't hit D1 twice; then wrap
  // it with the history-window length the backfill UI needs (#71).
  const state = await syncStateFor(event);
  if (!state) return null;
  return { ...state, historyWindowMonths: HISTORY_WINDOW_MONTHS };
}

export interface DashboardAggregates {
  bySport: SportSummary[];
  pbs: { distance: number; time: number; pace: number; date: string; sport: Sport }[];
}

export async function loadDashboardAggregates(
  event: RequestEvent,
): Promise<DashboardAggregates | null> {
  if (event.locals.demo) return null;
  const userId = event.locals.user?.id;
  const db = event.platform?.env?.DB;
  if (!db || userId == null) return null;
  // Aggregates are computed in SQL over the cached rows; if the cache is still
  // filling (no completed sync or sync in progress) they'd be partial, so defer
  // to the client-side computation rather than showing skewed totals/PBs.
  if (!(await isCacheComplete(event))) return null;

  const [sportRows, pbRows] = await Promise.all([
    getSportAggregates(db, userId).catch(() => []),
    getPersonalBests(db, userId).catch(() => []),
  ]);

  if (!sportRows.length && !pbRows.length) return null;

  const bySport: SportSummary[] = sportRows.map((r) => ({
    sport: r.sport as Sport,
    sessions: r.sessions,
    distance: r.total_distance,
    time: r.total_time,
    avgPace: r.avg_pace,
    bestPace: r.best_pace ?? Infinity,
    longest: r.longest,
  }));

  const pbs = pbRows.map((r) => ({
    distance: r.target_distance,
    time: r.best_time,
    pace: r.pace,
    date: r.date,
    sport: r.sport as Sport,
  }));

  return { bySport, pbs };
}

export async function loadWorkoutDetail(event: RequestEvent, id: number): Promise<WorkoutDetail> {
  if (event.locals.demo) {
    const d = mockWorkoutDetail(id);
    if (!d) throw error(404, "Workout not found.");
    if (demoWorkoutTagStore.has(id)) {
      return { ...d, userTag: demoWorkoutTagStore.get(id) ?? null };
    }
    return d;
  }
  const c = await client(event);
  if (!c) throw error(401, "Not authenticated.");

  const userId = event.locals.user!.id;
  const db = event.platform?.env?.DB;
  const cached = await getCachedDetail(db, userId, id, event.platform?.env);
  if (cached) return cached;

  const detail = await c.getWorkout(id);
  await putCachedDetail(db, userId, detail);
  return detail;
}

/** Purge D1 cache for the signed-in user and end their KV session. */
export async function clearUserCachedData(event: RequestEvent): Promise<void> {
  if (event.locals.demo) return;
  const db = event.platform?.env?.DB;
  const userId = event.locals.user?.id;
  const kv = event.platform?.env?.SESSIONS;
  const sid = event.locals.sessionId;
  if (!db || userId == null) throw error(500, "Database (D1) is not configured.");
  await deleteUserData(db, userId);
  if (kv && sid) await destroySession(kv, sid);
}

// ---------------------------------------------------------------------------
// Coaching annotations
// ---------------------------------------------------------------------------

/** Demo-mode annotation store (in-memory, lost on server restart — acceptable for demo). */
const demoAnnotationStore = new Map<number, Annotation[]>();

/** Demo-mode workout type tag overrides (workout id → tag or null for auto). */
const demoWorkoutTagStore = new Map<number, WorkoutTag | null>();

export function resetDemoWorkoutTagStore(): void {
  demoWorkoutTagStore.clear();
}

export function resetDemoAnnotationStore(): void {
  demoAnnotationStore.clear();
}

export async function loadAnnotations(
  event: RequestEvent,
  workoutId: number,
): Promise<Annotation[]> {
  if (event.locals.demo) {
    const stored = demoAnnotationStore.get(workoutId);
    if (stored) return stored;
    return mockAnnotations(workoutId);
  }
  const db = event.platform?.env?.DB;
  const userId = event.locals.user?.id;
  if (!db || userId == null) throw error(401, "Not authenticated.");
  return dbGetAnnotations(db, userId, workoutId);
}

export async function saveAnnotation(
  event: RequestEvent,
  workoutId: number,
  annotation: { id: number; timestamp: number; text: string },
): Promise<Annotation> {
  if (event.locals.demo) {
    const stored = demoAnnotationStore.get(workoutId) ?? mockAnnotations(workoutId);
    const now = nowEpochMillis();
    let result: Annotation;
    if (annotation.id > 0) {
      const idx = stored.findIndex((a) => a.id === annotation.id);
      if (idx < 0) throw error(404, "Annotation not found.");
      // Preserve the original createdAt on edit, matching putAnnotation (DB).
      stored[idx] = { ...annotation, createdAt: stored[idx].createdAt };
      result = stored[idx];
    } else {
      let maxId = 0;
      for (let i = 0; i < stored.length; i++) {
        if (stored[i].id > maxId) maxId = stored[i].id;
      }
      const newId = maxId + 1;
      result = {
        id: newId,
        timestamp: annotation.timestamp,
        text: annotation.text,
        createdAt: now,
      };
      stored.push(result);
    }
    demoAnnotationStore.set(workoutId, stored);
    return result;
  }
  const db = event.platform?.env?.DB;
  const userId = event.locals.user?.id;
  if (!db || userId == null) throw error(401, "Not authenticated.");
  return dbPutAnnotation(db, userId, workoutId, annotation);
}

export async function removeAnnotation(
  event: RequestEvent,
  workoutId: number,
  annotationId: number,
): Promise<void> {
  if (event.locals.demo) {
    // Seed from the mock set when nothing's stored yet, so default demo notes
    // are deletable (not just ones created this session).
    const stored = demoAnnotationStore.get(workoutId) ?? mockAnnotations(workoutId);
    demoAnnotationStore.set(
      workoutId,
      stored.filter((a) => a.id !== annotationId),
    );
    return;
  }
  const db = event.platform?.env?.DB;
  const userId = event.locals.user?.id;
  if (!db || userId == null) throw error(401, "Not authenticated.");
  await dbDeleteAnnotation(db, userId, workoutId, annotationId);
}

export async function saveWorkoutTag(
  event: RequestEvent,
  workoutId: number,
  tag: WorkoutTag | null,
): Promise<WorkoutTag | null> {
  if (event.locals.demo) {
    demoWorkoutTagStore.set(workoutId, tag);
    return tag;
  }
  const userId = event.locals.user?.id;
  if (userId == null) throw error(401, "Not authenticated.");
  const db = event.platform?.env?.DB;
  if (!db) throw error(500, "Database (D1) is not configured.");
  await setWorkoutTag(db, userId, workoutId, tag);
  return tag;
}

/** Apply demo tag overrides to workout rows returned in demo mode. */
export function applyDemoWorkoutTags(workouts: Workout[]): Workout[] {
  if (!demoWorkoutTagStore.size) return workouts;
  return workouts.map((w) => {
    if (!demoWorkoutTagStore.has(w.id)) return w;
    return { ...w, userTag: demoWorkoutTagStore.get(w.id) ?? null };
  });
}
