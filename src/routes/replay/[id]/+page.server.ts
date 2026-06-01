import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadAnnotations, loadWorkoutDetail, loadWorkouts } from '$lib/server/data';
import type { Workout } from '$lib/types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	const id = Number(event.params.id);
	const detail = await loadWorkoutDetail(event, id);
	const annotations = await loadAnnotations(event, id);

	// Candidate ghosts: other sessions of the same sport to race against.
	let candidates: Workout[] = [];
	try {
		const all = await loadWorkouts(event);
		candidates = all
			.filter((w) => w.sport === detail.sport && w.id !== id)
			.sort((a, b) => a.pace - b.pace); // fastest first
	} catch {
		candidates = [];
	}

	return { detail, candidates, annotations };
};
