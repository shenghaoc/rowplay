import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DEFAULT_LIVE_PREFS,
  effectiveIntervalSec,
  loadLivePrefs,
  nextBackoffMs,
  randomMockDelayMs,
  saveLivePrefs,
  type LiveModePrefs,
} from "./liveMode";

afterEach(() => {
  vi.unstubAllGlobals();
});

function installPrefsStore(raw?: string) {
  const store = new Map<string, string>();
  if (raw != null) store.set("live_mode_prefs", raw);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  return store;
}

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
    expect(effectiveIntervalSec(300, false)).toBe(300);
    expect(effectiveIntervalSec(600, false)).toBe(600);
  });

  it("does not back off before the first failure", () => {
    expect(nextBackoffMs(-1)).toBe(0);
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

  it("falls back to a 60s poll when stored JSON or the interval is unsafe", () => {
    installPrefsStore("{");
    expect(loadLivePrefs()).toEqual(DEFAULT_LIVE_PREFS);

    installPrefsStore(
      JSON.stringify({
        enabled: true,
        intervalSec: 1,
        soundEnabled: false,
        source: "poll",
      }),
    );
    expect(loadLivePrefs().intervalSec).toBe(60);

    installPrefsStore(
      JSON.stringify({
        enabled: true,
        intervalSec: "15",
        soundEnabled: false,
        source: "push",
      }),
    );
    const rejected = loadLivePrefs();
    expect(rejected.intervalSec).toBe(60);
    expect(rejected.source).toBe("poll");
  });

  it("keeps an allow-listed interval and the webhook source", () => {
    installPrefsStore(
      JSON.stringify({
        enabled: 1,
        intervalSec: "120",
        soundEnabled: 1,
        source: "webhook",
      }),
    );
    expect(loadLivePrefs()).toEqual({
      enabled: true,
      intervalSec: 120,
      soundEnabled: true,
      source: "webhook",
    } satisfies LiveModePrefs);
  });

  it("sets the Secure cookie flag only for https", () => {
    installPrefsStore();
    const prefs: LiveModePrefs = {
      enabled: true,
      intervalSec: 30,
      soundEnabled: false,
      source: "poll",
    };

    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("location", { protocol: "http:" });
    saveLivePrefs({ ...prefs, enabled: false });
    expect(document.cookie).toBe("live_mode=0; Path=/; Max-Age=31536000; SameSite=Lax");

    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("location", { protocol: "https:" });
    saveLivePrefs(prefs);
    expect(document.cookie).toBe("live_mode=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });
});
