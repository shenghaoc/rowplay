import type { RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import type { Sport, Workout, WorkoutDetail } from "../types";
import { mockWorkoutDetail, mockWorkouts } from "../mockData";
import { Concept2Client } from "./concept2";
import { getConfig } from "./config";
import {
  destroySession,
  getHomeTimezone,
  openSession,
  setHomeTimezone,
  writeSession,
  SESSION_COOKIE,
  TOKEN_COOKIE,
} from "./session";
import { openToken } from "./tokenCrypto";
import {
  filterAndSortWorkouts,
  parseWorkoutListQuery,
  pbWorkoutIds,
  type WorkoutListQuery,
} from "$lib/workoutQuery";
import type { SportSummary, AnnualGoal } from "$lib/analytics";
import { defaultAnnualGoal, parseGoalsCookie, serializeGoalsCookie } from "$lib/goals";
import { type WorkoutTag } from "../workoutTag";
import { createLogger } from "./logger";

const logger = createLogger(console);

async function client(event: RequestEvent): Promise<Concept2Client | null> {
  const env = event.platform?.env;
  const secret = env?.SESSION_SECRET;
  const sealedSession = event.cookies.get(SESSION_COOKIE);
  if (!secret || !sealedSession) {
    if (!secret) logger.warn("[session] SESSION_SECRET not configured");
    return null;
  }
  const session = await openSession(secret, sealedSession);
  if (!session) {
    logger.warn("[session] openSession failed (tampered/expired cookie or rotated secret)");
    return null;
  }
  if (session.personal) {
    // BYOT: the credential isn't in the session — it's sealed in its own cookie.
    const sealed = event.cookies.get(TOKEN_COOKIE);
    const token = sealed ? await openToken(secret, sealed) : null;
    if (!token) {
      logger.warn("[session] token open failed (tampered/missing rp_tok cookie)");
      return null;
    }
    session.tokens = { ...session.tokens, accessToken: token };
  }
  // For OAuth sessions, persist refreshed tokens back to the session cookie so
  // subsequent requests don't trigger redundant refresh round-trips.
  return new Concept2Client(getConfig(event), session, async (freshSession) => {
    if (!session.personal) {
      await writeSession(event.cookies, event, secret, freshSession);
    }
  });
}

/** Per-request memo: a single dashboard load calls loadWorkouts directly *and*
 *  via loadWorkoutList's cold fallback, which would otherwise race two live API
 *  pages on first connect. Keyed by the request event, so it's scoped to one
 *  request and garbage-collected with it. */
const workoutsByEvent = new WeakMap<RequestEvent, Promise<Workout[]>>();

/**
 * List workouts for display/analytics. Always fetches live from the Concept2
 * API (no server-side cache). Falls back to mock data in demo mode.
 */
export function loadWorkouts(event: RequestEvent): Promise<Workout[]> {
  let cached = workoutsByEvent.get(event);
  if (!cached) {
    cached = loadWorkoutsFresh(event);
    workoutsByEvent.set(event, cached);
  }
  return cached;
}

async function loadWorkoutsFresh(event: RequestEvent): Promise<Workout[]> {
  if (event.locals.demo) return applyDemoWorkoutTags(mockWorkouts());
  const c = await client(event);
  if (!c) throw error(401, "Not authenticated.");
  return c.listWorkouts();
}

/**
 * Workout list for the dashboard — filtered/sorted in JS from live API data.
 */
export async function loadWorkoutList(
  event: RequestEvent,
  q: WorkoutListQuery,
): Promise<Workout[]> {
  if (event.locals.demo) {
    const all = mockWorkouts();
    const pbs = q.pbsOnly ? pbWorkoutIds(all, q.sport) : undefined;
    return filterAndSortWorkouts(all, q, pbs);
  }

  const all = await loadWorkouts(event);
  const pbs = q.pbsOnly ? pbWorkoutIds(all, q.sport) : undefined;
  return filterAndSortWorkouts(all, q, pbs);
}

export function listQueryFromEvent(event: RequestEvent): WorkoutListQuery {
  return parseWorkoutListQuery(event.url.searchParams);
}

export interface SyncResult {
  added: number;
  total: number;
  workouts: Workout[];
  /** Always empty — PB detection requires persistent storage. */
  newPbs: never[];
}

/**
 * Fetch workouts live from the Concept2 API. No server-side sync or caching.
 */
export async function syncWorkouts(event: RequestEvent): Promise<SyncResult> {
  const c = await client(event);
  if (!c) throw error(401, "Not authenticated.");
  const workouts = await c.listWorkouts();
  return { added: workouts.length, total: workouts.length, workouts, newPbs: [] };
}

export async function loadAnnualGoal(event: RequestEvent, year: number): Promise<AnnualGoal> {
  // Goals are stored in a cookie for all modes (demo and live).
  const userId = event.locals.demo ? undefined : event.locals.user?.id;
  const fromCookie = parseGoalsCookie(event.cookies.get("annual_goal") ?? undefined, userId);
  if (fromCookie?.year === year) return fromCookie;
  return defaultAnnualGoal(year);
}

export async function loadHomeTimezone(event: RequestEvent): Promise<string | undefined> {
  if (event.locals.demo) return undefined;
  const env = event.platform?.env;
  const secret = env?.SESSION_SECRET;
  const sealedSession = event.cookies.get(SESSION_COOKIE);
  if (!secret || !sealedSession) {
    if (!secret) logger.warn("[tz] SESSION_SECRET not configured for home timezone");
    return undefined;
  }
  const session = await openSession(secret, sealedSession);
  if (!session) {
    logger.warn("[tz] session open failed for home timezone (tampered/expired cookie)");
    return undefined;
  }
  return getHomeTimezone(session);
}

export async function saveHomeTimezone(
  event: RequestEvent,
  timezone: string | undefined,
): Promise<void> {
  if (event.locals.demo) return;
  const env = event.platform?.env;
  const secret = env?.SESSION_SECRET;
  if (!secret) throw error(401, "Not authenticated.");
  const sealedSession = event.cookies.get(SESSION_COOKIE);
  if (!sealedSession) throw error(401, "Not authenticated.");
  const session = await openSession(secret, sealedSession);
  if (!session) throw error(401, "Not authenticated.");
  await setHomeTimezone(event.cookies, event, secret, session, timezone);
}

export async function saveAnnualGoal(event: RequestEvent, goal: AnnualGoal): Promise<void> {
  // Goals are stored in a cookie for all modes, scoped to the authenticated
  // athlete when one is present so they cannot follow a logout/login change.
  const userId = event.locals.demo ? undefined : event.locals.user?.id;
  event.cookies.set("annual_goal", serializeGoalsCookie(goal, userId), {
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
    httpOnly: true,
  });
}

export interface DashboardAggregates {
  bySport: SportSummary[];
  pbs: { distance: number; time: number; pace: number; date: string; sport: Sport }[];
}

/**
 * Compute dashboard aggregates from live workout data in JS (no server-side cache).
 */
export async function loadDashboardAggregates(
  event: RequestEvent,
): Promise<DashboardAggregates | null> {
  if (event.locals.demo) return null;
  const workouts = await loadWorkouts(event).catch((e) => {
    logger.error(
      "[dashboard] loadDashboardAggregates: workout fetch failed:",
      e instanceof Error ? e.message : String(e),
    );
    return [] as Workout[];
  });
  if (!workouts.length) return null;

  // Compute per-sport aggregates
  const bySportMap = new Map<
    Sport,
    {
      sessions: number;
      distance: number;
      time: number;
      bestPace: number;
      longest: number;
    }
  >();
  for (const w of workouts) {
    const existing = bySportMap.get(w.sport);
    if (existing) {
      existing.sessions++;
      existing.distance += w.distance;
      existing.time += w.time;
      if (w.pace > 0 && w.pace < existing.bestPace) existing.bestPace = w.pace;
      if (w.distance > existing.longest) existing.longest = w.distance;
    } else {
      bySportMap.set(w.sport, {
        sessions: 1,
        distance: w.distance,
        time: w.time,
        bestPace: w.pace > 0 ? w.pace : Infinity,
        longest: w.distance,
      });
    }
  }
  const bySport: SportSummary[] = [...bySportMap.entries()].map(([sport, v]) => ({
    sport,
    sessions: v.sessions,
    distance: v.distance,
    time: v.time,
    avgPace: v.distance > 0 ? (v.time * 500) / v.distance : 0,
    bestPace: v.bestPace,
    longest: v.longest,
  }));

  // Compute PBs per standard distance per sport. Compare pace (sec/500m) not
  // raw time, so a shorter workout within the 2% tolerance doesn't beat a
  // faster-paced longer one.
  const STANDARD_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097];
  const pbMap = new Map<
    string,
    { distance: number; time: number; pace: number; date: string; sport: Sport }
  >();
  for (const w of workouts) {
    if (w.time <= 0 || w.pace <= 0) continue;
    for (const target of STANDARD_DISTANCES) {
      const tol = target * 0.02;
      if (Math.abs(w.distance - target) <= tol) {
        const key = `${w.sport}:${target}`;
        const existing = pbMap.get(key);
        if (!existing || w.pace < existing.pace) {
          pbMap.set(key, {
            distance: target,
            time: w.time,
            pace: w.pace,
            date: w.date,
            sport: w.sport,
          });
        }
      }
    }
  }
  const pbs = [...pbMap.values()];

  return { bySport, pbs };
}

export async function loadWorkoutDetail(event: RequestEvent, id: number): Promise<WorkoutDetail> {
  if (event.locals.demo) {
    const d = mockWorkoutDetail(id);
    if (!d) throw error(404, "Workout not found.");
    if (demoWorkoutTagStore.has(id)) {
      return { ...d, userTag: demoWorkoutTagStore.get(id) ?? null };
    }
    return d;
  }
  const c = await client(event);
  if (!c) throw error(401, "Not authenticated.");
  return c.getWorkout(id);
}

/** Clear the session cookie (no server-side data to purge). */
export async function clearUserCachedData(event: RequestEvent): Promise<void> {
  if (event.locals.demo) return;
  destroySession(event.cookies, event);
  event.cookies.delete(TOKEN_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: event.url.protocol === "https:",
    sameSite: "lax",
  });
}

// ---------------------------------------------------------------------------
// Demo-mode stores (in-memory, lost on server restart — acceptable for demo).
// ---------------------------------------------------------------------------

/** Demo-mode workout type tag overrides (workout id → tag or null for auto). */
const demoWorkoutTagStore = new Map<number, WorkoutTag | null>();

export function resetDemoWorkoutTagStore(): void {
  demoWorkoutTagStore.clear();
}

/** Apply demo tag overrides to workout rows returned in demo mode. */
export function applyDemoWorkoutTags(workouts: Workout[]): Workout[] {
  if (!demoWorkoutTagStore.size) return workouts;
  return workouts.map((w) => {
    if (!demoWorkoutTagStore.has(w.id)) return w;
    return { ...w, userTag: demoWorkoutTagStore.get(w.id) ?? null };
  });
}
