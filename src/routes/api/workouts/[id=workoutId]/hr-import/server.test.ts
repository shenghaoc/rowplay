import { describe, expect, it } from "vite-plus/test";
import { DELETE, POST } from "./+server";

describe("/api/workouts/[id=workoutId]/hr-import", () => {
  it("returns Gone for save after persistent HR import was removed", async () => {
    const event = { params: { id: 1001 } } as Parameters<typeof POST>[0];
    await expect(POST(event)).rejects.toMatchObject({ status: 410 });
  });

  it("returns Gone for clear after persistent HR import was removed", async () => {
    const event = { params: { id: 1001 } } as Parameters<typeof DELETE>[0];
    await expect(DELETE(event)).rejects.toMatchObject({ status: 410 });
  });
});
