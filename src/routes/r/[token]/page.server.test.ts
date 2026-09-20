import { describe, expect, it } from "vite-plus/test";
import { load } from "./+page.server";

describe("load /r/[token]", () => {
  it("redirects home after public share links were removed", async () => {
    await expect(load({} as never)).rejects.toMatchObject({
      status: 303,
      location: "/",
    });
  });
});
