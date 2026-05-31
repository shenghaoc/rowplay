import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listQueryFromEvent, loadWorkoutList, loadWorkouts, syncStatus } from '$lib/server/data';

export const load: PageServerLoad = async (event) => {
	// Require login unless we're in demo mode.
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	const listQuery = listQueryFromEvent(event);
	const [workouts, listWorkouts] = await Promise.all([
		loadWorkouts(event),
		loadWorkoutList(event, listQuery)
	]);
	const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
	// UTC day key is stable across SSR (Workers) and client hydration.
	const calendarEndDay = new Date().toISOString().slice(0, 10);
	return { workouts, listWorkouts, listQuery, sync, demo: event.locals.demo, calendarEndDay };
};
