import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/config', () => ({
	getConfig: vi.fn()
}));
vi.mock('$lib/server/concept2', () => ({
	buildAuthorizeUrl: vi.fn().mockReturnValue('https://log.concept2.com/oauth/authorize?state=test')
}));

import { GET } from './+server';
import { getConfig } from '$lib/server/config';

function fakeEvent() {
	const set: Record<string, string> = {};
	return {
		event: {
			cookies: { set: (name: string, val: string) => { set[name] = val; } },
			url: new URL('http://localhost/auth/login')
		},
		cookiesSet: set
	};
}

describe('GET /auth/login', () => {
	it('redirects to dashboard in demo mode (no clientId)', async () => {
		(getConfig as ReturnType<typeof vi.fn>).mockReturnValue({ clientId: null });
		const { event } = fakeEvent();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = GET(event as any);
		await expect(p).rejects.toMatchObject({ status: 303, location: '/dashboard' });
	});

	it('redirects to OAuth authorize URL when clientId is set', async () => {
		(getConfig as ReturnType<typeof vi.fn>).mockReturnValue({ clientId: 'myClientId' });
		const { event } = fakeEvent();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = GET(event as any);
		await expect(p).rejects.toMatchObject({ status: 302 });
	});
});
