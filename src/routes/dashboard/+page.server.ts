import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listQueryFromEvent, loadDashboardAggregates, loadWorkoutList, loadWorkouts, syncStatus } from '$lib/server/data';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	const listQuery = listQueryFromEvent(event);
	const [workouts, listWorkouts, aggregates] = await Promise.all([
		loadWorkouts(event),
		loadWorkoutList(event, listQuery),
		loadDashboardAggregates(event)
	]);
	const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
	const calendarEndDay = new Date().toISOString().slice(0, 10);
	return { workouts, listWorkouts, listQuery, aggregates, sync, demo: event.locals.demo, calendarEndDay };
};
