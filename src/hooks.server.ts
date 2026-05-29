import type { Handle } from '@sveltejs/kit';
import { readSession, SESSION_COOKIE } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;

	// Unauthenticated visitors see demo (mock) data; a valid session — OAuth or a
	// pasted personal token — flips us to that user's real data.
	event.locals.demo = true;
	event.locals.user = null;
	event.locals.sessionId = null;

	const sid = event.cookies.get(SESSION_COOKIE) ?? null;
	if (sid && env?.SESSIONS) {
		const session = await readSession(env.SESSIONS, sid);
		if (session) {
			event.locals.sessionId = sid;
			event.locals.user = session.user;
			event.locals.demo = false;
		}
	}

	return resolve(event);
};
