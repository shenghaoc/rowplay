import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession, SESSION_COOKIE } from '$lib/server/session';

export const POST: RequestHandler = async (event) => {
	const sid = event.cookies.get(SESSION_COOKIE);
	const kv = event.platform?.env?.SESSIONS;
	if (sid && kv) await destroySession(kv, sid);
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	throw redirect(303, '/');
};
