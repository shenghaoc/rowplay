import type { AnnualGoal, AnnualGoalKind } from "./analytics";

export const GOALS_COOKIE = "annual_goal";
export const DEFAULT_ANNUAL_METERS = 1_000_000;

interface StoredAnnualGoal extends AnnualGoal {
  /** Undefined only for demo-mode goals. */
  userId?: number;
}

/** Default annual goal for demo mode and first-time users. */
export function defaultAnnualGoal(year: number): AnnualGoal {
  return { year, kind: "meters", target: DEFAULT_ANNUAL_METERS };
}

export function parseGoalsCookie(raw: string | undefined, userId?: number): AnnualGoal | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<StoredAnnualGoal>;
    if (
      typeof o.year !== "number" ||
      !Number.isInteger(o.year) ||
      o.year <= 0 ||
      (o.kind !== "meters" && o.kind !== "hours") ||
      typeof o.target !== "number" ||
      !Number.isFinite(o.target) ||
      o.target <= 0 ||
      (o.userId !== undefined && (!Number.isInteger(o.userId) || o.userId <= 0))
    ) {
      return null;
    }
    // A demo goal must not follow a person into an authenticated session, and
    // a previous user's goal must not leak to the next person on this browser.
    if (userId === undefined ? o.userId !== undefined : o.userId !== userId) return null;
    return { year: o.year, kind: o.kind as AnnualGoalKind, target: o.target };
  } catch {
    return null;
  }
}

export function serializeGoalsCookie(goal: AnnualGoal, userId?: number): string {
  return JSON.stringify(userId === undefined ? goal : { ...goal, userId });
}
