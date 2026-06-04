import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { nowEpochMillis } from '$lib/datetime';
import type { WorkoutListQuery } from '$lib/workoutQuery';
import {
	detailCacheTtlMs,
	isDetailCacheFresh,
	type DetailCacheEnv
} from './detailCache';
import type { AnnualGoal } from '../analytics';
import { STANDARD_DISTANCES, type LeaderboardEntry } from '$lib/leaderboard';
import type { Annotation, Sport, Workout, WorkoutDetail } from '../types';

// Bump when the WorkoutDetail shape changes so stale cached rows are re-fetched.
// v3: strokes carry rawT/rawD for the raw inspector's as-logged interval values.
export const DETAIL_PAYLOAD_VERSION = 3;

/**
 * Best-effort D1 cache of fully-hydrated workout detail (including strokes), so
 * replaying a workout a second time doesn't re-hit the Concept2 API. All calls
 * swallow errors: the cache is an optimisation, never a source of truth.
 */
export async function getCachedDetail(
	db: D1Database | undefined,
	userId: number,
	workoutId: number,
	env: DetailCacheEnv | undefined
): Promise<WorkoutDetail | null> {
	if (!db) return null;
	try {
		const row = await db
			.prepare(
				`SELECT payload, cached_at FROM workout_detail
				 WHERE user_id = ? AND workout_id = ? AND payload_version = ?`
			)
			.bind(userId, workoutId, DETAIL_PAYLOAD_VERSION)
			.first<{ payload: string; cached_at: number | null }>();
		if (!row) return null;
		const ttlMs = detailCacheTtlMs(env);
		if (!isDetailCacheFresh(row.cached_at, nowEpochMillis(), ttlMs)) return null;
		return JSON.parse(row.payload) as WorkoutDetail;
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
				`INSERT INTO workout_detail (user_id, workout_id, payload, cached_at, payload_version)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(user_id, workout_id)
				 DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at,
				              payload_version = excluded.payload_version`
			)
			.bind(userId, detail.id, JSON.stringify(detail), nowEpochMillis(), DETAIL_PAYLOAD_VERSION)
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
	timezone: string | null;
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
		timezone: r.timezone ?? undefined,
		hasStrokeData: r.has_stroke === 1
	};
}

const WORKOUT_SELECT = `SELECT workout_id, date, sport, distance, time, pace, stroke_rate, stroke_count,
			        heart_rate, hr_min, hr_max, calories, watt_minutes, drag_factor, workout_type,
			        comments, timezone, has_stroke`;

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
	const statements: D1PreparedStatement[] = [];
	const targets: number[] = [];
	for (const target of STANDARD_DISTANCES) {
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
		statements.push(db.prepare(sql).bind(...binds));
		targets.push(target);
	}
	if (statements.length) {
		const results = await db.batch(statements);
		for (let i = 0; i < results.length; i++) {
			const row = results[i]?.results?.[0] as { workout_id: number } | undefined;
			if (row) ids.add(row.workout_id);
		}
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
		const nominal = Number(q.distanceBandKey.replace(/\D/g, ''));
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

	const paceExpr = q.dir === 'asc'
		? 'CASE WHEN pace > 0 THEN pace ELSE 999999 END'
		: 'CASE WHEN pace > 0 THEN pace ELSE -1 END';

	const sortExpr: Record<WorkoutListQuery['sort'], string> = {
		date: 'date',
		distance: 'distance',
		time: 'time',
		pace: paceExpr,
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
		        drag_factor, workout_type, comments, timezone, has_stroke)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, workout_id) DO UPDATE SET
		   date=excluded.date, sport=excluded.sport, distance=excluded.distance,
		   time=excluded.time, pace=excluded.pace, stroke_rate=excluded.stroke_rate,
		   stroke_count=excluded.stroke_count, heart_rate=excluded.heart_rate,
		   hr_min=excluded.hr_min, hr_max=excluded.hr_max, calories=excluded.calories,
		   watt_minutes=excluded.watt_minutes, drag_factor=excluded.drag_factor,
		   workout_type=excluded.workout_type, comments=excluded.comments,
		   timezone=excluded.timezone, has_stroke=excluded.has_stroke`
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
			w.timezone ?? null,
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
			     ROW_NUMBER() OVER (PARTITION BY sport, target_distance ORDER BY pace ASC) AS rn
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

/**
 * Purge a user's *private* cached logbook data (workouts, detail cache, sync
 * cursor). Deliberately leaves `leaderboard_entry` untouched: published standings
 * are governed solely by the explicit publish/withdraw controls, so logging out or
 * disconnecting a session must not silently retract them. Use this on logout.
 */
export async function purgePrivateCache(db: D1Database, userId: number): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM workouts WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM workout_detail WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM sync_state WHERE user_id = ?').bind(userId)
	]);
}

/**
 * Remove *all* of a user's data, including published leaderboard entries. This is
 * the account-deletion path — for plain logout/disconnect use `purgePrivateCache`,
 * which preserves the athlete's opt-in standings.
 */
export async function deleteUserData(db: D1Database, userId: number): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM workouts WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM workout_detail WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM sync_state WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM leaderboard_entry WHERE user_id = ?').bind(userId)
	]);
}

/** Whether the user has a published leaderboard entry for this specific workout. */
export async function isWorkoutPublished(
	db: D1Database | undefined,
	userId: number,
	workoutId: number
): Promise<boolean> {
	if (!db) return false;
	try {
		const row = await db
			.prepare('SELECT 1 FROM leaderboard_entry WHERE user_id = ? AND workout_id = ? LIMIT 1')
			.bind(userId, workoutId)
			.first();
		return row != null;
	} catch {
		return false;
	}
}

export async function getUserAnnualGoal(
	db: D1Database | undefined,
	userId: number,
	year: number
): Promise<AnnualGoal | null> {
	if (!db) return null;
	try {
		const row = await db
			.prepare('SELECT kind, target FROM user_goals WHERE user_id = ? AND year = ?')
			.bind(userId, year)
			.first<{ kind: string; target: number }>();
		if (!row || (row.kind !== 'meters' && row.kind !== 'hours')) return null;
		return { year, kind: row.kind, target: row.target };
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Public replay shares — capability tokens on cached detail only.
// ---------------------------------------------------------------------------

/**
 * Assign a share token only if one is not already set. Returns true when this
 * call is the one that set it; false means a token already existed (e.g. a
 * concurrent share won the race) and the caller should re-read the live value.
 */
export async function setShareToken(
	db: D1Database,
	userId: number,
	workoutId: number,
	token: string
): Promise<boolean> {
	const res = await db
		.prepare(
			`UPDATE workout_detail SET share_token = ?
			 WHERE user_id = ? AND workout_id = ? AND share_token IS NULL`
		)
		.bind(token, userId, workoutId)
		.run();
	return (res.meta.changes ?? 0) > 0;
}

/** Remove a public share link for a workout. */
export async function clearShareToken(
	db: D1Database,
	userId: number,
	workoutId: number
): Promise<void> {
	await db
		.prepare(
			`UPDATE workout_detail SET share_token = NULL
			 WHERE user_id = ? AND workout_id = ?`
		)
		.bind(userId, workoutId)
		.run();
}

/**
 * Read-only lookup by share token — no user id in the query path.
 * Intentionally skips both the TTL and the `payload_version` check: an
 * anonymous reader cannot re-hydrate from Concept2, so a version filter would
 * permanently 404 a shared link after a (rare, deliberate) schema bump until
 * the owner happens to re-open that workout. We prefer serving the last-cached
 * snapshot; the owner re-opening refreshes the shared payload for later reads.
 */
export async function getCachedDetailByShareToken(
	db: D1Database | undefined,
	token: string
): Promise<WorkoutDetail | null> {
	if (!db || !token) return null;
	try {
		const row = await db
			.prepare('SELECT payload FROM workout_detail WHERE share_token = ?')
			.bind(token)
			.first<{ payload: string }>();
		return row ? (JSON.parse(row.payload) as WorkoutDetail) : null;
	} catch {
		return null;
	}
}

export async function setUserAnnualGoal(
	db: D1Database,
	userId: number,
	goal: AnnualGoal
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO user_goals (user_id, year, kind, target, updated_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, year) DO UPDATE SET
			   kind=excluded.kind, target=excluded.target, updated_at=excluded.updated_at`
		)
		.bind(userId, goal.year, goal.kind, goal.target, nowEpochMillis())
		.run();
}

/** Existing share token for a workout, if any. */
export async function getShareToken(
	db: D1Database | undefined,
	userId: number,
	workoutId: number
): Promise<string | null> {
	if (!db) return null;
	try {
		const row = await db
			.prepare('SELECT share_token FROM workout_detail WHERE user_id = ? AND workout_id = ?')
			.bind(userId, workoutId)
			.first<{ share_token: string | null }>();
		return row?.share_token ?? null;
	} catch {
		return null;
	}
}

/** A leaderboard row plus its owning user id (kept server-side only). */
export interface LeaderboardRow extends LeaderboardEntry {
	userId: number;
}

/**
 * Publish (or update) one athlete's entry on a board, keeping only their faster
 * result. Best-effort: the leaderboard is a feature, never a source of truth.
 */
export async function upsertLeaderboardEntry(
	db: D1Database | undefined,
	row: LeaderboardRow
): Promise<void> {
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO leaderboard_entry
				   (sport, distance, user_id, workout_id, display_name, time, pace, date, share_token, published_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(sport, distance, user_id) DO UPDATE SET
				   workout_id=excluded.workout_id,
				   display_name=excluded.display_name,
				   time=excluded.time,
				   pace=excluded.pace,
				   date=excluded.date,
				   share_token=excluded.share_token,
				   published_at=excluded.published_at
				 WHERE excluded.time < leaderboard_entry.time`
			)
			.bind(
				row.sport,
				row.distance,
				row.userId,
				row.workoutId,
				row.displayName,
				row.time,
				row.pace,
				row.date,
				row.shareToken ?? null,
				nowEpochMillis()
			)
			.run();
	} catch (e) {
		console.error('upsertLeaderboardEntry failed:', (e as Error).message ?? e);
	}
}

/** Withdraw an athlete's entry from one (sport, distance) board. Best-effort. */
export async function deleteLeaderboardEntry(
	db: D1Database | undefined,
	userId: number,
	sport: Sport,
	distance: number
): Promise<void> {
	if (!db) return;
	try {
		await db
			.prepare(
				'DELETE FROM leaderboard_entry WHERE user_id = ? AND sport = ? AND distance = ?'
			)
			.bind(userId, sport, distance)
			.run();
	} catch (e) {
		console.error('deleteLeaderboardEntry failed:', (e as Error).message ?? e);
	}
}

/** All published leaderboard entries (every board). user_id is kept for `isYou`. */
export async function getLeaderboardEntries(
	db: D1Database | undefined
): Promise<LeaderboardRow[]> {
	if (!db) return [];
	try {
		const res = await db
			.prepare(
				// Cap each board at its top 100 results so a large table never
				// loads wholesale into the Worker on every /leaderboard render.
				`SELECT sport, distance, user_id, workout_id, display_name, time, pace, date, share_token
				 FROM (
				   SELECT sport, distance, user_id, workout_id, display_name, time, pace, date, share_token,
				          ROW_NUMBER() OVER (PARTITION BY sport, distance ORDER BY time ASC) AS rn
				   FROM leaderboard_entry
				 )
				 WHERE rn <= 100
				 ORDER BY sport, distance, time ASC`
			)
			.all<{
				sport: Sport;
				distance: number;
				user_id: number;
				workout_id: number;
				display_name: string;
				time: number;
				pace: number;
				date: string;
				share_token: string | null;
			}>();
		return (res.results ?? []).map((r) => ({
			sport: r.sport,
			distance: r.distance,
			userId: r.user_id,
			workoutId: r.workout_id,
			displayName: r.display_name,
			time: r.time,
			pace: r.pace,
			date: r.date,
			shareToken: r.share_token ?? undefined
		}));
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Coaching annotations — timestamped notes on workouts.
// ---------------------------------------------------------------------------

interface AnnotationRow {
	id: number;
	user_id: number;
	workout_id: number;
	timestamp: number;
	text: string;
	created_at: number;
}

function rowToAnnotation(r: AnnotationRow): Annotation {
	return {
		id: r.id,
		timestamp: r.timestamp,
		text: r.text,
		createdAt: r.created_at
	};
}

/** All annotations for a workout, ordered by timestamp. */
export async function getAnnotations(
	db: D1Database | undefined,
	userId: number,
	workoutId: number
): Promise<Annotation[]> {
	if (!db) return [];
	try {
		const res = await db
			.prepare(
				'SELECT id, user_id, workout_id, timestamp, text, created_at FROM annotations WHERE user_id = ? AND workout_id = ? ORDER BY timestamp ASC'
			)
			.bind(userId, workoutId)
			.all<AnnotationRow>();
		return (res.results ?? []).map(rowToAnnotation);
	} catch {
		return [];
	}
}

/**
 * Load annotations for a workout via its share token — for public /r/<token>
 * pages where the viewer is unauthenticated. Resolves the owner's user_id
 * by joining through workout_detail.share_token.
 */
export async function getAnnotationsByShareToken(
	db: D1Database | undefined,
	token: string,
	workoutId: number
): Promise<Annotation[]> {
	if (!db) return [];
	try {
		const res = await db
			.prepare(
				`SELECT a.id, a.user_id, a.workout_id, a.timestamp, a.text, a.created_at
				 FROM annotations a
				 JOIN workout_detail w ON w.user_id = a.user_id AND w.workout_id = a.workout_id
				 WHERE w.share_token = ? AND a.workout_id = ?
				 ORDER BY a.timestamp ASC`
			)
			.bind(token, workoutId)
			.all<AnnotationRow>();
		return (res.results ?? []).map(rowToAnnotation);
	} catch {
		return [];
	}
}

/** Upsert an annotation (id === 0 for insert-only; id > 0 for update). */
export async function putAnnotation(
	db: D1Database | undefined,
	userId: number,
	workoutId: number,
	annotation: { id: number; timestamp: number; text: string }
): Promise<Annotation> {
	if (!db) throw new Error('Database not available.');
	const now = nowEpochMillis();
	if (annotation.id > 0) {
		// RETURNING created_at gives us the real stored value (UPDATE leaves
		// created_at untouched) instead of the current time, and a null result
		// means no row matched — the id doesn't exist or isn't this user's note,
		// which we surface rather than returning a phantom "updated" annotation.
		const row = await db
			.prepare(
				'UPDATE annotations SET timestamp = ?, text = ? WHERE id = ? AND user_id = ? AND workout_id = ? RETURNING created_at'
			)
			.bind(annotation.timestamp, annotation.text, annotation.id, userId, workoutId)
			.first<{ created_at: number }>();
		if (!row) {
			throw new Error('Annotation not found or unauthorized.');
		}
		return {
			id: annotation.id,
			timestamp: annotation.timestamp,
			text: annotation.text,
			createdAt: row.created_at
		};
	}
	const res = await db
		.prepare(
			'INSERT INTO annotations (user_id, workout_id, timestamp, text, created_at) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(userId, workoutId, annotation.timestamp, annotation.text, now)
		.run();
	return { id: res.meta.last_row_id ?? 0, timestamp: annotation.timestamp, text: annotation.text, createdAt: now };
}

/** Delete an annotation by id. */
export async function deleteAnnotation(
	db: D1Database | undefined,
	userId: number,
	workoutId: number,
	annotationId: number
): Promise<void> {
	if (!db) return;
	try {
		await db
			.prepare('DELETE FROM annotations WHERE id = ? AND user_id = ? AND workout_id = ?')
			.bind(annotationId, userId, workoutId)
			.run();
	} catch (e) {
		// A failed delete is a real error (unlike the read paths, which degrade to
		// []); log for Workers observability and propagate so the caller surfaces it
		// instead of reporting a phantom success.
		console.error('[db] deleteAnnotation failed:', e);
		throw e;
	}
}
