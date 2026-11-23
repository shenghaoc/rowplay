import { describe, expect, it } from "vite-plus/test";
import { DELETE, POST } from "./+server";

describe("/api/leaderboard/publish", () => {
  it("returns Gone for publish after leaderboards were removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST({} as any)).rejects.toMatchObject({ status: 410 });
  });

  it("returns Gone for withdraw after leaderboards were removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(DELETE({} as any)).rejects.toMatchObject({ status: 410 });
  });
});
