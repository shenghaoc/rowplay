import { describe, expect, it } from "vite-plus/test";
import { getConfig } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeEvent(env: Record<string, string | undefined> = {}): any {
  return {
    platform: { env },
    request: { url: "https://rowplay.example.com/dashboard" },
  };
}

describe("getConfig", () => {
  it("reads clientId and clientSecret from the platform env", () => {
    const cfg = getConfig(fakeEvent({ CONCEPT2_CLIENT_ID: "cid", CONCEPT2_CLIENT_SECRET: "sec" }));
    expect(cfg.clientId).toBe("cid");
    expect(cfg.clientSecret).toBe("sec");
  });

  it("falls back to empty strings when env values are absent", () => {
    const cfg = getConfig(fakeEvent());
    expect(cfg.clientId).toBe("");
    expect(cfg.clientSecret).toBe("");
  });

  it("uses CONCEPT2_BASE_URL from env when present", () => {
    const cfg = getConfig(fakeEvent({ CONCEPT2_BASE_URL: "https://staging.concept2.com" }));
    expect(cfg.baseUrl).toBe("https://staging.concept2.com");
  });

  it("defaults baseUrl to the Concept2 production log URL", () => {
    const cfg = getConfig(fakeEvent());
    expect(cfg.baseUrl).toBe("https://log.concept2.com");
  });

  it("uses PUBLIC_APP_URL from env when present", () => {
    const cfg = getConfig(fakeEvent({ PUBLIC_APP_URL: "https://rowplay.shenghaoc.workers.dev" }));
    expect(cfg.appUrl).toBe("https://rowplay.shenghaoc.workers.dev");
  });

  it("falls back to the request origin when PUBLIC_APP_URL is absent", () => {
    const cfg = getConfig(fakeEvent());
    expect(cfg.appUrl).toBe("https://rowplay.example.com");
  });
});
