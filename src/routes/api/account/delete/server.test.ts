import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  clearUserCachedData: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./+server";

function fakeEvent(opts: { demo?: boolean; user?: { id: number } | null; body?: unknown }) {
  const deleted: string[] = [];
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : null;
  return {
    event: {
      locals: { demo: opts.demo ?? false, user: opts.user ?? null },
      request: {
        json: async () => {
          if (bodyStr === null) throw new Error("no body");
          return JSON.parse(bodyStr);
        },
      },
      cookies: { delete: (name: string) => deleted.push(name) },
      platform: { env: { DB: {} } },
    },
    deleted,
  };
}

describe("DELETE /api/account/delete", () => {
  it("returns {demo: true} in demo mode without auth check", async () => {
    const { event } = fakeEvent({ demo: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(event as any);
    const body = await res.json();
    expect(body.demo).toBe(true);
  });

  it("throws 401 when not authenticated", async () => {
    const { event } = fakeEvent({ demo: false, user: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event as any)).rejects.toMatchObject({ status: 401 });
  });

  it("throws 400 when body has no confirm flag", async () => {
    const { event } = fakeEvent({ user: { id: 1 }, body: { confirm: false } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event as any)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when body is missing", async () => {
    const { event } = fakeEvent({ user: { id: 1 } }); // no body -> json() throws
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event as any)).rejects.toMatchObject({ status: 400 });
  });

  it("returns {ok: true} and deletes cookies on success", async () => {
    const { event, deleted } = fakeEvent({ user: { id: 1 }, body: { confirm: true } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(event as any);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(deleted.length).toBeGreaterThanOrEqual(2);
  });
});
