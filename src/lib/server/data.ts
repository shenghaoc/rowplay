import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import type { Annotation, Sport, Workout, WorkoutDetail } from '../types';
import { mockAnnotations, mockWorkoutDetail, mockWorkouts } from '../mockData';
import { Concept2Client } from './concept2';
import { getConfig } from './config';
import { getHomeTimezone, readSession, setHomeTimezone, TOKEN_COOKIE } from './session';
import { openToken } from './tokenCrypto';
import { overlapDate } from '$lib/datetime';
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

/**
 * List workouts for display/analytics. In live mode this reads the user's FULL
 * history from D1 (synced separately) so PBs/trends span everything — not just
 * the most recent API page. If D1 is empty (never synced) it falls back to a
 * single live API page so the dashboard is never blank.
 */
export async function loadWorkouts(event: RequestEvent): Promise<Workout[]> {
	if (event.locals.demo) return mockWorkouts();
	const userId = event.locals.user?.id;
	const db = event.platform?.env?.DB;

	if (db && userId != null) {
		const fromDb = await getAllWorkouts(db, userId).catch(() => []);
		if (fromDb.length) return fromDb;
	}
	// Cold start (no sync yet): show one live page rather than nothing.
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

	if (db && userId != null) {
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

export async function loadHomeTimezone(event: RequestEvent): Promise<string | undefined> {
	if (event.locals.demo) return undefined;
	const env = event.platform?.env;
	if (!env?.SESSIONS || !event.locals.sessionId) return undefined;
	const session = await readSession(env.SESSIONS, event.locals.sessionId);
	return session ? getHomeTimezone(session) : undefined;
}

export async function saveHomeTimezone(event: RequestEvent, timezone: string | undefined): Promise<void> {
	if (event.locals.demo) return;
	const env = event.platform?.env;
	if (!env?.SESSIONS || !event.locals.sessionId) throw error(401, 'Not authenticated.');
	const session = await readSession(env.SESSIONS, event.locals.sessionId);
	if (!session) throw error(401, 'Not authenticated.');
	await setHomeTimezone(env.SESSIONS, event.locals.sessionId, session, timezone);
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
	const db = event.platform?.env?.DB;
	const userId = event.locals.user?.id;
	if (!db || userId == null) return null;
	return getSyncState(db, userId);
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
