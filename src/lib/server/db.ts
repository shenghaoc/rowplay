import type { D1Database } from '@cloudflare/workers-types';
import { nowEpochMillis } from '$lib/datetime';
import type { Sport, Workout, WorkoutDetail } from '../types';

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
			.bind(userId, detail.id, JSON.stringify(detail), nowEpochMillis())
			.run();
	} catch {
		// ignore cache write failures
	}
}

// ---------------------------------------------------------------------------
// Workout summaries — the D1-backed query layer over the user's full history.
// The Concept2 API is only hit during sync; reads (list, analytics) go to D1
// so they cover everything, not just the most recent API page.
// ---------------------------------------------------------------------------

interface WorkoutRow {
	workout_id: number;
	date: string;
	sport: string;
	distance: number;
	time: number;
	pace: number;
	stroke_rate: number | null;
	stroke_count: number | null;
	heart_rate: number | null;
	hr_min: number | null;
	hr_max: number | null;
	calories: number | null;
	watt_minutes: number | null;
	drag_factor: number | null;
	workout_type: string | null;
	comments: string | null;
	has_stroke: number;
}

function rowToWorkout(r: WorkoutRow): Workout {
	return {
		id: r.workout_id,
		date: r.date,
		sport: r.sport as Sport,
		distance: r.distance,
		time: r.time,
		pace: r.pace,
		strokeRate: r.stroke_rate ?? undefined,
		strokeCount: r.stroke_count ?? undefined,
		heartRateAvg: r.heart_rate ?? undefined,
		hrMin: r.hr_min ?? undefined,
		hrMax: r.hr_max ?? undefined,
		caloriesTotal: r.calories ?? undefined,
		wattMinutes: r.watt_minutes ?? undefined,
		dragFactor: r.drag_factor ?? undefined,
		workoutType: r.workout_type ?? undefined,
		comments: r.comments ?? undefined,
		hasStrokeData: r.has_stroke === 1
	};
}

/** All of a user's synced workouts, newest first. */
export async function getAllWorkouts(db: D1Database, userId: number): Promise<Workout[]> {
	const res = await db
		.prepare(
			`SELECT workout_id, date, sport, distance, time, pace, stroke_rate, stroke_count,
			        heart_rate, hr_min, hr_max, calories, watt_minutes, drag_factor, workout_type,
			        comments, has_stroke
			 FROM workouts WHERE user_id = ? ORDER BY date DESC`
		)
		.bind(userId)
		.all<WorkoutRow>();
	return (res.results ?? []).map(rowToWorkout);
}

export interface SyncState {
	lastDate: string | null;
	lastSyncAt: number;
	total: number;
}

export async function getSyncState(
	db: D1Database | undefined,
	userId: number
): Promise<SyncState | null> {
	if (!db) return null;
	try {
		const row = await db
			.prepare('SELECT last_date, last_sync_at, total FROM sync_state WHERE user_id = ?')
			.bind(userId)
			.first<{ last_date: string | null; last_sync_at: number; total: number }>();
		return row ? { lastDate: row.last_date, lastSyncAt: row.last_sync_at, total: row.total } : null;
	} catch {
		return null;
	}
}

/** Upsert a batch of workout summaries. Chunked to stay within D1 limits. */
export async function upsertWorkouts(
	db: D1Database,
	userId: number,
	workouts: Workout[]
): Promise<void> {
	const stmt = db.prepare(
		`INSERT INTO workouts (user_id, workout_id, date, sport, distance, time, pace,
		        stroke_rate, stroke_count, heart_rate, hr_min, hr_max, calories, watt_minutes,
		        drag_factor, workout_type, comments, has_stroke)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, workout_id) DO UPDATE SET
		   date=excluded.date, sport=excluded.sport, distance=excluded.distance,
		   time=excluded.time, pace=excluded.pace, stroke_rate=excluded.stroke_rate,
		   stroke_count=excluded.stroke_count, heart_rate=excluded.heart_rate,
		   hr_min=excluded.hr_min, hr_max=excluded.hr_max, calories=excluded.calories,
		   watt_minutes=excluded.watt_minutes, drag_factor=excluded.drag_factor,
		   workout_type=excluded.workout_type, comments=excluded.comments,
		   has_stroke=excluded.has_stroke`
	);
	const batch = workouts.map((w) =>
		stmt.bind(
			userId,
			w.id,
			w.date,
			w.sport,
			w.distance,
			w.time,
			w.pace,
			w.strokeRate ?? null,
			w.strokeCount ?? null,
			w.heartRateAvg ?? null,
			w.hrMin ?? null,
			w.hrMax ?? null,
			w.caloriesTotal ?? null,
			w.wattMinutes ?? null,
			w.dragFactor ?? null,
			w.workoutType ?? null,
			w.comments ?? null,
			w.hasStrokeData ? 1 : 0
		)
	);
	// D1 batch caps at 100 statements; chunk to be safe.
	for (let i = 0; i < batch.length; i += 100) {
		await db.batch(batch.slice(i, i + 100));
	}
}

export async function setSyncState(
	db: D1Database,
	userId: number,
	lastDate: string | null,
	total: number
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO sync_state (user_id, last_date, last_sync_at, total)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET
			   last_date=excluded.last_date, last_sync_at=excluded.last_sync_at, total=excluded.total`
		)
		.bind(userId, lastDate, nowEpochMillis(), total)
		.run();
}

export async function countWorkouts(db: D1Database, userId: number): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) AS n FROM workouts WHERE user_id = ?')
		.bind(userId)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Dashboard aggregates — push totals / PBs / per-sport into D1 so the client
// derives them from a handful of rows instead of iterating thousands.
// ---------------------------------------------------------------------------

interface SportAggRow {
	sport: string;
	sessions: number;
	total_distance: number;
	total_time: number;
	avg_pace: number;
	best_pace: number | null;
	longest: number;
}

export async function getSportAggregates(db: D1Database, userId: number): Promise<SportAggRow[]> {
	const res = await db
		.prepare(
			`SELECT sport,
			        COUNT(*) AS sessions,
			        SUM(distance) AS total_distance,
			        SUM(time) AS total_time,
			        CASE WHEN SUM(distance) > 0 THEN SUM(time) * 500.0 / SUM(distance) ELSE 0 END AS avg_pace,
			        MIN(CASE WHEN pace > 0 THEN pace END) AS best_pace,
			        MAX(distance) AS longest
			 FROM workouts WHERE user_id = ?
			 GROUP BY sport
			 ORDER BY total_distance DESC`
		)
		.bind(userId)
		.all<SportAggRow>();
	return res.results ?? [];
}

interface PBRow {
	sport: string;
	target_distance: number;
	best_time: number;
	pace: number;
	date: string;
}

export async function getPersonalBests(db: D1Database, userId: number): Promise<PBRow[]> {
	const res = await db
		.prepare(
			`SELECT sport, target_distance, time AS best_time, pace, date
			 FROM (
			   SELECT sport, time, pace, date, target_distance,
			     ROW_NUMBER() OVER (PARTITION BY sport, target_distance ORDER BY time ASC) AS rn
			   FROM (
			     SELECT sport, time, pace, date,
			       CASE
			         WHEN ABS(distance - 500) <= 10 THEN 500
			         WHEN ABS(distance - 1000) <= 20 THEN 1000
			         WHEN ABS(distance - 2000) <= 40 THEN 2000
			         WHEN ABS(distance - 5000) <= 100 THEN 5000
			         WHEN ABS(distance - 6000) <= 120 THEN 6000
			         WHEN ABS(distance - 10000) <= 200 THEN 10000
			         WHEN ABS(distance - 21097) <= 421.94 THEN 21097
			       END AS target_distance
			     FROM workouts WHERE user_id = ? AND time > 0
			   )
			   WHERE target_distance IS NOT NULL
			 )
			 WHERE rn = 1`
		)
		.bind(userId)
		.all<PBRow>();
	return res.results ?? [];
}
