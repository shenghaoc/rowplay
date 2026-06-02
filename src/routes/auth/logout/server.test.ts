import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';
import { SESSION_COOKIE, TOKEN_COOKIE } from '$lib/server/session';

/** Minimal D1 stub: records whether a batch (the delete) ran. */
function fakeDb() {
	const calls = { batch: 0 };
	const stmt = { bind: () => stmt, run: async () => ({}) };
	return {
		calls,
		db: {
			prepare: () => stmt,
			batch: async () => {
				calls.batch++;
				return [];
			}
		}
	};
}

function fakeEvent(opts: { personal: boolean; user: { id: number } | null }) {
	const deleted: string[] = [];
	const { db, calls } = fakeDb();
	const event = {
		cookies: {
			get: () => 'sid-123',
			delete: (name: string) => deleted.push(name)
		},
		locals: { personal: opts.personal, user: opts.user },
		platform: { env: { SESSIONS: { delete: async () => {} }, DB: db } }
	};
	// SvelteKit's redirect() throws; swallow it so we can assert side effects.
	return { event, deleted, calls };
}

async function runLogout(event: unknown) {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await POST({ ...(event as any) });
	} catch (e) {
		// redirect throw — status 303 to '/'
		expect((e as { status?: number }).status).toBe(303);
	}
}

describe('logout', () => {
	it('purges the D1 cache for a personal (BYOT) session', async () => {
		const { event, deleted, calls } = fakeEvent({ personal: true, user: { id: 42 } });
		await runLogout(event);
		expect(calls.batch).toBe(1); // deleteUserData ran
		expect(deleted).toContain(SESSION_COOKIE);
		expect(deleted).toContain(TOKEN_COOKIE);
	});

	it('does not purge the cache for a non-personal (OAuth) session', async () => {
		const { event, deleted, calls } = fakeEvent({ personal: false, user: { id: 42 } });
		await runLogout(event);
		expect(calls.batch).toBe(0); // cache preserved
		expect(deleted).toContain(SESSION_COOKIE);
		expect(deleted).toContain(TOKEN_COOKIE);
	});
});
