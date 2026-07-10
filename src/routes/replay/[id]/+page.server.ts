import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { loadWorkoutDetail, loadWorkouts } from "$lib/server/data";
import { createLogger } from "$lib/server/logger";
import type { Workout } from "$lib/types";

const logger = createLogger(console);

export const load: PageServerLoad = async (event) => {
  if (!event.locals.demo && !event.locals.user) {
    throw redirect(303, "/auth/login");
  }
  // Prevent the service worker from caching authenticated replay pages.
  // Demo-mode pages (no personal data) remain cacheable for offline use.
  if (!event.locals.demo) {
    event.setHeaders({ "cache-control": "private, no-store" });
  }

  const id = Number(event.params.id);
  const detail = await loadWorkoutDetail(event, id);

  // Candidate ghosts: other sessions of the same sport to race against.
  let candidates: Workout[] = [];
  try {
    const all = await loadWorkouts(event);
    candidates = all
      .filter((w) => w.sport === detail.sport && w.id !== id)
      .sort((a, b) => a.pace - b.pace); // fastest first
  } catch (e) {
    // Ghost candidates are best-effort; log but don't block replay
    logger.error(
      "[replay] ghost candidate load failed:",
      e instanceof Error ? e.message : String(e),
    );
    candidates = [];
  }

  return { detail, candidates, demo: event.locals.demo };
};
