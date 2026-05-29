import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadWorkouts } from '$lib/server/data';

export const GET: RequestHandler = async (event) => {
	const workouts = await loadWorkouts(event);
	// Personal data — never let an intermediary or the browser cache it.
	return json(
		{ workouts, demo: event.locals.demo },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
