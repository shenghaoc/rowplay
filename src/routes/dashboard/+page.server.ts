import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { todayKeyForTz } from "$lib/datetime";
import {
  listQueryFromEvent,
  loadAnnualGoal,
  loadDashboardAggregates,
  loadHomeTimezone,
  loadWorkoutList,
  loadWorkouts,
} from "$lib/server/data";
import { firstRunEligible } from "$lib/firstRun";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.demo && !event.locals.user) {
    throw redirect(303, "/auth/login");
  }
  // Prevent the service worker from caching authenticated dashboard pages.
  // Demo-mode pages (no personal data) remain cacheable for offline use.
  if (!event.locals.demo) {
    event.setHeaders({ "cache-control": "private, no-store" });
  }

  const listQuery = listQueryFromEvent(event);
  const [workouts, listWorkouts, aggregates] = await Promise.all([
    loadWorkouts(event),
    loadWorkoutList(event, listQuery),
    loadDashboardAggregates(event),
  ]);
  // Resolve the home timezone first so the calendar's right edge ("today") is
  // the athlete's local day, not UTC — otherwise athletes east of UTC see the
  // grid end on yesterday after local midnight. (Demo mode has no server-side
  // tz; todayKeyForTz(undefined) falls back to UTC and the client re-derives.)
  const homeTimezone = await loadHomeTimezone(event);
  const calendarEndDay = todayKeyForTz(homeTimezone);
  const goalYear = parseInt(calendarEndDay.slice(0, 4), 10);
  const annualGoal = await loadAnnualGoal(event, goalYear);
  return {
    workouts,
    listWorkouts,
    listQuery,
    aggregates,
    demo: event.locals.demo,
    firstRunEligible: firstRunEligible(event.locals.demo, event.locals.user),
    calendarEndDay,
    annualGoal,
    goalYear,
    homeTimezone,
  };
};
