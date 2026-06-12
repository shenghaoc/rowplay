import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { generateMockWorkout, mockWorkouts } from "$lib/mockData";

/** Demo-only: synthesise a new workout for live-mode mock polling. */
export const POST: RequestHandler = async (event) => {
  if (!event.locals.demo) throw error(400, "Mock poll is only available in demo mode.");
  const existing = mockWorkouts().map((w) => w.id);
  const workout = generateMockWorkout(existing);
  return json(
    { workouts: [workout], added: 1, total: existing.length + 1, newPbs: [] },
    { headers: { "cache-control": "private, no-store" } },
  );
};
