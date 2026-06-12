import { error, isHttpError, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { syncWorkouts } from "$lib/server/data";

/** Incremental sync for live-mode polling — returns newly upserted workouts. */
export const POST: RequestHandler = async (event) => {
  if (event.locals.demo) {
    return json(
      { workouts: [], added: 0, total: 0, newPbs: [] },
      { headers: { "cache-control": "private, no-store" } },
    );
  }
  try {
    const result = await syncWorkouts(event, false);
    return json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    if (isHttpError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table|D1_ERROR/i.test(msg)) {
      throw error(503, "Workout storage isn’t set up yet — apply the D1 migrations and try again.");
    }
    throw error(502, `Poll failed: ${msg}`);
  }
};
