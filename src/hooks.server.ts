import type { Handle } from '@sveltejs/kit';
import { ensureTemporal } from '$lib/ensure-temporal';
import { daisyThemeName, type ThemeName } from '$lib/theme.svelte';
import { readSession, SESSION_COOKIE } from '$lib/server/session';
import { isLanguage, type Language } from '$lib/i18n';
// Vite resolves this to the hashed, self-hosted asset URL at build time so the
// preload href always matches the emitted woff2.
import sourceSans400Url from '@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2?url';

await ensureTemporal();

// Preload only the primary body weight (Source Sans 3 400). The other weights
// and the mono face are discovered on demand from the layout CSS; pulling them
// all forward would waste bandwidth. crossorigin is required even same-origin —
// fonts are always fetched in CORS mode, and omitting it causes a double fetch.
const FONT_PRELOAD = `<link rel="preload" href="${sourceSans400Url}" as="font" type="font/woff2" crossorigin="anonymous" />`;

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;

	// Unauthenticated visitors see demo (mock) data; a valid session — OAuth or a
	// pasted personal token — flips us to that user's real data.
	event.locals.demo = true;
	event.locals.user = null;
	event.locals.sessionId = null;
	event.locals.personal = false;

	const sid = event.cookies.get(SESSION_COOKIE) ?? null;
	if (sid && env?.SESSIONS) {
		const session = await readSession(env.SESSIONS, sid);
		if (session) {
			event.locals.sessionId = sid;
			event.locals.user = session.user;
			event.locals.demo = false;
			event.locals.personal = session.personal === true;
		}
	}

	// Locale + theme from cookies so SSR renders the right language/theme with no
	// hydration flash. Defaults: English, light (race-board paper is the primary look).
	const langCookie = event.cookies.get('lang');
	const lang: Language = isLanguage(langCookie) ? langCookie : 'en';
	const theme: 'light' | 'dark' = event.cookies.get('theme') === 'dark' ? 'dark' : 'light';
	event.locals.lang = lang;
	event.locals.theme = theme;

	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%lang%', lang)
				.replace('%theme%', daisyThemeName(theme))
				.replace('%fontPreload%', FONT_PRELOAD)
	});

	return withSecurityHeaders(response, hstsEligible(event.url));
};

// Defense-in-depth defaults applied to every response. Each is set only when a
// route hasn't already chosen its own value, so individual endpoints can
// override (e.g. allow framing on a specific page).
const SECURITY_HEADERS: Record<string, string> = {
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	// Deny powerful APIs the app never uses so injected or embedded content can't
	// reach them either.
	'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
	// Prevent a cross-origin opener from accessing this window via window.opener,
	// and prevent this page from accessing cross-origin openers. This isolates the
	// browsing context so attackers can't redirect or inspect the tab.
	'Cross-Origin-Opener-Policy': 'same-origin',
	// Report-only CSP baseline: validates syntax and surfaces violations in
	// DevTools. about:blank report-uri silences the "no reporting endpoint"
	// browser warning; wire up a real collector before switching to enforce mode.
	'Content-Security-Policy-Report-Only':
		"default-src 'self'; base-uri 'self'; object-src 'none'; report-uri about:blank; " +
		"script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
		"font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'"
};

// HSTS is emitted only over HTTPS: browsers ignore it on plain-HTTP responses
// (e.g. local `wrangler dev`), so gating it keeps the header honest about the
// transport. `preload` is intentionally omitted — it's a standing commitment
// that requires explicit submission to the browser preload list.
const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

// ...but never send HSTS for localhost/loopback: a cached policy there forces
// *every* local HTTP service on that host (any port) to HTTPS, breaking other
// dev servers. Browsers don't apply HSTS to bare IPs, but we exclude them too
// for clarity.
const NO_HSTS_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hstsEligible(url: URL): boolean {
	return url.protocol === 'https:' && !NO_HSTS_HOSTS.has(url.hostname);
}

function applyDefaults(headers: Headers, secure: boolean): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!headers.has(name)) headers.set(name, value);
	}
	if (secure && !headers.has('Strict-Transport-Security')) {
		headers.set('Strict-Transport-Security', HSTS_VALUE);
	}
}

function withSecurityHeaders(response: Response, secure: boolean): Response {
	try {
		applyDefaults(response.headers, secure);
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
		applyDefaults(rebuilt.headers, secure);
		return rebuilt;
	}
}
