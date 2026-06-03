import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/config', () => ({
	getConfig: vi.fn().mockReturnValue({ clientId: null, appUrl: 'http://localhost' }),
	requireSessions: vi.fn().mockReturnValue({ put: vi.fn(), get: vi.fn() })
}));
vi.mock('$lib/server/concept2', () => ({
	fetchMe: vi.fn()
}));
vi.mock('$lib/server/session', () => ({
	newSessionId: vi.fn().mockReturnValue('new-sid'),
	writeSession: vi.fn().mockResolvedValue(undefined),
	SESSION_COOKIE: 'c2_session',
	TOKEN_COOKIE: 'c2_token'
}));
vi.mock('$lib/server/tokenCrypto', () => ({
	sealToken: vi.fn().mockResolvedValue('sealed-token')
}));
vi.mock('$lib/datetime', () => ({
	nowEpochMillis: vi.fn().mockReturnValue(1_000_000_000)
}));

import { actions, load } from './+page.server';
import { fetchMe } from '$lib/server/concept2';

function fakeLoadEvent(user?: { id: number; username: string } | null) {
	return {
		locals: { user: user ?? null },
		platform: { env: {} }
	};
}

function fakeActionEvent(opts: {
	token?: string;
	secret?: string;
}) {
	const formData = new FormData();
	if (opts.token !== undefined) formData.append('token', opts.token);

	const cookiesSet: Record<string, string> = {};
	return {
		event: {
			locals: { lang: 'en' },
			request: { formData: async () => formData },
			platform: { env: opts.secret ? { SESSION_SECRET: opts.secret } : {} },
			url: new URL('http://localhost/auth/token'),
			cookies: {
				set: (name: string, val: string) => { cookiesSet[name] = val; }
			}
		},
		cookiesSet
	};
}

describe('load /auth/token', () => {
	it('redirects to dashboard when already authenticated', async () => {
		const event = fakeLoadEvent({ id: 7, username: 'athlete' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load(event as any)).rejects.toMatchObject({ status: 303, location: '/dashboard' });
	});

	it('returns oauthEnabled:false when no clientId', async () => {
		const event = fakeLoadEvent(null);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any);
		expect(data.oauthEnabled).toBe(false);
	});
});

describe('actions /auth/token', () => {
	it('returns fail(400) when token is empty', async () => {
		const { event } = fakeActionEvent({ token: '   ' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.default(event as any);
		expect(result).toMatchObject({ status: 400 });
	});

	it('returns fail(500) when SESSION_SECRET is not set', async () => {
		const { event } = fakeActionEvent({ token: 'mytoken' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.default(event as any);
		expect(result).toMatchObject({ status: 500 });
	});

	it('returns fail(400) when token is rejected by Concept2', async () => {
		(fetchMe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('401 Unauthorized'));
		const { event } = fakeActionEvent({ token: 'badtoken', secret: 'mysecret' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.default(event as any);
		expect(result).toMatchObject({ status: 400 });
	});

	it('redirects to dashboard on successful token auth', async () => {
		(fetchMe as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 7, username: 'athlete' });
		const { event } = fakeActionEvent({ token: 'validtoken', secret: 'mysecret' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(actions.default(event as any)).rejects.toMatchObject({ status: 303, location: '/dashboard' });
	});
});
