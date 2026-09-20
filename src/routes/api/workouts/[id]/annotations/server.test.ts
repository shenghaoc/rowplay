import { describe, expect, it } from "vite-plus/test";
import { DELETE, GET, POST, PUT } from "./+server";

describe("/api/workouts/[id]/annotations", () => {
  it("returns Gone for every verb after annotations were removed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = {} as any;
    await expect(GET(event)).rejects.toMatchObject({ status: 410 });
    await expect(POST(event)).rejects.toMatchObject({ status: 410 });
    await expect(PUT(event)).rejects.toMatchObject({ status: 410 });
    await expect(DELETE(event)).rejects.toMatchObject({ status: 410 });
  });
});
