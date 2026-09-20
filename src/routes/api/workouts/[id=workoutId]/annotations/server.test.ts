import { describe, expect, it } from "vite-plus/test";
import { DELETE, GET, POST, PUT } from "./+server";

describe("/api/workouts/[id=workoutId]/annotations", () => {
  it("returns Gone for every verb after annotations were removed", async () => {
    const event = { params: { id: 1001 } } as Parameters<typeof GET>[0];
    await expect(GET(event)).rejects.toMatchObject({ status: 410 });
    await expect(POST(event)).rejects.toMatchObject({ status: 410 });
    await expect(PUT(event)).rejects.toMatchObject({ status: 410 });
    await expect(DELETE(event)).rejects.toMatchObject({ status: 410 });
  });
});
