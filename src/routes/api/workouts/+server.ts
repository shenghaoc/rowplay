import { withJsonContentLength } from "#lib/server/jsonResponse.ts";
import type { RequestHandler } from "./$types";
import { listQueryFromEvent, loadWorkoutList } from "#lib/server/data.ts";
import { listQueryIsFiltered } from "#lib/workoutQuery.ts";

export const GET: RequestHandler = async (event) => {
  const q = listQueryFromEvent(event);
  const workouts = await loadWorkoutList(event, q);
  return withJsonContentLength(
    Response.json(
      {
        workouts,
        demo: event.locals.demo,
        query: q,
        filtered: listQueryIsFiltered(q),
      },
      { headers: { "cache-control": "private, no-store" } },
    ),
  );
};
