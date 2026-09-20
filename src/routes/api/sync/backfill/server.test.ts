import { describe, expect, it } from "vite-plus/test";
import { POST } from "./+server";

describe("POST /api/sync/backfill", () => {
  it("returns Gone after persistent backfill was removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST({} as any)).rejects.toMatchObject({ status: 410 });
  });
});
