import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { WorkoutDetail } from "../types";

// The live (non-demo) createWorkoutShare path loads the workout via ./data and
// touches the D1 layer; mock both so we can exercise the privacy block in
// isolation (the demo path is covered by real functions in share.test.ts).
vi.mock("./data", () => ({ loadWorkoutDetail: vi.fn() }));
vi.mock("./db", () => ({
  getShareToken: vi.fn(),
  setShareToken: vi.fn(),
  putCachedDetail: vi.fn(),
  getCachedDetail: vi.fn(),
  getCachedDetailByShareToken: vi.fn(),
}));

import { createWorkoutShare, loadSharedWorkout } from "./share";
import { loadWorkoutDetail } from "./data";
import { getCachedDetailByShareToken, getShareToken, putCachedDetail } from "./db";

const mockLoad = loadWorkoutDetail as ReturnType<typeof vi.fn>;
const mockGetToken = getShareToken as ReturnType<typeof vi.fn>;

function liveEvent() {
  return {
    locals: { demo: false, user: { id: 7 } },
    platform: { env: { DB: {}, PUBLIC_APP_URL: "https://x.test" } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("createWorkoutShare live path — privacy block re-syncs the cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes the cache before refusing a now-private workout", async () => {
    const detail = { id: 42, privacy: "private" } as unknown as WorkoutDetail;
    mockLoad.mockResolvedValue(detail);
    const event = liveEvent();

    await expect(createWorkoutShare(event, 42)).rejects.toMatchObject({ status: 403 });

    // The private detail is written back (share_token row preserved) so any link
    // already handed out now fails closed at redemption — not just new shares.
    expect(putCachedDetail).toHaveBeenCalledWith(event.platform.env.DB, 7, detail);
  });

  it("re-syncs the cache for a public workout that already has a token (no block)", async () => {
    const detail = { id: 42, privacy: "everyone" } as unknown as WorkoutDetail;
    mockLoad.mockResolvedValue(detail);
    mockGetToken.mockResolvedValue("existingtoken");
    const event = liveEvent();

    const share = await createWorkoutShare(event, 42);

    expect(share).toMatchObject({ token: "existingtoken", created: false });
    // Re-sharing refreshes the cache so the existing link redeems against
    // current data (and current privacy), not a stale snapshot.
    expect(putCachedDetail).toHaveBeenCalledWith(event.platform.env.DB, 7, detail);
  });
});

describe("loadSharedWorkout — D1 redemption path re-checks privacy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a token whose cached D1 payload is no longer public", async () => {
    (getCachedDetailByShareToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 9,
      privacy: "private",
    } as unknown as WorkoutDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = { platform: { env: { DB: {} } } } as any;

    await expect(loadSharedWorkout(event, "a".repeat(48))).rejects.toMatchObject({ status: 403 });
  });
});
