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
	return { workouts, sync, demo: event.locals.demo };
};
