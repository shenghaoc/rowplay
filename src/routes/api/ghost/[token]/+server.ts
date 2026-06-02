import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isShareToken } from '$lib/replay/rivalGhost';
import { rivalGhostJson } from '$lib/server/rivalGhost';

/** Public, read-only rival stroke trace for ghost racing — gated by share token. */
export const GET: RequestHandler = async (event) => {
	const token = event.params.token;
	if (!isShareToken(token)) throw error(404, 'Share link not found.');
	return rivalGhostJson(event, token);
};
