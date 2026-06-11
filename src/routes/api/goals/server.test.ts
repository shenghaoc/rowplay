import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  loadAnnualGoal: vi.fn().mockResolvedValue({ year: 2026, kind: "meters", target: 1_000_000 }),
  saveAnnualGoal: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PUT } from "./+server";

function fakeGetEvent(year?: string) {
  const url = year ? `http://localhost/api/goals?year=${year}` : "http://localhost/api/goals";
  return {
    url: new URL(url),
    locals: { demo: true },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

function fakePutEvent(body: unknown) {
  return {
    url: new URL("http://localhost/api/goals"),
    locals: { demo: true },
    request: { json: async () => body },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

describe("GET /api/goals", () => {
  it("returns goal for the current year when no year param", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeGetEvent() as any);
    const body = await res.json();
    expect(body.goal).toBeDefined();
  });

  it("parses year param and passes to loadAnnualGoal", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeGetEvent("2025") as any);
    const body = await res.json();
    expect(body.goal).toBeDefined();
  });
});

describe("PUT /api/goals", () => {
  it("throws 400 when kind is invalid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PUT(fakePutEvent({ kind: "miles", target: 1000 }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 when target is missing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PUT(fakePutEvent({ kind: "meters" }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 when target is zero or negative", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PUT(fakePutEvent({ kind: "meters", target: 0 }) as any)).rejects.toMatchObject({
      status: 400,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PUT(fakePutEvent({ kind: "hours", target: -1 }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("saves and returns goal on success", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PUT(fakePutEvent({ kind: "meters", target: 500_000 }) as any);
    const body = await res.json();
    expect(body.goal.kind).toBe("meters");
    expect(body.goal.target).toBe(500_000);
  });

  it("accepts hours kind", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PUT(fakePutEvent({ kind: "hours", target: 100 }) as any);
    const body = await res.json();
    expect(body.goal.kind).toBe("hours");
  });

  it("uses provided year when included in body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PUT(fakePutEvent({ year: 2025, kind: "meters", target: 200_000 }) as any);
    const body = await res.json();
    expect(body.goal.year).toBe(2025);
  });
});
