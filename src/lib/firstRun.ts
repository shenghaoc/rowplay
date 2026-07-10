import { safeStorage } from "./safeStorage";

type StorageLike = Pick<typeof safeStorage, "getItem" | "setItem" | "removeItem">;

export type FirstRunSurface = "landing" | "dashboard";

export const DASHBOARD_HINT_IDS = ["latestReplay", "criticalPower", "workoutFilters"] as const;

export type DashboardHintId = (typeof DASHBOARD_HINT_IDS)[number];

const PREFIX = "rowplay:first-run:";

export function firstRunEligible(demo: boolean, user: unknown): boolean {
  return demo && !user;
}

export function firstRunSurfaceKey(surface: FirstRunSurface): string {
  return `${PREFIX}${surface}:dismissed`;
}

export function dashboardHintKey(id: DashboardHintId): string {
  return `${PREFIX}dashboard:${id}:dismissed`;
}

export function isFirstRunSurfaceDismissed(
  surface: FirstRunSurface,
  storage: StorageLike = safeStorage,
): boolean {
  return storage.getItem(firstRunSurfaceKey(surface)) === "1";
}

export function dismissFirstRunSurface(
  surface: FirstRunSurface,
  storage: StorageLike = safeStorage,
): void {
  storage.setItem(firstRunSurfaceKey(surface), "1");
}

export function resetFirstRunSurface(
  surface: FirstRunSurface,
  storage: StorageLike = safeStorage,
): void {
  storage.removeItem(firstRunSurfaceKey(surface));
}

export function isDashboardHintDismissed(
  id: DashboardHintId,
  storage: StorageLike = safeStorage,
): boolean {
  return storage.getItem(dashboardHintKey(id)) === "1";
}

export function dismissDashboardHint(
  id: DashboardHintId,
  storage: StorageLike = safeStorage,
): void {
  storage.setItem(dashboardHintKey(id), "1");
}

export function visibleDashboardHints(storage: StorageLike = safeStorage): DashboardHintId[] {
  if (isFirstRunSurfaceDismissed("dashboard", storage)) return [];
  return DASHBOARD_HINT_IDS.filter((id) => !isDashboardHintDismissed(id, storage));
}
