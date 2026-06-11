import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_LIVE_PREFS,
  effectiveIntervalSec,
  loadLivePrefs,
  nextBackoffMs,
  randomMockDelayMs,
  saveLivePrefs,
} from "./liveMode";

describe("liveMode", () => {
  it("defaults to disabled with 1min interval", () => {
    expect(DEFAULT_LIVE_PREFS.enabled).toBe(false);
    expect(DEFAULT_LIVE_PREFS.intervalSec).toBe(60);
  });

  it("computes exponential backoff", () => {
    expect(nextBackoffMs(0)).toBe(0);
    expect(nextBackoffMs(1)).toBe(30_000);
    expect(nextBackoffMs(2)).toBe(60_000);
    expect(nextBackoffMs(3)).toBe(120_000);
    expect(nextBackoffMs(99)).toBe(300_000);
  });

  it("slows polling when tab is hidden", () => {
    expect(effectiveIntervalSec(30, true)).toBe(30);
    expect(effectiveIntervalSec(60, false)).toBe(300);
    expect(effectiveIntervalSec(120, false)).toBe(300);
  });

  it("persists and loads preferences", () => {
    const store = new Map<string, string>();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    // @ts-expect-error test stub
    globalThis.localStorage = ls;
    // @ts-expect-error test stub
    globalThis.document = { cookie: "" };
    // @ts-expect-error test stub
    globalThis.location = { protocol: "http:" };

    saveLivePrefs({ enabled: true, intervalSec: 30, soundEnabled: true, source: "poll" });
    const loaded = loadLivePrefs();
    expect(loaded.enabled).toBe(true);
    expect(loaded.intervalSec).toBe(30);
    expect(loaded.soundEnabled).toBe(true);
  });

  it("generates mock delay within bounds", () => {
    for (let i = 0; i < 20; i++) {
      const d = randomMockDelayMs();
      expect(d).toBeGreaterThanOrEqual(30_000);
      expect(d).toBeLessThan(180_000);
    }
  });
});
