import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';
import { SESSION_COOKIE, TOKEN_COOKIE } from '$lib/server/session';

/** Minimal D1 stub: records batch runs and the SQL of every prepared statement. */
function fakeDb() {
	const calls = { batch: 0 };
	const prepared: string[] = [];
	const stmt = { bind: () => stmt, run: async () => ({}) };
	return {
		calls,
		prepared,
		db: {
			prepare: (sql: string) => {
				prepared.push(sql);
				return stmt;
			},
			batch: async () => {
				calls.batch++;
				return [];
			}
		}
	};
}

function fakeEvent(opts: { personal: boolean; user: { id: number } | null }) {
	const deleted: string[] = [];
	const { db, calls, prepared } = fakeDb();
	const event = {
		cookies: {
			get: () => 'sid-123',
			delete: (name: string) => deleted.push(name)
		},
		locals: { personal: opts.personal, user: opts.user },
		platform: { env: { SESSIONS: { delete: async () => {} }, DB: db } }
	};
	// SvelteKit's redirect() throws; swallow it so we can assert side effects.
	return { event, deleted, calls, prepared };
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
	it('purges the private D1 cache but preserves leaderboard entries on personal logout', async () => {
		const { event, deleted, calls, prepared } = fakeEvent({ personal: true, user: { id: 42 } });
		await runLogout(event);
		expect(calls.batch).toBe(1); // purgePrivateCache ran
		// Private cache is cleared...
		expect(prepared).toContain('DELETE FROM workouts WHERE user_id = ?');
		expect(prepared).toContain('DELETE FROM workout_detail WHERE user_id = ?');
		expect(prepared).toContain('DELETE FROM sync_state WHERE user_id = ?');
		// ...but published standings are NOT retracted by a logout.
		expect(prepared.some((sql) => sql.includes('leaderboard_entry'))).toBe(false);
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
