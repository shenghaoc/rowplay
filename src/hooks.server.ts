import type { Handle } from '@sveltejs/kit';
import { readSession, SESSION_COOKIE } from '$lib/server/session';
import type { Language } from '$lib/i18n';

const SUPPORTED_LANGS = new Set<Language>(['en', 'zh']);

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

	// Locale + theme from cookies so SSR renders the right language/theme with no
	// hydration flash. Defaults: English, and dark (rowplay is dark-first).
	const langCookie = event.cookies.get('lang');
	const lang: Language =
		langCookie && SUPPORTED_LANGS.has(langCookie as Language) ? (langCookie as Language) : 'en';
	const theme: 'light' | 'dark' = event.cookies.get('theme') === 'light' ? 'light' : 'dark';
	event.locals.lang = lang;
	event.locals.theme = theme;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', lang).replace('%theme%', theme)
	});
};
