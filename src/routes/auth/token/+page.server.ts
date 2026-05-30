import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig, requireSessions } from '$lib/server/config';
import { getValue } from '$lib/i18n';
import { fetchMe } from '$lib/server/concept2';
import {
	newSessionId,
	SESSION_COOKIE,
	writeSession,
	type SessionUser
} from '$lib/server/session';

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

		// Validate by fetching the owner; a bad token is rejected here. Note: the
		// redirect below must stay OUTSIDE this try — redirect() throws, and a
		// catch would swallow it.
		let user: SessionUser;
		try {
			user = await fetchMe(cfg, token);
		} catch {
			return fail(400, { error: tr('token.rejected') });
		}

		const sid = newSessionId();
		await writeSession(kv, sid, {
			user,
			personal: true,
			tokens: { accessToken: token, refreshToken: '', expiresAt: Date.now() + YEAR_MS, scope: '' }
		});
		event.cookies.set(SESSION_COOKIE, sid, {
			path: '/',
			httpOnly: true,
			secure: cfg.appUrl.startsWith('https'),
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});

		throw redirect(303, '/dashboard');
	}
};
