import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadWorkoutDetail, loadWorkouts } from '$lib/server/data';

function parseId(raw: string | null): number | null {
	if (!raw) return null;
	const id = Number(raw);
	return Number.isFinite(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}

	let idA = parseId(event.url.searchParams.get('a'));
	let idB = parseId(event.url.searchParams.get('b'));

	const workouts = await loadWorkouts(event);

	let detailA = null;
	let detailB = null;

	if (idA != null) {
		try {
			detailA = await loadWorkoutDetail(event, idA);
		} catch {
			idA = null;
		}
	}
	if (idB != null) {
		try {
			detailB = await loadWorkoutDetail(event, idB);
		} catch {
			idB = null;
		}
	}

	return { workouts, detailA, detailB, idA, idB };
};
