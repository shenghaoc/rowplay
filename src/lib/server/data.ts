import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import type { Workout, WorkoutDetail } from '../types';
import { mockWorkoutDetail, mockWorkouts } from '../mockData';
import { Concept2Client } from './concept2';
import { getConfig } from './config';
import { readSession } from './session';
import { overlapDate } from '$lib/datetime';
import {
	filterAndSortWorkouts,
	parseWorkoutListQuery,
	pbWorkoutIds,
	type WorkoutListQuery
} from '$lib/workoutQuery';
import {
	countWorkouts,
	getAllWorkouts,
	getCachedDetail,
	getPbWorkoutIds,
	getSyncState,
	putCachedDetail,
	queryWorkouts,
	setSyncState,
	upsertWorkouts,
	type SyncState
} from './db';

async function client(event: RequestEvent): Promise<Concept2Client | null> {
	const env = event.platform?.env;
	if (!env?.SESSIONS || !event.locals.sessionId) return null;
	const session = await readSession(env.SESSIONS, event.locals.sessionId);
	if (!session) return null;
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

	let page = 1;
	let totalPages = 1;
	let added = 0;
	let newestDate = state?.lastDate ?? null;

	do {
		const { workouts, totalPages: tp } = await c.listWorkoutsPage(page, from);
		totalPages = tp;
		if (workouts.length) {
			await upsertWorkouts(db, userId, workouts);
			added += workouts.length;
			for (const w of workouts) {
				if (!newestDate || w.date > newestDate) newestDate = w.date;
			}
		}
		page++;
	} while (page <= totalPages);

	const total = await countWorkouts(db, userId);
	await setSyncState(db, userId, newestDate, total);
	return { added, total };
}

export async function syncStatus(event: RequestEvent): Promise<SyncState | null> {
	const db = event.platform?.env?.DB;
	const userId = event.locals.user?.id;
	if (!db || userId == null) return null;
	return getSyncState(db, userId);
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
	const cached = await getCachedDetail(db, userId, id);
	if (cached) return cached;

	const detail = await c.getWorkout(id);
	await putCachedDetail(db, userId, detail);
	return detail;
}
