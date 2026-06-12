import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { loadHomeTimezone, loadWorkouts, syncStatus } from "$lib/server/data";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.demo && !event.locals.user) {
    throw redirect(303, "/auth/login");
  }
  // Prevent the service worker from caching authenticated settings pages.
  // Demo-mode pages (no personal data) remain cacheable for offline use.
  if (!event.locals.demo) {
    event.setHeaders({ "cache-control": "private, no-store" });
  }

  const workouts = await loadWorkouts(event);
  const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
  const tcxWorkouts = workouts
    .filter((w) => w.hasStrokeData)
    .map((w) => ({ id: w.id, date: w.date }));
  const homeTimezone = await loadHomeTimezone(event);
  return {
    demo: event.locals.demo,
    workoutCount: workouts.length,
    sync,
    tcxWorkouts,
    homeTimezone,
  };
};
