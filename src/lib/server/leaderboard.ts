import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	buildBoards,
	findBoard,
	matchStandardDistance,
	type Board,
	type LeaderboardEntry
} from '$lib/leaderboard';
import { mockLeaderboard } from '$lib/mockLeaderboard';
import { mockWorkouts } from '$lib/mockData';
import { getLeaderboardEntries, upsertLeaderboardEntry } from './db';
import { loadWorkouts } from './data';
import { createWorkoutShare } from './share';

/**
 * Server-side leaderboard layer. Reads build public boards (demo seed or D1);
 * publish reuses the existing share infra to guarantee a public replay token
 * before recording the athlete's best result on the matching standard board.
 */

/** Public-facing display name for an athlete (never an email or raw id). */
function displayNameFor(event: RequestEvent): string {
	const u = event.locals.user;
	return u?.firstName || u?.username || `Athlete ${u?.id ?? ''}`.trim();
}

/** All ranked boards, with the viewer's own rows flagged `isYou`. */
export async function loadBoards(event: RequestEvent): Promise<Board[]> {
	const db = event.platform?.env?.DB;
	if (!db) {
		// No D1 binding available (dev mode or no backend configured) —
		// fall back to the deterministic demo seed.
		return buildBoards(mockLeaderboard());
	}
	const rows = await getLeaderboardEntries(db);
	const me = event.locals.user?.id;
	const entries: LeaderboardEntry[] = rows.map((r) => ({
		sport: r.sport,
		distance: r.distance,
		displayName: r.displayName,
		time: r.time,
		pace: r.pace,
		date: r.date,
		workoutId: r.workoutId,
		shareToken: r.shareToken,
		isYou: me != null && r.userId === me
	}));
	return buildBoards(entries);
}

export interface PublishResult {
	board: { sport: LeaderboardEntry['sport']; distance: number };
	rank: number;
}

/**
 * Publish one of the athlete's workouts onto its standard board. Ensures the
 * workout has a public share token (reusing createWorkoutShare), then UPSERTs
 * the entry keeping the faster time. Rejects non-standard distances (422) and
 * unauthenticated live callers (401).
 */
export async function publishWorkout(
	event: RequestEvent,
	workoutId: number
): Promise<PublishResult> {
	// Resolve the workout summary (demo mock or the athlete's synced history).
	const workouts = event.locals.demo ? mockWorkouts() : await loadWorkouts(event);
	const workout = workouts.find((w) => w.id === workoutId);
	if (!workout) throw error(404, 'Workout not found.');

	const distance = matchStandardDistance(workout.distance);
	if (distance == null) {
		throw error(422, 'Only standard-distance pieces can be published to a board.');
	}

	if (event.locals.demo) {
		// The demo board already contains the athlete; just report their standing.
		const boards = buildBoards(mockLeaderboard());
		const board = findBoard(boards, workout.sport, distance);
		const rank = board?.entries.find((e) => e.isYou)?.rank ?? 1;
		return { board: { sport: workout.sport, distance }, rank };
	}

	const user = event.locals.user;
	if (!user) throw error(401, 'Not authenticated.');
	const db = event.platform?.env?.DB;

	// Guarantee a public replay link via the existing share infrastructure.
	const share = await createWorkoutShare(event, workoutId);

	await upsertLeaderboardEntry(db, {
		sport: workout.sport,
		distance,
		userId: user.id,
		workoutId,
		displayName: displayNameFor(event),
		time: workout.time,
		pace: workout.pace,
		date: workout.date,
		shareToken: share.token
	});

	const boards = await loadBoards(event);
	const board = findBoard(boards, workout.sport, distance);
	const rank = board?.entries.find((e) => e.isYou)?.rank ?? 1;
	return { board: { sport: workout.sport, distance }, rank };
}
