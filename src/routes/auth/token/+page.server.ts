import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { nowEpochMillis } from '$lib/datetime';
import { getConfig, requireSessions } from '$lib/server/config';
import { getValue } from '$lib/i18n';
import { fetchMe } from '$lib/server/concept2';
import {
	newSessionId,
	SESSION_COOKIE,
	TOKEN_COOKIE,
	writeSession,
	type SessionUser
} from '$lib/server/session';
import { sealToken } from '$lib/server/tokenCrypto';

export const load: PageServerLoad = async (event) => {
	// Already authenticated — nothing to enter.
	if (event.locals.user) throw redirect(303, '/dashboard');
	return { oauthEnabled: !!getConfig(event).clientId };
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const tr = (k: string) => getValue(event.locals.lang, k) ?? getValue('en', k) ?? k;
		const token = (data.get('token') ?? '').toString().trim();
		if (!token) return fail(400, { error: tr('token.empty') });

		const cfg = getConfig(event);
		const kv = requireSessions(event);
		// The token is sealed into an httpOnly cookie, never stored in KV. Without a
		// secret we can't seal it — fail clearly rather than fall back to plaintext.
		const secret = event.platform?.env?.SESSION_SECRET;
		if (!secret) return fail(500, { error: tr('token.serverMisconfigured') });

		// Validate by fetching the owner; a bad token is rejected here. Note: the
		// redirect below must stay OUTSIDE this try — redirect() throws, and a
		// catch would swallow it.
		let user: SessionUser;
		try {
			user = await fetchMe(cfg, token);
		} catch {
			return fail(400, { error: tr('token.rejected') });
		}

		const sealed = await sealToken(secret, token);
		const sid = newSessionId();
		// KV holds identity only — the access token stays empty here and lives
		// sealed in the cookie below.
		await writeSession(kv, sid, {
			user,
			personal: true,
			tokens: { accessToken: '', refreshToken: '', expiresAt: nowEpochMillis() + YEAR_MS, scope: '' }
		});
		const cookieOpts = {
			path: '/',
			httpOnly: true,
			secure: event.url.protocol === 'https:',
			sameSite: 'lax' as const,
			maxAge: 60 * 60 * 24 * 30
		};
		event.cookies.set(SESSION_COOKIE, sid, cookieOpts);
		event.cookies.set(TOKEN_COOKIE, sealed, cookieOpts);

		throw redirect(303, '/dashboard');
	}
};
