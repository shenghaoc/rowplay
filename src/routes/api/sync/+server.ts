import { withJsonContentLength } from "#lib/server/jsonResponse.ts";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Sync feature removed — workouts are fetched live from the Concept2 API. */
export const POST: RequestHandler = async () => {
  throw error(410, "Sync is no longer available. Workouts are fetched live from the Concept2 API.");
};

export const GET: RequestHandler = async () => {
  return withJsonContentLength(
    Response.json({ lastSyncAt: null, total: 0, backfillDone: true, inProgress: false }),
  );
};
