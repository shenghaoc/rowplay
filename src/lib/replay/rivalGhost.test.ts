import { describe, expect, it } from "vite-plus/test";
import { mockWorkoutDetail } from "../mockData";
import { DEMO_RIVAL_OTTER_TOKEN } from "../mockLeaderboard";
import { buildRaceDeepLink, isShareToken, toRivalGhostTrace } from "./rivalGhost";

describe("isShareToken", () => {
  it("accepts 48-char hex tokens", () => {
    expect(isShareToken(DEMO_RIVAL_OTTER_TOKEN)).toBe(true);
  });

  it("rejects invalid tokens", () => {
    expect(isShareToken("")).toBe(false);
    expect(isShareToken("not-hex")).toBe(false);
    expect(isShareToken("g".repeat(48))).toBe(false);
  });
});

describe("toRivalGhostTrace", () => {
  it("includes strokes and public metrics only", () => {
    const detail = mockWorkoutDetail(1007)!;
    const trace = toRivalGhostTrace(detail);
    expect(trace.strokes.length).toBeGreaterThan(0);
    expect(trace.sport).toBe("rower");
    expect(trace.distance).toBe(2000);
    expect(trace).not.toHaveProperty("id");
    expect(trace).not.toHaveProperty("comments");
  });
});

describe("buildRaceDeepLink", () => {
  it("includes ghostToken when shareToken is set", () => {
    const url = buildRaceDeepLink(1001, {
      pace: 108,
      displayName: "Otter",
      shareToken: DEMO_RIVAL_OTTER_TOKEN,
    });
    expect(url).toMatch(/^\/replay\/1001\?/);
    expect(url).toContain("ghostToken=");
    expect(url).toContain("ghostPace=108");
    expect(url).toContain("ghostName=Otter");
  });

  it("omits ghostToken when not shared", () => {
    const url = buildRaceDeepLink(1001, { pace: 110, displayName: "Heron" });
    expect(url).not.toContain("ghostToken=");
    expect(url).toContain("ghostPace=110");
  });
});
