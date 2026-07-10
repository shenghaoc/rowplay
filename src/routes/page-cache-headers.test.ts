import { describe, expect, it, vi } from "vite-plus/test";

/**
 * Verify that authenticated page routes set cache-control: private, no-store
 * so the service worker does not persist authenticated SSR pages in the
 * Cache API.
 */

vi.mock("$lib/server/data", () => ({
  loadWorkouts: vi.fn().mockResolvedValue([]),
  loadWorkoutList: vi.fn().mockResolvedValue([]),
  loadDashboardAggregates: vi.fn().mockResolvedValue({}),
  loadWorkoutDetail: vi.fn().mockResolvedValue({ strokes: [] }),
  loadHomeTimezone: vi.fn().mockResolvedValue("UTC"),
  loadAnnualGoal: vi.fn().mockResolvedValue(null),
  listQueryFromEvent: vi.fn().mockReturnValue({}),
}));

vi.mock("$lib/firstRun", () => ({
  firstRunEligible: vi.fn().mockReturnValue(false),
}));

vi.mock("$lib/datetime", () => ({
  todayKeyForTz: vi.fn().mockReturnValue("2026-06-07"),
}));

vi.mock("$lib/workoutQuery", () => ({
  listQueryIsFiltered: vi.fn().mockReturnValue(false),
}));

import { load as dashboardLoad } from "../routes/dashboard/+page.server";
import { load as replayLoad } from "../routes/replay/[id]/+page.server";

/** Build a minimal RequestEvent with header tracking. */
function fakeEvent(opts: { demo?: boolean; user?: object | null } = {}) {
  const setHeaders: Record<string, string> = {};
  return {
    locals: {
      demo: opts.demo ?? false,
      user: "user" in opts ? opts.user : { id: 1, username: "test" },
    },
    params: { id: "1001" },
    url: new URL("https://rowplay.shenghaoc.workers.dev/dashboard"),
    setHeaders: (headers: Record<string, string>) => {
      Object.assign(setHeaders, headers);
    },
    cookies: {
      get: () => null,
    },
    platform: { env: {} },
    _setHeaders: setHeaders, // for assertions
  } as Record<string, unknown>;
}

describe("page route cache-control headers", () => {
  it("dashboard sets cache-control: private, no-store for authenticated users", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent() as any;
    await dashboardLoad(event);
    expect(event._setHeaders["cache-control"]).toBe("private, no-store");
  });

  it("dashboard does NOT set cache-control in demo mode (cacheable for offline)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent({ demo: true, user: null }) as any;
    await dashboardLoad(event);
    expect(event._setHeaders["cache-control"]).toBeUndefined();
  });

  it("replay sets cache-control: private, no-store for authenticated users", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent() as any;
    event.params = { id: "1001" };
    await replayLoad(event);
    expect(event._setHeaders["cache-control"]).toBe("private, no-store");
  });

  it("replay does NOT set cache-control in demo mode (cacheable for offline)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent({ demo: true, user: null }) as any;
    event.params = { id: "1001" };
    await replayLoad(event);
    expect(event._setHeaders["cache-control"]).toBeUndefined();
  });

  it("auth-gated pages redirect when unauthenticated and not in demo mode", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent({ demo: false, user: null }) as any;
    await expect(dashboardLoad(event)).rejects.toMatchObject({ status: 303 });
  });
});
