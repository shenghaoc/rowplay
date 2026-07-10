import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  pollRecentWorkouts: vi.fn(),
}));

import { POST } from "./+server";
import { pollRecentWorkouts } from "$lib/server/data";

function fakeEvent(demo = false) {
  return { locals: { demo }, platform: { env: {} } };
}

describe("POST /api/live/poll", () => {
  it("returns empty result in demo mode without polling the live API", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(fakeEvent(true) as any);
    const body = await res.json();
    expect(body.added).toBe(0);
    expect(body.workouts).toEqual([]);
    expect(pollRecentWorkouts).not.toHaveBeenCalled();
  });

  it("returns sync result on success", async () => {
    (pollRecentWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue({
      added: 2,
      total: 5,
      workouts: [],
      newPbs: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(fakeEvent() as any);
    const body = await res.json();
    expect(body.added).toBe(2);
  });

  it("throws 502 on sync error", async () => {
    (pollRecentWorkouts as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Connection refused"),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(fakeEvent() as any)).rejects.toMatchObject({ status: 502 });
  });
});
