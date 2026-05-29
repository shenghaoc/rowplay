import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import type { Workout, WorkoutDetail } from '../types';
import { mockWorkoutDetail, mockWorkouts } from '../mockData';
import { Concept2Client } from './concept2';
import { getConfig } from './config';
import { readSession } from './session';
import {
	countWorkouts,
	getAllWorkouts,
	getCachedDetail,
	getSyncState,
	putCachedDetail,
	setSyncState,
	upsertWorkouts,
	type SyncState
} from './db';

async function client(event: RequestEvent): Promise<Concept2Client | null> {
	const cfg = getConfig(event);
	const env = event.platform?.env;
	if (!cfg.clientId || !env?.SESSIONS || !event.locals.sessionId) return null;
	const session = await readSession(env.SESSIONS, event.locals.sessionId);
	if (!session) return null;
	return new Concept2Client(cfg, env.SESSIONS, event.locals.sessionId, session);
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
	const from = full || !state?.lastDate ? undefined : overlapDate(state.lastDate);

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

/** Back up one day from a "YYYY-MM-DD HH:MM:SS" date, returning "YYYY-MM-DD". */
function overlapDate(date: string): string {
	const d = new Date(date.replace(' ', 'T'));
	d.setDate(d.getDate() - 1);
	return d.toISOString().slice(0, 10);
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
