import { describe, expect, it } from "vite-plus/test";
import { load } from "./+page.server";

describe("load /leaderboard", () => {
  it("redirects to the dashboard after leaderboards were removed", async () => {
    await expect(load({} as never)).rejects.toMatchObject({
      status: 303,
      location: "/dashboard",
    });
  });
});
