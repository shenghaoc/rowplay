import { describe, expect, it } from "vite-plus/test";
import { POST } from "./+server";

describe("POST /api/workouts/[id=workoutId]/share", () => {
  it("returns Gone after persistent sharing was removed", async () => {
    const event = { params: { id: 1001 } } as Parameters<typeof POST>[0];
    await expect(POST(event)).rejects.toMatchObject({ status: 410 });
  });
});
