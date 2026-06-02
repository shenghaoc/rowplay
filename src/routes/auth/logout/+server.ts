import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession, SESSION_COOKIE, TOKEN_COOKIE } from '$lib/server/session';
import { deleteUserData } from '$lib/server/db';

export const POST: RequestHandler = async (event) => {
	const sid = event.cookies.get(SESSION_COOKIE);
	const kv = event.platform?.env?.SESSIONS;

	// Session-scoped cache: disconnecting a BYOT session purges its cached workout
	// data so nothing of the athlete's logbook outlives the session.
	if (event.locals.personal && event.locals.user) {
		const db = event.platform?.env?.DB;
		if (db) await deleteUserData(db, event.locals.user.id).catch(() => {});
	}

	if (sid && kv) await destroySession(kv, sid);
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	event.cookies.delete(TOKEN_COOKIE, { path: '/' });
	throw redirect(303, '/');
};
