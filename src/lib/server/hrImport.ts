import { error, type RequestEvent } from '@sveltejs/kit';
import type { HrSample } from '$lib/hrImport';
import { applyHrImport, stripHrFromDetail, strokesHaveHr } from '$lib/hrImport';
import type { WorkoutDetail } from '$lib/types';
import { loadWorkoutDetail } from './data';
import { getCachedDetail, putCachedDetail } from './db';
import { Concept2Client } from './concept2';
import { getConfig } from './config';
import { readSession } from './session';

async function freshFromApi(event: RequestEvent, id: number): Promise<WorkoutDetail> {
	const env = event.platform?.env;
	if (!env?.SESSIONS || !event.locals.sessionId) throw error(401, 'Not authenticated.');
	const session = await readSession(env.SESSIONS, event.locals.sessionId);
	if (!session) throw error(401, 'Not authenticated.');
	const c = new Concept2Client(getConfig(event), env.SESSIONS, event.locals.sessionId, session);
	return c.getWorkout(id);
}

export async function saveHrImport(
	event: RequestEvent,
	workoutId: number,
	samples: HrSample[],
	offsetSec: number
): Promise<WorkoutDetail> {
	if (event.locals.demo) throw error(400, 'Use client storage in demo mode.');
	if (!event.locals.user) throw error(401, 'Not authenticated.');
	const detail = await loadWorkoutDetail(event, workoutId);
	if (strokesHaveHr(detail.strokes)) {
		throw error(409, 'Workout already has heart rate. Clear the existing import first.');
	}
	const merged = applyHrImport(detail, samples, offsetSec);
	const userId = event.locals.user.id;
	await putCachedDetail(event.platform?.env?.DB, userId, merged);
	return merged;
}

export async function clearHrImport(event: RequestEvent, workoutId: number): Promise<WorkoutDetail> {
	if (event.locals.demo) throw error(400, 'Use client storage in demo mode.');
	if (!event.locals.user) throw error(401, 'Not authenticated.');
	const userId = event.locals.user.id;
	const db = event.platform?.env?.DB;

	let detail: WorkoutDetail;
	try {
		detail = await freshFromApi(event, workoutId);
	} catch (e) {
		const status = (e as { status?: number }).status;
		if (status && status !== 404) throw e;
		const cached = await getCachedDetail(db, userId, workoutId);
		if (!cached) throw error(404, 'Workout not found.');
		detail = stripHrFromDetail(cached);
	}
	await putCachedDetail(db, userId, detail);
	return detail;
}
