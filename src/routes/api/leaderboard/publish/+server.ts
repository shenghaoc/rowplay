import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Leaderboard feature removed — no persistent storage. */
export const POST: RequestHandler = async () => {
  throw error(410, "Leaderboard is no longer available.");
};

export const DELETE: RequestHandler = async () => {
  throw error(410, "Leaderboard is no longer available.");
};
