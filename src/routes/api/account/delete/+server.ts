import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearUserCachedData } from '$lib/server/data';
import { SESSION_COOKIE, TOKEN_COOKIE } from '$lib/server/session';

export const POST: RequestHandler = async (event) => {
	if (event.locals.demo) {
		return json({ demo: true }, { headers: { 'cache-control': 'private, no-store' } });
	}
	if (!event.locals.user) throw error(401, 'Not authenticated.');

	let body: { confirm?: boolean } | null = null;
	try {
		body = (await event.request.json()) as { confirm?: boolean };
	} catch {
		/* empty body */
	}
	if (!body || typeof body !== 'object' || !body.confirm) throw error(400, 'Confirmation required.');

	await clearUserCachedData(event);
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	event.cookies.delete(TOKEN_COOKIE, { path: '/' });

	return json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
};
