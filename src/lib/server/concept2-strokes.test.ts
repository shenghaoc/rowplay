import { describe, expect, it } from "vite-plus/test";
import {
  buildAuthorizeUrl,
  mapHeartRate,
  mapResult,
  mapSplits,
  mapStrokes,
  mapTargets,
  redirectUri,
} from "./concept2";
import type { Concept2Config } from "./concept2";

const cfg: Concept2Config = {
  clientId: "test-client-id",
  clientSecret: "test-secret",
  baseUrl: "https://log.concept2.com",
  appUrl: "https://rowplay.example.com",
};

describe("redirectUri", () => {
  it("appends /auth/callback to the app URL", () => {
    expect(redirectUri(cfg)).toBe("https://rowplay.example.com/auth/callback");
  });

  it("strips a trailing slash from appUrl before appending", () => {
    const trailingSlash = { ...cfg, appUrl: "https://rowplay.example.com/" };
    expect(redirectUri(trailingSlash)).toBe("https://rowplay.example.com/auth/callback");
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds a URL pointing at the base URL OAuth endpoint", () => {
    const url = buildAuthorizeUrl(cfg, "csrf-state");
    expect(url).toContain("https://log.concept2.com/oauth/authorize");
  });

  it("includes client_id in the query string", () => {
    const url = buildAuthorizeUrl(cfg, "state");
    expect(url).toContain("client_id=test-client-id");
  });

  it("includes the state parameter", () => {
    const url = buildAuthorizeUrl(cfg, "my-csrf-token");
    expect(url).toContain("state=my-csrf-token");
  });

  it("includes response_type=code", () => {
    expect(buildAuthorizeUrl(cfg, "state")).toContain("response_type=code");
  });

  it("includes the redirect_uri", () => {
    const url = new URL(buildAuthorizeUrl(cfg, "state"));
    expect(url.searchParams.get("redirect_uri")).toBe("https://rowplay.example.com/auth/callback");
  });

  it("includes the scope parameter", () => {
    const url = buildAuthorizeUrl(cfg, "state");
    expect(url).toContain("scope=");
  });
});

describe("mapStrokes", () => {
  const raw = [
    { t: 0, d: 0, p: 1200, spm: 28 },
    { t: 100, d: 500, p: 1180, spm: 30 },
    { t: 200, d: 1000, p: 1160, spm: 32 },
  ];

  it("converts tenths of seconds to seconds", () => {
    const strokes = mapStrokes(raw, "rower");
    expect(strokes[0].t).toBe(0);
    expect(strokes[1].t).toBe(10);
    expect(strokes[2].t).toBe(20);
  });

  it("converts decimetres to metres", () => {
    const strokes = mapStrokes(raw, "rower");
    expect(strokes[0].d).toBe(0);
    expect(strokes[1].d).toBe(50);
    expect(strokes[2].d).toBe(100);
  });

  it("converts pace tenths to sec/500m for rower", () => {
    const strokes = mapStrokes(raw, "rower");
    expect(strokes[0].pace).toBe(120); // 1200 / 10 / 1
    expect(strokes[1].pace).toBe(118);
  });

  it("halves pace for bike (per-1000m → per-500m)", () => {
    const strokes = mapStrokes(raw, "bike");
    expect(strokes[0].pace).toBe(60); // 1200 / 10 / 2
    expect(strokes[1].pace).toBe(59);
  });

  it("keeps rower/skierg pace unmodified (÷ 1)", () => {
    const rowPace = mapStrokes(raw, "rower")[0].pace;
    const skiPace = mapStrokes(raw, "skierg")[0].pace;
    expect(rowPace).toBe(skiPace);
  });

  it("maps spm directly", () => {
    const strokes = mapStrokes(raw, "rower");
    expect(strokes[0].spm).toBe(28);
    expect(strokes[1].spm).toBe(30);
  });

  it("preserves heart rate when present", () => {
    const withHr = [{ t: 0, d: 0, p: 1200, spm: 28, hr: 145 }];
    expect(mapStrokes(withHr, "rower")[0].hr).toBe(145);
  });

  it("returns undefined hr when hr is 0 or absent", () => {
    const noHr = [{ t: 0, d: 0, p: 1200, spm: 28, hr: 0 }];
    expect(mapStrokes(noHr, "rower")[0].hr).toBeUndefined();

    const missingHr = [{ t: 0, d: 0, p: 1200, spm: 28 }];
    expect(mapStrokes(missingHr, "rower")[0].hr).toBeUndefined();
  });

  it("handles interval resets: t or d going backwards resets offset", () => {
    const intervalRaw = [
      // Interval 1
      { t: 0, d: 0, p: 1200, spm: 28 },
      { t: 100, d: 500, p: 1180, spm: 30 },
      // Interval 2 — counter resets
      { t: 0, d: 0, p: 1220, spm: 27 },
      { t: 100, d: 500, p: 1200, spm: 29 },
    ];
    const strokes = mapStrokes(intervalRaw, "rower");
    // After the first interval ends at t=10s, the second starts at offset 10s
    expect(strokes[2].t).toBeGreaterThanOrEqual(strokes[1].t);
    expect(strokes[3].t).toBeGreaterThan(strokes[2].t);
    // Distance should also be monotonically non-decreasing
    expect(strokes[2].d).toBeGreaterThanOrEqual(strokes[1].d);
  });

  it("computes watts from pace", () => {
    const strokes = mapStrokes(raw, "rower");
    for (const s of strokes) {
      expect(s.watts).toBeGreaterThan(0);
    }
  });

  it("stores raw t/d fields for the inspector", () => {
    const strokes = mapStrokes(raw, "rower");
    expect(strokes[0].rawT).toBe(0);
    expect(strokes[1].rawT).toBe(10); // tenths = 100/10
    expect(strokes[1].rawD).toBe(50); // decimetres = 500/10
  });
});

const resultBase = {
  id: 42,
  date: "2026-05-01 06:00:00",
  type: "rower" as const,
  distance: 2000,
  time: 4800,
  stroke_data: true,
};

describe("mapResult date_utc and units", () => {
  it("copies Concept2 date_utc onto dateUtc", () => {
    const w = mapResult({ ...resultBase, date_utc: "2026-05-01T10:00:00Z" });
    expect(w.dateUtc).toBe("2026-05-01T10:00:00Z");
  });

  it("treats a null or omitted date_utc as undefined", () => {
    expect(mapResult({ ...resultBase, date_utc: null }).dateUtc).toBeUndefined();
    expect(mapResult(resultBase).dateUtc).toBeUndefined();
  });

  it("converts tenths of a second to seconds and derives pace per 500m", () => {
    const w = mapResult(resultBase);
    expect(w.time).toBe(480);
    expect(w.pace).toBe(120);
    expect(w.hasStrokeData).toBe(true);
  });

  it("stores pace 0 when distance is 0 so watts stay defined", () => {
    const w = mapResult({ ...resultBase, distance: 0, time: 600 });
    expect(w.pace).toBe(0);
  });
});

describe("mapHeartRate empty and rest", () => {
  it("returns undefined for an empty heart-rate object", () => {
    expect(mapHeartRate({})).toBeUndefined();
  });

  it("keeps split-level rest bpm", () => {
    expect(mapHeartRate({ rest: 92 })).toEqual({ rest: 92 });
  });
});

describe("mapTargets empty payload", () => {
  it("returns undefined when every target field is absent", () => {
    expect(mapTargets({}, "rower")).toBeUndefined();
  });
});

describe("mapSplits rest, types, and source preference", () => {
  it("converts rest_time tenths and keeps calorie/wattminute interval types", () => {
    const splits = mapSplits({
      ...resultBase,
      workout: {
        intervals: [
          { distance: 500, time: 1200, type: "calorie", rest_time: 300, rest_distance: 0 },
          { distance: 0, time: 600, type: "wattminute" },
          { distance: 250, time: 800, type: "unknown" },
        ],
      },
    });
    expect(splits[0].restTime).toBe(30);
    expect(splits[0].type).toBe("calorie");
    expect(splits[1].type).toBe("wattminute");
    expect(splits[1].isRest).toBe(true);
    expect(splits[2].type).toBeUndefined();
  });

  it("prefers workout.splits over intervals when both are present", () => {
    const splits = mapSplits({
      ...resultBase,
      workout: {
        splits: [{ distance: 2000, time: 4800, type: "distance" }],
        intervals: [{ distance: 500, time: 1200, type: "time" }],
      },
    });
    expect(splits).toHaveLength(1);
    expect(splits[0].distance).toBe(2000);
    expect(splits[0].type).toBe("distance");
  });
});
