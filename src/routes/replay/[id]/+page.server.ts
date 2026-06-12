import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { loadAnnotations, loadWorkoutDetail, loadWorkouts } from "$lib/server/data";
import { isWorkoutPublished } from "$lib/server/db";
import type { Workout } from "$lib/types";

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
  const annotations = await loadAnnotations(event, id);

  // Candidate ghosts: other sessions of the same sport to race against.
  let candidates: Workout[] = [];
  try {
    const all = await loadWorkouts(event);
    candidates = all
      .filter((w) => w.sport === detail.sport && w.id !== id)
      .sort((a, b) => a.pace - b.pace); // fastest first
  } catch {
    candidates = [];
  }

  // Whether this piece is already on a board, so the UI opens with the correct
  // Publish/Remove affordance even when it was published in a past session.
  const published =
    !event.locals.demo && event.locals.user
      ? await isWorkoutPublished(event.platform?.env?.DB, event.locals.user.id, id)
      : false;

  return { detail, candidates, annotations, demo: event.locals.demo, published };
};
