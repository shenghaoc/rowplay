import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncWorkouts } from '$lib/server/data';

export const POST: RequestHandler = async (event) => {
	if (event.locals.demo) throw error(400, 'Sync is unavailable in demo mode.');
	const full = new URL(event.request.url).searchParams.get('full') === '1';
	try {
		const result = await syncWorkouts(event, full);
		return json(result, { headers: { 'cache-control': 'private, no-store' } });
	} catch (e) {
		if (isHttpError(e)) throw e; // already a clean status + message
		const msg = e instanceof Error ? e.message : String(e);
		// Missing tables = the D1 migrations were never applied for this database.
		if (/no such table|D1_ERROR/i.test(msg)) {
			throw error(
				503,
				'Workout storage isn’t set up yet — apply the D1 migrations (`npm run db:migrate`, or `db:migrate:local` for local dev) and sync again.'
			);
		}
		// Surface the real reason rather than a bare 500.
		throw error(502, `Sync failed: ${msg}`);
	}
};
