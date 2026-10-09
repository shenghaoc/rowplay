import { describe, expect, it } from "vite-plus/test";
import { PATCH } from "./+server";

describe("PATCH /api/workouts/[id]/tag", () => {
  it("returns Gone after workout-tag persistence was removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(PATCH({} as any)).rejects.toMatchObject({ status: 410 });
  });
});
