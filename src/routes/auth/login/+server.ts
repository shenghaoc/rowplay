import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';
import { buildAuthorizeUrl } from '$lib/server/concept2';
import { OAUTH_STATE_COOKIE } from '$lib/server/session';

export const GET: RequestHandler = async (event) => {
	const cfg = getConfig(event);
	if (!cfg.clientId) {
		// Demo mode — nothing to log into.
		throw redirect(303, '/dashboard');
	}

	const state = crypto.randomUUID();
	event.cookies.set(OAUTH_STATE_COOKIE, state, {
		path: '/',
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 600
	});

	throw redirect(302, buildAuthorizeUrl(cfg, state));
};
