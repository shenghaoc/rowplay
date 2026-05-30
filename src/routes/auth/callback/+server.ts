import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig, isAllowedUser, requireSessions } from '$lib/server/config';
import { exchangeCode, fetchMe } from '$lib/server/concept2';
import {
	newSessionId,
	OAUTH_STATE_COOKIE,
	SESSION_COOKIE,
	writeSession
} from '$lib/server/session';

export const GET: RequestHandler = async (event) => {
	const cfg = getConfig(event);
	const url = event.url;

	// Whitelist known OAuth2 error codes rather than reflecting arbitrary input.
	const denied = url.searchParams.get('error');
	if (denied) {
		const known = new Set([
			'access_denied',
			'invalid_request',
			'unauthorized_client',
			'unsupported_response_type',
			'invalid_scope',
			'server_error',
			'temporarily_unavailable'
		]);
		const code = known.has(denied) ? denied : 'unknown_error';
		throw error(400, `Authorization failed (${code}). Please try logging in again.`);
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expected = event.cookies.get(OAUTH_STATE_COOKIE);
	event.cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });

	if (!code || !state || state !== expected) {
		throw error(400, 'Invalid OAuth state. Please try logging in again.');
	}

	const kv = requireSessions(event);
	const tokens = await exchangeCode(cfg, code);
	const user = await fetchMe(cfg, tokens.accessToken);

	if (!isAllowedUser(cfg, user.id)) {
		throw error(403, 'This rowplay is locked to a single Concept2 account.');
	}

	const sid = newSessionId();
	await writeSession(kv, sid, { user, tokens });
	event.cookies.set(SESSION_COOKIE, sid, {
		path: '/',
		httpOnly: true,
		secure: cfg.appUrl.startsWith('https'),
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	});

	throw redirect(303, '/dashboard');
};
