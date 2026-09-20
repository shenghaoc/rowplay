import { describe, expect, it } from "vite-plus/test";
import { DELETE, POST } from "./+server";

describe("/api/workouts/[id]/hr-import", () => {
  it("returns Gone for save after persistent HR import was removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST({} as any)).rejects.toMatchObject({ status: 410 });
  });

  it("returns Gone for clear after persistent HR import was removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(DELETE({} as any)).rejects.toMatchObject({ status: 410 });
  });
});
