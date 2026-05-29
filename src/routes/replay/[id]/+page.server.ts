import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadWorkoutDetail } from '$lib/server/data';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	const detail = await loadWorkoutDetail(event, Number(event.params.id));
	return { detail };
};
