import { describe, expect, it, vi } from "vite-plus/test";
import { GHOST_TRACE_CACHE } from "./rivalGhost";

// Mock the share and leaderboard layers to isolate the constant and thin wrappers.
vi.mock("./share", () => ({
  loadSharedWorkout: vi.fn(),
}));
vi.mock("$lib/replay/rivalGhost", () => ({
  toRivalGhostTrace: vi.fn((d) => ({ workoutId: d.id, strokes: d.strokes })),
}));

import { loadSharedWorkout } from "./share";
import { loadRivalGhostTrace } from "./rivalGhost";

describe("GHOST_TRACE_CACHE", () => {
  it("is a public, positive max-age header value", () => {
    expect(GHOST_TRACE_CACHE).toContain("public");
    expect(GHOST_TRACE_CACHE).toMatch(/max-age=\d+/);
    const maxAge = Number(GHOST_TRACE_CACHE.match(/max-age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
  });
});

describe("loadRivalGhostTrace", () => {
  it("returns a trace when the shared workout has strokes", async () => {
    (loadSharedWorkout as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1001,
      strokes: [{ t: 0, d: 0, pace: 120, spm: 28, watts: 100 }],
    });
    const trace = await loadRivalGhostTrace(
      {} as never,
      "abc123token456789012345678901234567890123456789a",
    );
    expect(trace).toBeDefined();
  });

  it("throws 404 when the shared workout has no strokes", async () => {
    (loadSharedWorkout as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1001,
      strokes: [],
    });
    await expect(
      loadRivalGhostTrace({} as never, "abc123token456789012345678901234567890123456789a"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
