import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishWorkout } from '$lib/server/leaderboard';

/** Publish a workout to its standard-distance board. Body: { workoutId }. */
export const POST: RequestHandler = async (event) => {
	let body: { workoutId?: unknown };
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Expected a JSON body.');
	}
	const workoutId = Number(body.workoutId);
	if (!Number.isInteger(workoutId) || workoutId <= 0) throw error(400, 'Invalid workout id.');

	const result = await publishWorkout(event, workoutId);
	return json(result, { headers: { 'cache-control': 'private, no-store' } });
};
