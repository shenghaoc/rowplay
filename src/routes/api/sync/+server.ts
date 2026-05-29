import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncWorkouts } from '$lib/server/data';

export const POST: RequestHandler = async (event) => {
	if (event.locals.demo) throw error(400, 'Sync is unavailable in demo mode.');
	const full = new URL(event.request.url).searchParams.get('full') === '1';
	const result = await syncWorkouts(event, full);
	return json(result, { headers: { 'cache-control': 'private, no-store' } });
};
