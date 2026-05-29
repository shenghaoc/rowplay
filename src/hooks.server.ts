import type { Handle } from '@sveltejs/kit';
import { readSession, SESSION_COOKIE } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;
	const clientId = env?.CONCEPT2_CLIENT_ID ?? '';

	// Demo mode: no credentials configured -> serve mock data, no auth required.
	event.locals.demo = !clientId;
	event.locals.user = null;
	event.locals.sessionId = null;

	const sid = event.cookies.get(SESSION_COOKIE) ?? null;
	if (sid && env?.SESSIONS) {
		const session = await readSession(env.SESSIONS, sid);
		if (session) {
			event.locals.sessionId = sid;
			event.locals.user = session.user;
		}
	}

	return resolve(event);
};
