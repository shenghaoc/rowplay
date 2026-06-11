import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  saveWorkoutTag: vi.fn().mockResolvedValue("interval"),
}));

import { PATCH } from "./+server";
import { saveWorkoutTag } from "$lib/server/data";

function fakeEvent(
  id: string,
  body: unknown,
  opts: { demo?: boolean; user?: { id: number } } = {},
) {
  return {
    params: { id },
    locals: { demo: opts.demo ?? false, user: opts.user },
    request: { json: async () => body },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

describe("PATCH /api/workouts/[id]/tag", () => {
  it("throws 400 for non-numeric id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PATCH(fakeEvent("abc", { tag: "interval" }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 for unrecognised tag", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PATCH(fakeEvent("1001", { tag: "sprint" }, { user: { id: 1 } }) as any),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 401 when unauthenticated in live mode", async () => {
    vi.mocked(saveWorkoutTag).mockRejectedValueOnce({ status: 401 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      PATCH(fakeEvent("1001", { tag: "interval" }, { demo: false }) as any),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("saves a valid tag", async () => {
    vi.mocked(saveWorkoutTag).mockResolvedValueOnce("race-piece");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(fakeEvent("1001", { tag: "race-piece" }, { user: { id: 1 } }) as any);
    const body = await res.json();
    expect(body.tag).toBe("race-piece");
  });

  it("clears override with null tag", async () => {
    vi.mocked(saveWorkoutTag).mockResolvedValueOnce(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(fakeEvent("1001", { tag: null }, { user: { id: 1 } }) as any);
    const body = await res.json();
    expect(body.tag).toBeNull();
  });

  it("returns tag in demo mode without persisting to D1", async () => {
    vi.mocked(saveWorkoutTag).mockResolvedValueOnce("steady-state");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(fakeEvent("1001", { tag: "steady-state" }, { demo: true }) as any);
    const body = await res.json();
    expect(body.tag).toBe("steady-state");
  });
});
