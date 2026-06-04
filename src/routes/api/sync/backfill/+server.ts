import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { backfillWorkouts } from '$lib/server/data';

export const POST: RequestHandler = async (event) => {
	if (event.locals.demo) {
		return json(
			{ added: 0, oldestDate: null, done: true },
			{ headers: { 'cache-control': 'private, no-store' } }
		);
	}
	try {
		const result = await backfillWorkouts(event);
		return json(result, { headers: { 'cache-control': 'private, no-store' } });
	} catch (e) {
		if (isHttpError(e)) throw e;
		const msg = e instanceof Error ? e.message : String(e);
		if (/failed \(429\)/i.test(msg)) {
			throw error(429, 'Rate limit exceeded on Concept2 API. Please try again later.');
		}
		if (/no such table|D1_ERROR/i.test(msg)) {
			throw error(
				503,
				'Workout storage isn’t set up yet — apply the D1 migrations (`npm run db:migrate`, or `db:migrate:local` for local dev) and sync again.'
			);
		}
		throw error(502, `Backfill failed: ${msg}`);
	}
};
