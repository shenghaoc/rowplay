import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  listQueryFromEvent: vi.fn().mockReturnValue({ sport: null, distance: null, sort: "date" }),
  loadWorkouts: vi.fn().mockResolvedValue([]),
  loadWorkoutList: vi.fn().mockResolvedValue([]),
  loadDashboardAggregates: vi
    .fn()
    .mockResolvedValue({ totalDistance: 0, totalTime: 0, workoutCount: 0 }),
  loadAnnualGoal: vi.fn().mockResolvedValue(null),
  loadHomeTimezone: vi.fn().mockResolvedValue(undefined),
}));

import { error } from "@sveltejs/kit";
import { load } from "./+page.server";
import { loadWorkouts } from "$lib/server/data";

function fakeEvent(opts: { demo?: boolean; user?: { id: number } | null } = {}) {
  return {
    locals: { demo: opts.demo ?? false, user: opts.user ?? null },
    url: new URL("http://localhost/dashboard"),
    platform: { env: {} },
    setHeaders: vi.fn(),
  };
}

describe("load /dashboard", () => {
  it("redirects to login when not demo and not authenticated", async () => {
    const event = fakeEvent({ demo: false, user: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(load(event as any)).rejects.toMatchObject({
      status: 303,
      location: "/auth/login",
    });
  });

  it("returns data in demo mode", async () => {
    const event = fakeEvent({ demo: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event as any)) as any;
    expect(data.demo).toBe(true);
    expect(data.firstRunEligible).toBe(true);
    expect(Array.isArray(data.workouts)).toBe(true);
  });

  it("returns data for authenticated user", async () => {
    const event = fakeEvent({ demo: false, user: { id: 7 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event as any)) as any;
    expect(data.demo).toBe(false);
    expect(data.firstRunEligible).toBe(false);
    expect(data.workouts).toBeDefined();
  });

  it("includes calendarEndDay in ISO format", async () => {
    const event = fakeEvent({ demo: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event as any)) as any;
    expect(data.calendarEndDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns empty workout data when Concept2 fails with a generic error", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Concept2 down"));
    const event = fakeEvent({ demo: false, user: { id: 7 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event as any)) as any;
    expect(data.workouts).toEqual([]);
    expect(data.listWorkouts).toEqual([]);
    expect(data.aggregates).toBeNull();
    expect(data.demo).toBe(false);
  });

  it("rethrows an HttpError from the live fetch instead of swallowing it", async () => {
    let httpErr: unknown;
    try {
      error(401, "Not authenticated.");
    } catch (e) {
      httpErr = e;
    }
    (loadWorkouts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(httpErr);
    const event = fakeEvent({ demo: false, user: { id: 7 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(load(event as any)).rejects.toMatchObject({ status: 401 });
  });
});
