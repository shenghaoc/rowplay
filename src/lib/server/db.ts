import type { D1Database } from '@cloudflare/workers-types';
import type { WorkoutDetail } from '../types';

/**
 * Best-effort D1 cache of fully-hydrated workout detail (including strokes), so
 * replaying a workout a second time doesn't re-hit the Concept2 API. All calls
 * swallow errors: the cache is an optimisation, never a source of truth.
 */
export async function getCachedDetail(
	db: D1Database | undefined,
	userId: number,
	workoutId: number
): Promise<WorkoutDetail | null> {
	if (!db) return null;
	try {
		const row = await db
			.prepare('SELECT payload FROM workout_detail WHERE user_id = ? AND workout_id = ?')
			.bind(userId, workoutId)
			.first<{ payload: string }>();
		return row ? (JSON.parse(row.payload) as WorkoutDetail) : null;
	} catch {
		return null;
	}
}

export async function putCachedDetail(
	db: D1Database | undefined,
	userId: number,
	detail: WorkoutDetail
): Promise<void> {
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO workout_detail (user_id, workout_id, payload, cached_at)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT(user_id, workout_id)
				 DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at`
			)
			.bind(userId, detail.id, JSON.stringify(detail), Date.now())
			.run();
	} catch {
		// ignore cache write failures
	}
}
