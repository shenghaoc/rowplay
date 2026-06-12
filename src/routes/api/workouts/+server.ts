import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listQueryFromEvent, loadWorkoutList } from "$lib/server/data";
import { listQueryIsFiltered } from "$lib/workoutQuery";

export const GET: RequestHandler = async (event) => {
  const q = listQueryFromEvent(event);
  const workouts = await loadWorkoutList(event, q);
  return json(
    {
      workouts,
      demo: event.locals.demo,
      query: q,
      filtered: listQueryIsFiltered(q),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
};
