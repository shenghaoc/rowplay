import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

beforeEach(() => {
  vi.clearAllMocks();
  (loadAnnualGoal as ReturnType<typeof vi.fn>).mockResolvedValue({
    year: 2026,
    kind: "meters",
    target: 1_000_000,
  });
  (saveAnnualGoal as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("/api/goals", () => {
  it("GET loads the requested year when it is a positive integer", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await GET(event("?year=2026") as any);
    expect(loadAnnualGoal).toHaveBeenCalledWith(expect.anything(), 2026);
    await expect(response.json()).resolves.toEqual({
      year: 2026,
      kind: "meters",
      target: 1_000_000,
    });
  });

  it("GET falls back to the current year when the year param is omitted", async () => {
    const now = new Date().getFullYear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(event() as any);
    expect(loadAnnualGoal).toHaveBeenLastCalledWith(expect.anything(), now);
  });

  it("rejects a null JSON body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PUT(event("", false, null) as any)).rejects.toMatchObject({ status: 400 });
    expect(saveAnnualGoal).not.toHaveBeenCalled();
  });

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

  it("rejects invalid JSON before touching storage", async () => {
    const bad = {
      locals: { demo: false },
      url: new URL("http://localhost/api/goals"),
      request: { json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PUT(bad as any)).rejects.toMatchObject({ status: 400 });
    expect(saveAnnualGoal).not.toHaveBeenCalled();
  });

  it("rejects an array JSON body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PUT(event("", false, [{ kind: "meters", target: 100 }]) as any),
    ).rejects.toMatchObject({ status: 400 });
    expect(saveAnnualGoal).not.toHaveBeenCalled();
  });

  it("rejects a missing or unknown goal kind", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PUT(event("", false, { year: 2026, target: 100 }) as any)).rejects.toMatchObject({
      status: 400,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PUT(event("", false, { year: 2026, kind: "calories", target: 100 }) as any),
    ).rejects.toMatchObject({ status: 400 });
    expect(saveAnnualGoal).not.toHaveBeenCalled();
  });

  it("rejects a missing, zero, or negative target", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PUT(event("", false, { year: 2026, kind: "meters" }) as any),
    ).rejects.toMatchObject({
      status: 400,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PUT(event("", false, { year: 2026, kind: "meters", target: 0 }) as any),
    ).rejects.toMatchObject({ status: 400 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PUT(event("", false, { year: 2026, kind: "meters", target: -5 }) as any),
    ).rejects.toMatchObject({ status: 400 });
    expect(saveAnnualGoal).not.toHaveBeenCalled();
  });
});
