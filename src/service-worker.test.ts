import { describe, expect, it } from "vite-plus/test";
import { shouldPrecacheStaticFile } from "../svelte.config.js";
import {
  isManagedServiceWorkerCache,
  isReplayAssetPath,
  replayAssetCacheStrategy,
  shouldCacheResponse,
} from "./serviceWorkerPolicy";

/**
 * Test the service worker's cache-control filter logic (extracted for
 * testability). The core invariant: networkFirst must not cache responses
 * with `no-store` or `private` in cache-control.
 *
 * The actual service-worker.ts runs in a ServiceWorkerGlobalScope which
 * Vitest can't easily simulate, so we extract and test the filtering logic.
 */

describe("service-worker cache eligibility", () => {
  it("caches responses with public cache-control", () => {
    expect(shouldCacheResponse("public, max-age=3600")).toBe(true);
  });

  it("caches responses with no cache-control header", () => {
    expect(shouldCacheResponse(null)).toBe(true);
    expect(shouldCacheResponse("")).toBe(true);
  });

  it("does NOT cache responses with private", () => {
    expect(shouldCacheResponse("private, no-store")).toBe(false);
    expect(shouldCacheResponse("private")).toBe(false);
  });

  it("does NOT cache responses with no-store", () => {
    expect(shouldCacheResponse("no-store")).toBe(false);
    expect(shouldCacheResponse("no-cache, no-store")).toBe(false);
  });

  it("does NOT cache responses with stale-while-revalidate but also private", () => {
    expect(shouldCacheResponse("private, max-age=0, stale-while-revalidate=86400")).toBe(false);
  });

  it("handles case-insensitive cache-control values", () => {
    expect(shouldCacheResponse("Private, No-Store")).toBe(false);
    expect(shouldCacheResponse("PRIVATE")).toBe(false);
    expect(shouldCacheResponse("NO-STORE")).toBe(false);
    expect(shouldCacheResponse("Public, Max-Age=3600")).toBe(true);
  });
});

describe("replay asset cache policy", () => {
  it("omits 3D-only models from the install-time shell", () => {
    expect(shouldPrecacheStaticFile("replay-assets/rowplay-rigs-v1.glb")).toBe(false);
    expect(shouldPrecacheStaticFile("favicon.svg")).toBe(true);
    expect(shouldPrecacheStaticFile(".DS_Store")).toBe(false);
  });

  it("recognizes replay models with and without a deployment base path", () => {
    expect(isReplayAssetPath("/replay-assets/rowplay-rigs-v1.glb", "")).toBe(true);
    expect(isReplayAssetPath("/rowplay/replay-assets/rowplay-rigs-v1.glb", "/rowplay")).toBe(true);
    expect(isReplayAssetPath("/rowplay/replay/1001", "/rowplay")).toBe(false);
  });

  it("uses network-first so a healthy model can replace a malformed cached response", () => {
    expect(replayAssetCacheStrategy("/replay-assets/rowplay-rigs-v1.glb", "")).toBe(
      "network-first",
    );
    expect(replayAssetCacheStrategy("/rowplay/replay-assets/rowplay-rigs-v1.glb", "/rowplay")).toBe(
      "network-first",
    );
    expect(replayAssetCacheStrategy("/rowplay/replay/1001", "/rowplay")).toBeNull();
  });

  it("owns versioned replay-model caches during activation cleanup", () => {
    expect(isManagedServiceWorkerCache("replay-models-old-version")).toBe(true);
    expect(isManagedServiceWorkerCache("shell-old-version")).toBe(true);
    expect(isManagedServiceWorkerCache("third-party-cache")).toBe(false);
  });
});

describe("CLEAR_USER_CACHES message format", () => {
  it("has the expected message type", () => {
    const message = { type: "CLEAR_USER_CACHES" };
    expect(message.type).toBe("CLEAR_USER_CACHES");
  });
});
