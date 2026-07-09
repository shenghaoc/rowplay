import { error, isHttpError, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { syncWorkouts } from "$lib/server/data";

/** Live-mode polling — returns workouts from the Concept2 API. */
export const POST: RequestHandler = async (event) => {
  if (event.locals.demo) {
    return json(
      { workouts: [], added: 0, total: 0, newPbs: [] },
      { headers: { "cache-control": "private, no-store" } },
    );
  }
  try {
    const result = await syncWorkouts(event);
    return json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    if (isHttpError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw error(502, `Poll failed: ${msg}`);
  }
};
