import { describe, expect, it, vi } from 'vitest';

// withdrawWorkout reads the athlete's workouts via the data layer; stub it so the
// test exercises only the withdraw logic and its DELETE against a fake D1.
vi.mock('./data', () => ({ loadWorkouts: vi.fn() }));

import { withdrawWorkout } from './leaderboard';
import { loadWorkouts } from './data';

/** Fake D1 that records the SQL + bound args of every executed statement. */
function fakeDb() {
	const runs: { sql: string; args: unknown[] }[] = [];
	const prepare = (sql: string) => {
		let bound: unknown[] = [];
		const stmt = {
			bind: (...args: unknown[]) => {
				bound = args;
				return stmt;
			},
			run: async () => {
				runs.push({ sql, args: bound });
				return {};
			}
		};
		return stmt;
	};
	return { runs, db: { prepare } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventWith(db: unknown, workouts: unknown[], opts?: { demo?: boolean; user?: any }): any {
	(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(workouts);
	const user = opts && 'user' in opts ? opts.user : { id: 7 };
	return {
		locals: { demo: opts?.demo ?? false, user },
		platform: { env: { DB: db } }
	};
}

describe('withdrawWorkout', () => {
	it("removes the athlete's entry from the matching board", async () => {
		const { db, runs } = fakeDb();
		const event = eventWith(db, [
			{ id: 1001, sport: 'RowErg', distance: 2000, pace: 120, time: 480 }
		]);
		await withdrawWorkout(event, 1001);
		expect(runs).toHaveLength(1);
		expect(runs[0].sql).toMatch(/DELETE FROM leaderboard_entry/);
		expect(runs[0].args).toEqual([7, 'RowErg', 2000]);
	});

	it('is a no-op for an off-board (non-standard) distance', async () => {
		const { db, runs } = fakeDb();
		const event = eventWith(db, [
			{ id: 1002, sport: 'RowErg', distance: 1234, pace: 120, time: 480 }
		]);
		await withdrawWorkout(event, 1002);
		expect(runs).toHaveLength(0);
	});

	it('is a no-op success in demo mode', async () => {
		const { db, runs } = fakeDb();
		const event = eventWith(db, [], { demo: true, user: null });
		await expect(withdrawWorkout(event, 1001)).resolves.toBeUndefined();
		expect(runs).toHaveLength(0);
	});

	it('rejects an unauthenticated (non-demo) caller', async () => {
		const { db } = fakeDb();
		const event = eventWith(db, [], { demo: false, user: null });
		await expect(withdrawWorkout(event, 1001)).rejects.toMatchObject({ status: 401 });
	});

	it('404s when the workout is not in the athlete history', async () => {
		const { db } = fakeDb();
		const event = eventWith(db, [
			{ id: 9999, sport: 'RowErg', distance: 2000, pace: 120, time: 480 }
		]);
		await expect(withdrawWorkout(event, 1001)).rejects.toMatchObject({ status: 404 });
	});
});
