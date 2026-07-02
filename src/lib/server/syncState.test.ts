import { describe, expect, it } from "vite-plus/test";
import { planSync, mergeWatermark } from "./historyWindow";

describe("planSync", () => {
  it("first connect (no state) returns window plan with from date", () => {
    const now = "2026-06-07";
    const plan = planSync(null, now, "forward");
    expect(plan.kind).toBe("window");
    expect((plan as { from: string }).from).toBeDefined();
  });

  it("incremental after initial window sync uses lastDate as from", () => {
    const now = "2026-06-07";
    const state = {
      lastDate: "2026-06-01",
      oldestDate: "2025-06-01",
      backfillDone: false,
    };
    const plan = planSync(state, now, "forward");
    expect(plan.kind).toBe("incremental");
  });

  it("full mode forces re-sync with undefined from (pages from newest page backward)", () => {
    const now = "2026-06-07";
    const state = {
      lastDate: "2026-06-01",
      oldestDate: "2025-06-01",
      backfillDone: true,
    };
    const plan = planSync(state, now, "full");
    expect(plan.kind).toBe("incremental");
    expect((plan as { from: string | undefined }).from).toBeUndefined();
  });

  it("backfill mode when not done returns backfill plan with to date", () => {
    const now = "2026-06-07";
    const state = {
      lastDate: "2026-06-01",
      oldestDate: "2025-06-01",
      backfillDone: false,
    };
    const plan = planSync(state, now, "backfill");
    expect(plan.kind).toBe("backfill");
  });

  it("backfill mode when already done returns done plan", () => {
    const now = "2026-06-07";
    const state = {
      lastDate: "2026-06-01",
      oldestDate: "2025-06-01",
      backfillDone: true,
    };
    const plan = planSync(state, now, "backfill");
    expect(plan.kind).toBe("done");
  });

  it("backfill mode with null oldestDate returns done", () => {
    const now = "2026-06-07";
    const state = {
      lastDate: "2026-06-01",
      oldestDate: null,
      backfillDone: false,
    };
    const plan = planSync(state, now, "backfill");
    expect(plan.kind).toBe("done");
  });
});

describe("mergeWatermark", () => {
  it("moves oldest backward and lastDate forward", () => {
    const result = mergeWatermark(
      { lastDate: "2026-01-01", oldestDate: "2025-12-01", backfillDone: false },
      ["2026-06-01", "2025-06-01"],
      false,
    );
    expect(result.lastDate).toBe("2026-06-01");
    expect(result.oldestDate).toBe("2025-06-01");
    expect(result.backfillDone).toBe(false);
  });

  it("sets backfillDone when reachedEnd is true", () => {
    const result = mergeWatermark(
      { lastDate: "2026-01-01", oldestDate: "2025-12-01", backfillDone: false },
      ["2025-06-01"],
      true,
    );
    expect(result.backfillDone).toBe(true);
  });

  it("handles empty chunkDates", () => {
    const result = mergeWatermark(
      { lastDate: "2026-01-01", oldestDate: "2025-12-01", backfillDone: false },
      [],
      false,
    );
    expect(result.lastDate).toBe("2026-01-01");
    expect(result.oldestDate).toBe("2025-12-01");
    expect(result.backfillDone).toBe(false);
  });

  it("handles null initial watermark", () => {
    const result = mergeWatermark(
      { lastDate: null, oldestDate: null, backfillDone: false },
      ["2026-06-01", "2025-06-01"],
      false,
    );
    expect(result.lastDate).toBe("2026-06-01");
    expect(result.oldestDate).toBe("2025-06-01");
  });
});
