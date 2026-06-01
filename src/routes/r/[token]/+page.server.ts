import { error, isHttpError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadSharedWorkout, shareMeta } from '$lib/server/share';
import { getConfig } from '$lib/server/config';
import { loadAnnotations } from '$lib/server/data';

/** Public, read-only replay — no login; only explicitly shared workouts. */
export const load: PageServerLoad = async (event) => {
	const token = event.params.token;
	try {
		const detail = await loadSharedWorkout(event, token);
		const annotations = await loadAnnotations(event, detail.id);
		const origin = getConfig(event).appUrl.replace(/\/$/, '');
		const url = `${origin}/r/${token}`;
		const meta = shareMeta(detail, url);
		return { detail, meta, annotations, publicView: true as const };
	} catch (e) {
		if (isHttpError(e, 404)) throw error(404, 'Share link not found.');
		throw e;
	}
};
