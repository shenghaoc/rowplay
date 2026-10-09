import { describe, expect, it } from "vite-plus/test";
import { POST } from "./+server";

describe("POST /api/account/delete", () => {
  it("returns Gone after server-side account deletion was removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST({} as any)).rejects.toMatchObject({ status: 410 });
  });
});
