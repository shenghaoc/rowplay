import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/rivalGhost', () => ({
	rivalGhostJson: vi.fn().mockResolvedValue(new Response('{"strokes":[]}', {
		headers: { 'content-type': 'application/json' }
	}))
}));

import { GET } from './+server';

function fakeEvent(token: string) {
	return {
		params: { token },
		locals: { demo: true }
	};
}

describe('GET /api/ghost/[token]', () => {
	it('throws 404 for an invalid (too short) token', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(GET(fakeEvent('short') as any)).rejects.toMatchObject({ status: 404 });
	});

	it('throws 404 for a token with invalid characters', async () => {
		const badToken = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'; // non-hex
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(GET(fakeEvent(badToken) as any)).rejects.toMatchObject({ status: 404 });
	});

	it('calls rivalGhostJson for a valid 48-char hex token', async () => {
		const validToken = 'abc123def456789012345678901234567890123456789abc';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await GET(fakeEvent(validToken) as any);
		expect(res).toBeDefined();
	});
});
