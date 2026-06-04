import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/leaderboard', () => ({
	loadBoards: vi.fn().mockResolvedValue([
		{ sport: 'rower', distance: 2000, entries: [] },
		{ sport: 'rower', distance: 5000, entries: [] }
	])
}));

import { load } from './+page.server';

function fakeEvent(demo = true) {
	return {
		locals: { demo },
		platform: { env: { DB: {} } }
	};
}

describe('load /leaderboard', () => {
	it('returns boards and demo flag', async () => {
		const event = fakeEvent(true);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(Array.isArray(data.boards)).toBe(true);
		expect(data.demo).toBe(true);
	});

	it('works for authenticated users too', async () => {
		const event = fakeEvent(false);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await load(event as any) as any;
		expect(Array.isArray(data.boards)).toBe(true);
	});
});
