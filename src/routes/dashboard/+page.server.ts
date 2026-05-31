import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadWorkouts, syncStatus } from '$lib/server/data';

export const load: PageServerLoad = async (event) => {
	// Require login unless we're in demo mode.
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	const workouts = await loadWorkouts(event);
	const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
	// UTC day key is stable across SSR (Workers) and client hydration.
	const calendarEndDay = new Date().toISOString().slice(0, 10);
	return { workouts, sync, demo: event.locals.demo, calendarEndDay };
};
