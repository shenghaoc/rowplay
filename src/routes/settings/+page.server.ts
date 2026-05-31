import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadWorkouts, syncStatus } from '$lib/server/data';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	const workouts = await loadWorkouts(event);
	const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
	const tcxWorkouts = workouts.filter((w) => w.hasStrokeData).map((w) => ({ id: w.id, date: w.date }));
	return {
		demo: event.locals.demo,
		workoutCount: workouts.length,
		sync,
		tcxWorkouts
	};
};
