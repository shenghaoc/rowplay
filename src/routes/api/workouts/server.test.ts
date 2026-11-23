import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#lib/server/data.ts", () => ({
  listQueryFromEvent: vi
    .fn()
    .mockReturnValue({ sport: null, distance: null, duration: null, sort: "date" }),
  loadWorkoutList: vi.fn().mockResolvedValue([]),
}));

import { GET } from "./+server";

function fakeEvent(demo = true) {
  return {
    locals: { demo },
    url: new URL("http://localhost/api/workouts"),
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

describe("GET /api/workouts", () => {
  it("returns workouts, demo flag, query and filtered status", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent() as any);
    const body = await res.json();
    expect(Array.isArray(body.workouts)).toBe(true);
    expect(typeof body.demo).toBe("boolean");
    expect(body.query).toBeDefined();
    expect(typeof body.filtered).toBe("boolean");
  });

  it("reflects demo flag from locals", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent(true) as any);
    const body = await res.json();
    expect(body.demo).toBe(true);
  });

  it("returns private JSON without writing a cookie", async () => {
    const res = await GET(fakeEvent() as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(await res.json()).toEqual({
      workouts: [],
      demo: true,
      query: { sport: null, distance: null, duration: null, sort: "date" },
      filtered: false,
    });
  });
});
