import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { Annotation, Sport, Workout, WorkoutDetail } from '../types';
import { mockAnnotations, mockWorkoutDetail, mockWorkouts } from '../mockData';
import { Concept2Client } from './concept2';
import { getConfig } from './config';
import { readSession, TOKEN_COOKIE, type SessionData, type SessionUser } from './session';
import { openToken } from './tokenCrypto';
import { nowEpochMillis, overlapDate } from '$lib/datetime';
import { detectNewPBs, distancePBs, type DistancePB } from '$lib/analytics';
import {
	filterAndSortWorkouts,
	parseWorkoutListQuery,
	pbWorkoutIds,
	type WorkoutListQuery
} from '$lib/workoutQuery';
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
	upsertWorkouts,
	type SyncState
} from './db';
import type { SportSummary, AnnualGoal } from '$lib/analytics';
import { destroySession } from './session';
import { defaultAnnualGoal, parseGoalsCookie } from '$lib/goals';

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
 * FULL history only once a sync has completed (this row exists). Until then a
 * cold or mid-fill D1 — which may hold just the most recent page — must not be
 * read as complete, or PBs/aggregates/export would silently omit older workouts.
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
	if (event.locals.demo) return mockWorkouts();
	const userId = event.locals.user?.id;
	const db = event.platform?.env?.DB;

	// Serve D1 only once a sync has completed — a cold or mid-fill cache may hold
	// just the most recent page, and returning that as the full history would skew
	// PBs/aggregates/export until the backfill finishes.
	if (db && userId != null && (await syncStateFor(event))) {
		const fromDb = await getAllWorkouts(db, userId).catch(() => []);
		if (fromDb.length) return fromDb;
	}
	// Not synced yet: show one live page so the dashboard isn't blank. We do NOT
	// persist it — a partial page must never masquerade as the complete history
	// (that's what the sync-state gate above guards). The background connect-sync
	// (or a manual Sync) fills D1 fully and writes sync state, flipping the gate.
	const c = await client(event);
	if (!c) throw error(401, 'Not authenticated.');
	return c.listWorkouts();
}

/**
 * Workout list for the dashboard — filtered/sorted in D1 when possible, else in JS.
 */
export async function loadWorkoutList(
	event: RequestEvent,
	q: WorkoutListQuery
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
	if (db && userId != null && (await syncStateFor(event))) {
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
}

/**
 * Page through the Concept2 logbook and upsert summaries into D1. Incremental:
 * only fetches workouts on/after the last synced date (minus a day of overlap
 * to catch edits), unless `full` forces a complete backfill.
 */
export async function syncWorkouts(event: RequestEvent, full = false): Promise<SyncResult> {
	const c = await client(event);
	const db = event.platform?.env?.DB;
	const userId = event.locals.user?.id;
	if (!c) throw error(401, 'Not authenticated.');
	if (!db || userId == null) throw error(500, 'Database (D1) is not configured.');
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
	full: boolean
): Promise<SyncResult> {
	const state = await getSyncState(db, userId);
	const from = full || !state?.lastDate ? undefined : (overlapDate(state.lastDate) ?? undefined);

	const beforePbs = distancePBs(await getAllWorkouts(db, userId).catch(() => []));

	let page = 1;
	let totalPages = 1;
	let added = 0;
	let newestDate = state?.lastDate ?? null;
	const synced: Workout[] = [];

	do {
		const { workouts, totalPages: tp } = await c.listWorkoutsPage(page, from);
		totalPages = tp;
		if (workouts.length) {
			await upsertWorkouts(db, userId, workouts);
			synced.push(...workouts);
			added += workouts.length;
			for (const w of workouts) {
				if (!newestDate || w.date > newestDate) newestDate = w.date;
			}
		}
		page++;
	} while (page <= totalPages);

	const total = await countWorkouts(db, userId);
	await setSyncState(db, userId, newestDate, total);
	const afterPbs = distancePBs(await getAllWorkouts(db, userId));
	const newPbs = detectNewPBs(beforePbs, afterPbs);
	return { added, total, newPbs, workouts: synced };
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Right after a BYOT connect, kick a full history backfill into the D1 cache in
 * the background so the *first* dashboard load is served locally instead of a
 * live API page. Runs via the Workers `waitUntil` (survives past the redirect);
 * the client is built directly from the just-validated token — no KV round-trip,
 * sidestepping read-after-write lag, and never touching the post-response event.
 * Best-effort, and a no-op without the Workers runtime (e.g. `vite dev`) — the
 * per-load lazy-fill still covers that case. `full` is forced so a reconnect
 * after a disconnect-purge re-pages everything rather than trusting stale state.
 */
export function scheduleConnectSync(
	event: RequestEvent,
	sid: string,
	user: SessionUser,
	token: string
): void {
	const env = event.platform?.env;
	const ctx = event.platform?.context;
	const db = env?.DB;
	if (!db || !env?.SESSIONS || typeof ctx?.waitUntil !== 'function') return;
	// In-memory session carrying the real token (KV still holds none); for a
	// personal session the client uses tokens.accessToken directly with no refresh.
	const session: SessionData = {
		user,
		personal: true,
		tokens: { accessToken: token, refreshToken: '', expiresAt: nowEpochMillis() + YEAR_MS, scope: '' }
	};
	const c = new Concept2Client(getConfig(event), env.SESSIONS, sid, session);
	ctx.waitUntil(runSync(db, user.id, c, true).catch(() => {}));
}

export async function loadAnnualGoal(event: RequestEvent, year: number): Promise<AnnualGoal> {
	if (event.locals.demo) {
		const fromCookie = parseGoalsCookie(event.cookies.get('annual_goal') ?? undefined);
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

export async function saveAnnualGoal(event: RequestEvent, goal: AnnualGoal): Promise<void> {
	if (event.locals.demo) {
		event.cookies.set('annual_goal', JSON.stringify(goal), {
			path: '/',
			maxAge: 60 * 60 * 24 * 400,
			sameSite: 'lax',
			httpOnly: false
		});
		return;
	}
	const userId = event.locals.user?.id;
	if (userId == null) throw error(401, 'Not authenticated.');
	const db = event.platform?.env?.DB;
	if (!db) throw error(500, 'Database (D1) is not configured.');
	await setUserAnnualGoal(db, userId, goal);
}

export async function syncStatus(event: RequestEvent): Promise<SyncState | null> {
	return syncStateFor(event);
}

export interface DashboardAggregates {
	bySport: SportSummary[];
	pbs: { distance: number; time: number; pace: number; date: string; sport: Sport }[];
}

export async function loadDashboardAggregates(
	event: RequestEvent
): Promise<DashboardAggregates | null> {
	if (event.locals.demo) return null;
	const userId = event.locals.user?.id;
	const db = event.platform?.env?.DB;
	if (!db || userId == null) return null;
	// Aggregates are computed in SQL over the cached rows; if the cache is still
	// filling (no completed sync) they'd be partial, so defer to the client-side
	// computation from the live page rather than showing skewed totals/PBs.
	if (!(await syncStateFor(event))) return null;

	const [sportRows, pbRows] = await Promise.all([
		getSportAggregates(db, userId).catch(() => []),
		getPersonalBests(db, userId).catch(() => [])
	]);

	if (!sportRows.length && !pbRows.length) return null;

	const bySport: SportSummary[] = sportRows.map((r) => ({
		sport: r.sport as Sport,
		sessions: r.sessions,
		distance: r.total_distance,
		time: r.total_time,
		avgPace: r.avg_pace,
		bestPace: r.best_pace ?? Infinity,
		longest: r.longest
	}));

	const pbs = pbRows.map((r) => ({
		distance: r.target_distance,
		time: r.best_time,
		pace: r.pace,
		date: r.date,
		sport: r.sport as Sport
	}));

	return { bySport, pbs };
}

export async function loadWorkoutDetail(
	event: RequestEvent,
	id: number
): Promise<WorkoutDetail> {
	if (event.locals.demo) {
		const d = mockWorkoutDetail(id);
		if (!d) throw error(404, 'Workout not found.');
		return d;
	}
	const c = await client(event);
	if (!c) throw error(401, 'Not authenticated.');

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
	if (!db || userId == null) throw error(500, 'Database (D1) is not configured.');
	await deleteUserData(db, userId);
	if (kv && sid) await destroySession(kv, sid);
}

// ---------------------------------------------------------------------------
// Coaching annotations
// ---------------------------------------------------------------------------

/** Demo-mode annotation store (in-memory, lost on server restart — acceptable for demo). */
const demoAnnotationStore = new Map<number, Annotation[]>();

export function resetDemoAnnotationStore(): void {
	demoAnnotationStore.clear();
}

export async function loadAnnotations(
	event: RequestEvent,
	workoutId: number
): Promise<Annotation[]> {
	if (event.locals.demo) {
		const stored = demoAnnotationStore.get(workoutId);
		if (stored) return stored;
		return mockAnnotations(workoutId);
	}
	const db = event.platform?.env?.DB;
	const userId = event.locals.user?.id;
	if (!db || userId == null) throw error(401, 'Not authenticated.');
	return dbGetAnnotations(db, userId, workoutId);
}

export async function saveAnnotation(
	event: RequestEvent,
	workoutId: number,
	annotation: { id: number; timestamp: number; text: string }
): Promise<Annotation> {
	if (event.locals.demo) {
		const stored = demoAnnotationStore.get(workoutId) ?? mockAnnotations(workoutId);
		const now = Date.now();
		let result: Annotation;
		if (annotation.id > 0) {
			const idx = stored.findIndex((a) => a.id === annotation.id);
			if (idx < 0) throw error(404, 'Annotation not found.');
			// Preserve the original createdAt on edit, matching putAnnotation (DB).
			stored[idx] = { ...annotation, createdAt: stored[idx].createdAt };
			result = stored[idx];
		} else {
			const newId = stored.length ? Math.max(...stored.map((a) => a.id)) + 1 : 1;
			result = { id: newId, timestamp: annotation.timestamp, text: annotation.text, createdAt: now };
			stored.push(result);
		}
		demoAnnotationStore.set(workoutId, stored);
		return result;
	}
	const db = event.platform?.env?.DB;
	const userId = event.locals.user?.id;
	if (!db || userId == null) throw error(401, 'Not authenticated.');
	return dbPutAnnotation(db, userId, workoutId, annotation);
}

export async function removeAnnotation(
	event: RequestEvent,
	workoutId: number,
	annotationId: number
): Promise<void> {
	if (event.locals.demo) {
		// Seed from the mock set when nothing's stored yet, so default demo notes
		// are deletable (not just ones created this session).
		const stored = demoAnnotationStore.get(workoutId) ?? mockAnnotations(workoutId);
		demoAnnotationStore.set(
			workoutId,
			stored.filter((a) => a.id !== annotationId)
		);
		return;
	}
	const db = event.platform?.env?.DB;
	const userId = event.locals.user?.id;
	if (!db || userId == null) throw error(401, 'Not authenticated.');
	await dbDeleteAnnotation(db, userId, workoutId, annotationId);
}
