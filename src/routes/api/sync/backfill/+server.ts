import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Backfill feature removed — no persistent storage. */
export const POST: RequestHandler = async () => {
  throw error(410, "Backfill is no longer available.");
};
