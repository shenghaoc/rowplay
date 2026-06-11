import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/share", () => ({
  createWorkoutShare: vi.fn().mockResolvedValue({
    token: "abc123",
    path: "/r/abc123",
    url: "https://x.com/r/abc123",
    created: true,
  }),
}));

import { POST } from "./+server";

function fakeEvent(id: string) {
  return {
    params: { id },
    locals: { demo: true },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

describe("POST /api/workouts/[id]/share", () => {
  it("throws 400 for non-numeric workout id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(fakeEvent("abc") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("returns share info for valid id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(fakeEvent("1001") as any);
    const body = await res.json();
    expect(body.token).toBe("abc123");
  });
});
