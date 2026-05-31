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

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', lang).replace('%theme%', theme)
	});

	return withSecurityHeaders(response);
};

// Defense-in-depth defaults applied to every response. Each is set only when a
// route hasn't already chosen its own value, so individual endpoints can
// override (e.g. allow framing on a specific page).
const SECURITY_HEADERS: Record<string, string> = {
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function applyDefaults(headers: Headers): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!headers.has(name)) headers.set(name, value);
	}
}

function withSecurityHeaders(response: Response): Response {
	try {
		applyDefaults(response.headers);
		return response;
	} catch (e) {
		if (!(e instanceof TypeError)) throw e;
		// Some responses (e.g. one returned directly from `fetch`) have immutable
		// headers, and `.set()` throws. Rebuild with a mutable copy and retry.
		const rebuilt = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: new Headers(response.headers)
		});
		applyDefaults(rebuilt.headers);
		return rebuilt;
	}
}
