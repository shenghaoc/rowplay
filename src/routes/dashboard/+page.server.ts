import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadDashboardAggregates, loadWorkouts, syncStatus } from '$lib/server/data';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	const [workouts, aggregates] = await Promise.all([
		loadWorkouts(event),
		loadDashboardAggregates(event)
	]);
	const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
	const calendarEndDay = new Date().toISOString().slice(0, 10);
	return { workouts, aggregates, sync, demo: event.locals.demo, calendarEndDay };
};
