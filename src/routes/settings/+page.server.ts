import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { loadHomeTimezone, loadWorkouts } from "$lib/server/data";

/**
 * Export and home-timezone preferences are stateless: both remain available
 * without server-side storage. Sync status and account deletion were intentionally removed
 * with the persistence layer.
 */
export const load: PageServerLoad = async (event) => {
  if (!event.locals.demo && !event.locals.user) {
    throw redirect(303, "/auth/login");
  }
  if (!event.locals.demo) {
    event.setHeaders({ "cache-control": "private, no-store" });
  }

  const [workouts, homeTimezone] = await Promise.all([
    // Export remains reachable even when Concept2 is transiently unavailable.
    loadWorkouts(event).catch(() => []),
    loadHomeTimezone(event),
  ]);
  const tcxWorkouts = workouts
    .filter((workout) => workout.hasStrokeData)
    .map((workout) => ({ id: workout.id, date: workout.date }));

  return {
    demo: event.locals.demo,
    workoutCount: workouts.length,
    tcxWorkouts,
    homeTimezone,
  };
};
