import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadWorkouts } from '$lib/server/data';

export const GET: RequestHandler = async (event) => {
	const workouts = await loadWorkouts(event);
	return json({ workouts, demo: event.locals.demo });
};
