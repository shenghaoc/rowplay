import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  loadWorkouts: vi.fn().mockResolvedValue([
    { id: 1001, hasStrokeData: true, date: "2026-01-01" },
    { id: 1002, hasStrokeData: false, date: "2026-01-02" },
  ]),
  loadHomeTimezone: vi.fn().mockResolvedValue("Asia/Singapore"),
}));

import { load } from "./+page.server";
import { loadWorkouts } from "$lib/server/data";

function event(opts: { demo?: boolean; user?: { id: number } | null } = {}) {
  return {
    locals: { demo: opts.demo ?? false, user: opts.user === undefined ? { id: 7 } : opts.user },
    setHeaders: vi.fn(),
  };
}

describe("load /settings", () => {
  it("redirects unauthenticated non-demo visitors", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(load(event({ user: null }) as any)).rejects.toMatchObject({
      status: 303,
      location: "/auth/login",
    });
  });

  it("returns export and timezone data for signed-in users", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event() as any)) as any;
    expect(data).toMatchObject({ demo: false, workoutCount: 2, homeTimezone: "Asia/Singapore" });
    expect(data.tcxWorkouts).toEqual([{ id: 1001, date: "2026-01-01" }]);
  });

  it("allows demo users to export sample workouts", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event({ demo: true, user: null }) as any)) as any;
    expect(data.demo).toBe(true);
    expect(data.workoutCount).toBe(2);
  });

  it("keeps Settings available when the live workout request fails", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("rate limited"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event() as any)) as any;
    expect(data).toMatchObject({ workoutCount: 0, homeTimezone: "Asia/Singapore" });
    expect(data.tcxWorkouts).toEqual([]);
  });
});
