import { addMonthsToKey, overlapDate, todayKeyUtc } from "$lib/datetime";
import type { SyncState } from "./db";

/** Eager first-connect window length. The single source of truth. */
export const HISTORY_WINDOW_MONTHS = 12;

/** Max 250-result pages drained per backfill request (API politeness). */
export const BACKFILL_PAGES_PER_RUN = 4;

export type SyncMode = "forward" | "backfill" | "full";

export type SyncPlan =
  | { kind: "window"; from: string }
  | { kind: "incremental"; from: string | undefined }
  | { kind: "backfill"; to: string }
  | { kind: "done" };

type Watermark = {
  lastDate: string | null;
  oldestDate: string | null;
  backfillDone: boolean;
};

/** `YYYY-MM-DD` window start: today − HISTORY_WINDOW_MONTHS, in UTC. */
export function historyWindowStart(now: string = todayKeyUtc()): string {
  return addMonthsToKey(now, -HISTORY_WINDOW_MONTHS);
}

/** Pure decision: what the next sync run should do, given persisted state. */
export function planSync(
  state: Pick<SyncState, "lastDate" | "oldestDate" | "backfillDone"> | null,
  now: string,
  mode: SyncMode,
): SyncPlan {
  if (mode === "full") {
    return { kind: "incremental", from: undefined };
  }

  if (mode === "backfill") {
    if (!state || state.backfillDone) return { kind: "done" };
    if (!state.oldestDate) return { kind: "done" };
    // The backfill `to` must always bridge to the window start so there is no
    // gap between the initial window fetch and the oldest known workout date.
    const overlap = overlapDate(state.oldestDate);
    if (!overlap) return { kind: "done" };
    const windowFrom = historyWindowStart(now);
    // Pick the earlier date — the backfill should reach *at least* the window
    // start, and overlapDate already subtracts one day for safety.
    const to = overlap < windowFrom ? overlap : windowFrom;
    return { kind: "backfill", to };
  }

  // First connect: no sync state yet.
  if (!state?.lastDate) {
    return { kind: "window", from: historyWindowStart(now) };
  }

  return { kind: "incremental", from: overlapDate(state.lastDate) ?? undefined };
}

/** Fold a fetched chunk into the watermark; only ever moves outward. */
export function mergeWatermark(
  prev: Watermark,
  chunkDates: string[],
  reachedEnd: boolean,
): Watermark {
  let { lastDate, oldestDate, backfillDone } = prev;
  if (reachedEnd) backfillDone = true;

  for (const d of chunkDates) {
    if (!lastDate || compareLogbookDates(d, lastDate) > 0) lastDate = d;
    if (!oldestDate || compareLogbookDates(d, oldestDate) < 0) oldestDate = d;
  }

  return { lastDate, oldestDate, backfillDone };
}

/** Logbook date-time strings sort lexicographically when zero-padded. */
function compareLogbookDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
