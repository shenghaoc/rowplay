import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { toRivalGhostTrace } from '$lib/replay/rivalGhost';
import { loadSharedWorkout } from './share';

/** Cache-Control for token-gated public ghost traces (capability URLs). */
export const GHOST_TRACE_CACHE = 'public, max-age=3600';

/** Load a rival's shared stroke trace for ghost racing — no session. */
export async function loadRivalGhostTrace(event: RequestEvent, token: string) {
	const detail = await loadSharedWorkout(event, token);
	if (!detail.strokes?.length) throw error(404, 'Share link not found.');
	return toRivalGhostTrace(detail);
}

export function rivalGhostJson(event: RequestEvent, token: string) {
	return loadRivalGhostTrace(event, token).then((trace) =>
		json(trace, { headers: { 'cache-control': GHOST_TRACE_CACHE } })
	);
}
