import { describe, expect, it } from "vite-plus/test";
import {
  BACKFILL_PAGES_PER_RUN,
  HISTORY_WINDOW_MONTHS,
  historyWindowStart,
  mergeWatermark,
  planSync,
} from "./historyWindow";

describe("historyWindowStart", () => {
  it("subtracts HISTORY_WINDOW_MONTHS in UTC", () => {
    const now = Temporal.PlainDate.from("2026-06-02");
    expect(historyWindowStart(now)).toBe("2025-06-02");
  });

  it("rolls over year boundary", () => {
    const now = Temporal.PlainDate.from("2026-02-15");
    expect(historyWindowStart(now)).toBe("2025-02-15");
  });

  it("handles end-of-month (Jan 31 − 1 month)", () => {
    const now = Temporal.PlainDate.from("2026-01-31");
    expect(historyWindowStart(now)).toBe("2025-01-31");
  });

  it("handles leap February", () => {
    const now = Temporal.PlainDate.from("2024-03-01");
    expect(historyWindowStart(now)).toBe("2023-03-01");
  });

  it("exports named constants", () => {
    expect(HISTORY_WINDOW_MONTHS).toBe(12);
    expect(BACKFILL_PAGES_PER_RUN).toBe(4);
  });
});

describe("mergeWatermark", () => {
  const base = {
    lastDate: "2026-05-01 10:00:00",
    oldestDate: "2025-06-01 00:00:00",
    backfillDone: false,
  };

  it("advances lastDate and oldestDate outward", () => {
    const next = mergeWatermark(base, ["2026-05-10 08:00:00", "2025-01-15 12:00:00"], false);
    expect(next.lastDate).toBe("2026-05-10 08:00:00");
    expect(next.oldestDate).toBe("2025-01-15 12:00:00");
    expect(next.backfillDone).toBe(false);
  });

  it("does not regress oldestDate on a stale newer-only chunk", () => {
    const next = mergeWatermark(base, ["2026-04-01 08:00:00"], false);
    expect(next.oldestDate).toBe("2025-06-01 00:00:00");
  });

  it("latches backfillDone when reachedEnd", () => {
    const next = mergeWatermark(base, [], true);
    expect(next.backfillDone).toBe(true);
  });

  it("keeps backfillDone latched", () => {
    const done = { ...base, backfillDone: true };
    const next = mergeWatermark(done, ["2024-01-01 00:00:00"], false);
    expect(next.backfillDone).toBe(true);
  });
});

describe("planSync", () => {
  const now = Temporal.PlainDate.from("2026-06-02");
  const state = {
    lastDate: "2026-05-20 08:00:00",
    oldestDate: "2025-06-02",
    backfillDone: false,
    lastSyncAt: 0,
    total: 42,
  };

  it("no state → window", () => {
    expect(planSync(null, now, "forward")).toEqual({
      kind: "window",
      from: "2025-06-02",
    });
  });

  it("state → incremental forward", () => {
    const plan = planSync(state, now, "forward");
    expect(plan.kind).toBe("incremental");
    if (plan.kind === "incremental") {
      expect(plan.from).toBe("2026-05-19");
    }
  });

  it("not done → backfill", () => {
    const plan = planSync(state, now, "backfill");
    expect(plan).toEqual({ kind: "backfill", to: "2025-06-01" });
  });

  it("backfill bridges to window start when oldestDate is far from window", () => {
    // Gap scenario: window starts at 2025-06-02 but oldest known workout is 2025-09-01.
    // The backfill to must reach at least the window start.
    const gapped = { ...state, oldestDate: "2025-09-01" };
    const plan = planSync(gapped, now, "backfill");
    expect(plan).toEqual({ kind: "backfill", to: "2025-06-02" });
  });

  it("done → done for backfill mode", () => {
    expect(planSync({ ...state, backfillDone: true }, now, "backfill")).toEqual({ kind: "done" });
  });

  it("already-synced user (null oldestDate, backfillDone false) → done", () => {
    expect(
      planSync(
        { lastDate: "2026-05-20 08:00:00", oldestDate: null, backfillDone: false },
        now,
        "backfill",
      ),
    ).toEqual({ kind: "done" });
  });

  it("full → unbounded incremental", () => {
    expect(planSync(state, now, "full")).toEqual({ kind: "incremental", from: undefined });
  });

  it("already-synced user → incremental, not window (regression)", () => {
    // Bug: perpetual backfill loop for already-synced users.
    // An already-synced user with state must get 'incremental', not 'window'.
    const plan = planSync(state, now, "forward");
    expect(plan.kind).toBe("incremental");
    expect(plan).not.toEqual({ kind: "window", from: expect.any(String) });
  });

  it("no lastDate but oldestDate exists → still window (fresh connect corner case)", () => {
    const odd = { ...state, lastDate: null };
    expect(planSync(odd, now, "forward")).toEqual({
      kind: "window",
      from: "2025-06-02",
    });
  });
});
