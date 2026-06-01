import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishWorkout } from '$lib/server/leaderboard';

/** Publish a workout to its standard-distance board. Body: { workoutId }. */
export const POST: RequestHandler = async (event) => {
	let body: { workoutId?: unknown } | null;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Expected a JSON body.');
	}
	// A literal `null` (or non-object) JSON body parses fine but would throw on
	// property access — reject it as a 400 rather than 500.
	if (!body || typeof body !== 'object') throw error(400, 'Expected a JSON object.');
	const workoutId = Number(body.workoutId);
	if (!Number.isInteger(workoutId) || workoutId <= 0) throw error(400, 'Invalid workout id.');

	const result = await publishWorkout(event, workoutId);
	return json(result, { headers: { 'cache-control': 'private, no-store' } });
};
