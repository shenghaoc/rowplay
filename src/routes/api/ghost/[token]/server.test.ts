import { describe, expect, it } from "vite-plus/test";
import { GET } from "./+server";

describe("GET /api/ghost/[token]", () => {
  it("returns Gone after share-token ghosts were removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET({} as any)).rejects.toMatchObject({ status: 410 });
  });
});
