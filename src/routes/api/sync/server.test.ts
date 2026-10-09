import { describe, expect, it } from "vite-plus/test";
import { GET, POST } from "./+server";

describe("POST /api/sync", () => {
  it("returns Gone after persistent sync was removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST({} as any)).rejects.toMatchObject({ status: 410 });
  });
});

describe("GET /api/sync", () => {
  it("returns a live-fetch stub so leftover clients do not look unsynced", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET({} as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      lastSyncAt: null,
      total: 0,
      backfillDone: true,
      inProgress: false,
    });
  });
});
