import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  loadAnnualGoal: vi.fn().mockResolvedValue({ year: 2026, kind: "meters", target: 1_000_000 }),
  saveAnnualGoal: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PUT } from "./+server";
import { loadAnnualGoal, saveAnnualGoal } from "$lib/server/data";

function event(search = "", demo = false, body?: unknown) {
  return {
    locals: { demo },
    url: new URL(`http://localhost/api/goals${search}`),
    request: { json: vi.fn().mockResolvedValue(body) },
  };
}

describe("/api/goals", () => {
  it("falls back to the current year for empty, fractional, or non-positive years", async () => {
    const now = new Date().getFullYear();
    for (const search of ["?year=", "?year=2026.5", "?year=0"]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await GET(event(search) as any);
      expect(loadAnnualGoal).toHaveBeenLastCalledWith(expect.anything(), now);
    }
  });

  it("allows demo users to save a finite annual goal", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await PUT(event("", true, { year: 2026, kind: "hours", target: 100 }) as any);
    expect(saveAnnualGoal).toHaveBeenCalledWith(expect.anything(), {
      year: 2026,
      kind: "hours",
      target: 100,
    });
    await expect(response.json()).resolves.toEqual({
      goal: { year: 2026, kind: "hours", target: 100 },
    });
  });

  it("rejects non-finite targets", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PUT(event("", false, { year: 2026, kind: "meters", target: Number.NaN }) as any),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});
