import type { D1Database } from '@cloudflare/workers-types';
import { nowEpochMillis } from '$lib/datetime';
import type { WorkoutListQuery } from '$lib/workoutQuery';
import type { Sport, Workout, WorkoutDetail } from '../types';

const STANDARD_PB_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097];

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

const WORKOUT_SELECT = `SELECT workout_id, date, sport, distance, time, pace, stroke_rate, stroke_count,
			        heart_rate, hr_min, hr_max, calories, watt_minutes, drag_factor, workout_type,
			        comments, has_stroke`;

/** All of a user's synced workouts, newest first. */
export async function getAllWorkouts(db: D1Database, userId: number): Promise<Workout[]> {
	const res = await db
		.prepare(`${WORKOUT_SELECT} FROM workouts WHERE user_id = ? ORDER BY date DESC`)
		.bind(userId)
		.all<WorkoutRow>();
	return (res.results ?? []).map(rowToWorkout);
}

/** Workout ids that hold a standard-distance PB (±2%), one best per distance. */
export async function getPbWorkoutIds(
	db: D1Database,
	userId: number,
	sport?: Sport
): Promise<Set<number>> {
	const ids = new Set<number>();
	for (const target of STANDARD_PB_DISTANCES) {
		const tol = target * 0.02;
		let sql = `SELECT workout_id FROM workouts
			WHERE user_id = ? AND distance BETWEEN ? AND ? AND time > 0`;
		const binds: (number | string)[] = [userId, target - tol, target + tol];
		if (sport) {
			sql += ' AND sport = ?';
			binds.push(sport);
		}
		sql += ` AND time = (
			SELECT MIN(time) FROM workouts
			WHERE user_id = ? AND distance BETWEEN ? AND ? AND time > 0`;
		binds.push(userId, target - tol, target + tol);
		if (sport) {
			sql += ' AND sport = ?';
			binds.push(sport);
		}
		sql += ') LIMIT 1';
		const row = await db.prepare(sql).bind(...binds).first<{ workout_id: number }>();
		if (row) ids.add(row.workout_id);
	}
	return ids;
}

/**
 * Filtered + sorted workout list in D1 (scales to large logbooks).
 * `pbIds` should be precomputed when `pbsOnly` is set.
 */
export async function queryWorkouts(
	db: D1Database,
	userId: number,
	q: WorkoutListQuery,
	pbIds?: Set<number>
): Promise<Workout[]> {
	const conditions: string[] = ['user_id = ?'];
	const binds: (number | string)[] = [userId];

	if (q.sport) {
		conditions.push('sport = ?');
		binds.push(q.sport);
	}
	if (q.workoutType) {
		conditions.push('workout_type = ?');
		binds.push(q.workoutType);
	}
	if (q.dateFrom) {
		conditions.push('date >= ?');
		binds.push(`${q.dateFrom} 00:00:00`);
	}
	if (q.dateTo) {
		conditions.push('date <= ?');
		binds.push(`${q.dateTo} 23:59:59`);
	}
	if (q.distanceM != null) {
		const tol = q.distanceM * 0.02;
		conditions.push('distance BETWEEN ? AND ?');
		binds.push(q.distanceM - tol, q.distanceM + tol);
	} else if (q.distanceBandKey) {
		const nominal = Number(q.distanceBandKey);
		if (Number.isFinite(nominal) && nominal > 0) {
			const tol = nominal * 0.06;
			conditions.push('distance BETWEEN ? AND ?');
			binds.push(nominal - tol, nominal + tol);
		}
	}
	if (q.hasStroke === true) conditions.push('has_stroke = 1');
	else if (q.hasStroke === false) conditions.push('has_stroke = 0');
	if (q.q) {
		conditions.push('LOWER(comments) LIKE ?');
		binds.push(`%${q.q.toLowerCase()}%`);
	}
	if (q.durationMin != null) {
		conditions.push('time >= ?');
		binds.push(q.durationMin);
	}
	if (q.durationMax != null) {
		conditions.push('time <= ?');
		binds.push(q.durationMax);
	}
	if (q.pbsOnly) {
		if (!pbIds?.size) return [];
		const placeholders = [...pbIds].map(() => '?').join(',');
		conditions.push(`workout_id IN (${placeholders})`);
		binds.push(...pbIds);
	}

	const sortExpr: Record<WorkoutListQuery['sort'], string> = {
		date: 'date',
		distance: 'distance',
		time: 'time',
		pace: 'pace',
		power: 'CASE WHEN time > 0 AND watt_minutes IS NOT NULL THEN watt_minutes * 60.0 / time ELSE 0 END'
	};
	const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
	const sql = `${WORKOUT_SELECT} FROM workouts WHERE ${conditions.join(' AND ')} ORDER BY ${sortExpr[q.sort]} ${dir}`;

	const res = await db.prepare(sql).bind(...binds).all<WorkoutRow>();
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
