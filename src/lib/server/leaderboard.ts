import { error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import {
  buildBoards,
  findBoard,
  matchStandardDistance,
  type Board,
  type LeaderboardEntry,
} from "$lib/leaderboard";
import { mockLeaderboard } from "$lib/mockLeaderboard";
import { mockWorkouts } from "$lib/mockData";
import { deleteLeaderboardEntry, getLeaderboardEntries, upsertLeaderboardEntry } from "./db";
import { loadWorkouts } from "./data";
import { createWorkoutShare } from "./share";
import { createLogger } from "./logger";
const logger = createLogger(console);

/**
 * Server-side leaderboard layer. Reads build public boards (demo seed or D1);
 * publish reuses the existing share infra to guarantee a public replay token
 * before recording the athlete's best result on the matching standard board.
 */

/** Public-facing display name for an athlete (never an email or raw id). */
function displayNameFor(event: RequestEvent): string {
  const u = event.locals.user;
  return u?.firstName || u?.username || `Athlete ${u?.id ?? ""}`.trim();
}

/** All ranked boards, with the viewer's own rows flagged `isYou`. */
export async function loadBoards(event: RequestEvent): Promise<Board[]> {
  const db = event.platform?.env?.DB;
  if (event.locals.demo || !db) {
    // Deliberate policy: like the dashboard and replay, unauthenticated
    // visitors are in demo mode (set in hooks.server.ts) and see the
    // deterministic demo seed — boards are NOT a public read of real athlete
    // data. Real D1 standings are shown only once a session flips `demo` off.
    // (D1 stays bound on the Workers runtime, so we key off `demo`, not the
    // binding; `!db` is just the vite-dev/no-D1 fallback.) The seed's "You"
    // rows are intentional: demo mode presents the demo athlete as the viewer
    // throughout the app.
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
    isYou: me != null && r.userId === me,
  }));
  return buildBoards(entries);
}

export interface PublishResult {
  board: { sport: LeaderboardEntry["sport"]; distance: number };
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
  workoutId: number,
): Promise<PublishResult> {
  // Authenticate before touching any data loaders: a live (non-demo) caller
  // without a session must get a clean 401, not a crash inside loadWorkouts.
  if (!event.locals.demo && !event.locals.user) throw error(401, "Not authenticated.");

  // Resolve the workout summary (demo mock or the athlete's synced history).
  const workouts = event.locals.demo ? mockWorkouts() : await loadWorkouts(event);
  const workout = workouts.find((w) => w.id === workoutId);
  if (!workout) throw error(404, "Workout not found.");

  const distance = matchStandardDistance(workout.distance);
  if (distance == null) {
    throw error(422, "Only standard-distance pieces can be published to a board.");
  }

  if (event.locals.demo) {
    // The demo board already contains the athlete; just report their standing.
    const boards = buildBoards(mockLeaderboard());
    const board = findBoard(boards, workout.sport, distance);
    const rank = board?.entries.find((e) => e.isYou)?.rank ?? 1;
    return { board: { sport: workout.sport, distance }, rank };
  }

  const user = event.locals.user;
  if (!user) throw error(401, "Not authenticated.");
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
    shareToken: share.token,
  });

  const boards = await loadBoards(event);
  const board = findBoard(boards, workout.sport, distance);
  let rank = board?.entries.find((e) => e.isYou)?.rank;

  // loadBoards caps each board at its top 100, so an athlete ranked lower than
  // that won't appear in `entries`. Compute their exact standing directly
  // rather than falsely reporting rank 1. Ties share a rank (count of strictly
  // faster entries + 1), matching buildBoards, and we rank on their stored best
  // time (which the upsert just settled), not necessarily this workout's time.
  if (rank == null && db) {
    try {
      const row = await db
        .prepare(
          `SELECT COUNT(*) + 1 AS rank FROM leaderboard_entry
					 WHERE sport = ? AND distance = ? AND time < (
					   SELECT time FROM leaderboard_entry
					   WHERE sport = ? AND distance = ? AND user_id = ?
					 )`,
        )
        .bind(workout.sport, distance, workout.sport, distance, user.id)
        .first<{ rank: number }>();
      rank = row?.rank;
    } catch (e) {
      logger.error(
        "Failed to compute leaderboard rank:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return { board: { sport: workout.sport, distance }, rank: rank ?? 1 };
}

/**
 * Withdraw a previously published workout from its board — the symmetric,
 * reversible opt-out. Removes only the athlete's rowplay leaderboard entry; it
 * does NOT touch their Concept2 logbook. Demo mode is a no-op success.
 */
export async function withdrawWorkout(event: RequestEvent, workoutId: number): Promise<void> {
  if (!event.locals.demo && !event.locals.user) throw error(401, "Not authenticated.");
  if (event.locals.demo) return; // demo board is a fixed seed; nothing to remove

  const user = event.locals.user;
  if (!user) throw error(401, "Not authenticated.");

  const workouts = await loadWorkouts(event);
  const workout = workouts.find((w) => w.id === workoutId);
  if (!workout) throw error(404, "Workout not found.");

  const distance = matchStandardDistance(workout.distance);
  if (distance == null) return; // never could have been on a board

  await deleteLeaderboardEntry(event.platform?.env?.DB, user.id, workout.sport, distance);
}
