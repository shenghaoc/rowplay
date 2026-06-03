import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishWorkout, withdrawWorkout } from '$lib/server/leaderboard';

/** Parse and validate `{ workoutId }` from a JSON request body. */
async function readWorkoutId(request: Request): Promise<number> {
	let body: { workoutId?: unknown } | null;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Expected a JSON body.');
	}
	// A literal `null` (or non-object) JSON body parses fine but would throw on
	// property access — reject it as a 400 rather than 500.
	if (!body || typeof body !== 'object') throw error(400, 'Expected a JSON object.');
	const workoutId = Number(body.workoutId);
	if (!Number.isInteger(workoutId) || workoutId <= 0) throw error(400, 'Invalid workout id.');
	return workoutId;
}

/** Publish a workout to its standard-distance board. Body: { workoutId }. */
export const POST: RequestHandler = async (event) => {
	const workoutId = await readWorkoutId(event.request);
	try {
		const result = await publishWorkout(event, workoutId);
		return json(result, { headers: { 'cache-control': 'private, no-store' } });
	} catch (e) {
		// publishWorkout mints a share via createWorkoutShare, which throws 403
		// for non-public workouts. Surface that i18n key as a JSON body so the
		// client can show the localized privacy message (same shape as the share
		// endpoint), instead of a generic "HTTP 403". Non-403s (e.g. 422
		// off-board) keep their existing behaviour.
		if (isHttpError(e, 403)) {
			return json(
				{ error: e.body.message },
				{ status: 403, headers: { 'cache-control': 'private, no-store' } }
			);
		}
		throw e;
	}
};

/** Withdraw a workout from its board (reversible opt-out). Body: { workoutId }. */
export const DELETE: RequestHandler = async (event) => {
	const workoutId = await readWorkoutId(event.request);
	await withdrawWorkout(event, workoutId);
	return json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
};
