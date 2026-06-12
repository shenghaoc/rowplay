import type { PageServerLoad } from "./$types";
import { loadBoards } from "$lib/server/leaderboard";

/**
 * Leaderboards page — renders for everyone (no auth redirect), but the data
 * follows the same demo-mode policy as the rest of the app rather than being a
 * capability-gated public page like /r/<token>: unauthenticated/demo visitors
 * see the deterministic demo seed, and authenticated users see real D1
 * standings with their own rows flagged. See loadBoards in
 * $lib/server/leaderboard.ts for the gate.
 */
export const load: PageServerLoad = async (event) => {
  // Prevent the service worker from caching leaderboard pages which may contain
  // the authenticated athlete's flagged rows.
  if (!event.locals.demo) {
    event.setHeaders({ "cache-control": "private, no-store" });
  }

  const boards = await loadBoards(event);
  return { boards, demo: event.locals.demo };
};
