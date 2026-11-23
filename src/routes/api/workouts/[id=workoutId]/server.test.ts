import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#lib/server/data.ts", () => ({
  loadWorkoutDetail: vi.fn(),
}));

import { GET } from "./+server";
import { loadWorkoutDetail } from "#lib/server/data.ts";

const sampleDetail = {
  id: 1001,
  date: "2026-01-01 06:00:00",
  sport: "rower" as const,
  distance: 2000,
  time: 480,
  pace: 120,
  hasStrokeData: true,
  strokes: [],
  splits: [],
  isInterval: false,
};

function fakeEvent(id: number) {
  return {
    params: { id },
    locals: { demo: true },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

describe("GET /api/workouts/[id=workoutId]", () => {
  it("throws 400 for non-numeric id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent(Number.NaN) as any)).rejects.toMatchObject({ status: 400 });
  });

  it("returns workout detail for valid id", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent(1001) as any);
    const body = await res.json();
    expect(body.id).toBe(1001);
  });

  it("returns the complete private JSON detail without writing a cookie", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    const res = await GET(fakeEvent(1001) as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(await res.json()).toEqual(sampleDetail);
  });

  it("throws 400 for non-finite ids such as Infinity", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent(Number.POSITIVE_INFINITY) as any)).rejects.toMatchObject({
      status: 400,
    });
    expect(loadWorkoutDetail).not.toHaveBeenCalled();
  });
});
