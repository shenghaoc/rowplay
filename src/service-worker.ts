/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { base, build, files, version } from "$service-worker";
import {
  isManagedServiceWorkerCache,
  REPLAY_MODEL_CACHE_PREFIX,
  replayAssetCacheStrategy,
  shouldCacheResponse,
} from "./serviceWorkerPolicy";

// `self` is typed as Window in the default lib; inside a service worker it is
// a ServiceWorkerGlobalScope. This is the cast SvelteKit's docs prescribe.
const sw = self as unknown as ServiceWorkerGlobalScope;

/** Precached shell — versioned so activate can drop stale shells. */
const SHELL_CACHE = `shell-${version}`;
const PAGES_CACHE = `pages-${version}`;
const API_CACHE = `api-${version}`;
const REPLAY_MODEL_CACHE = `${REPLAY_MODEL_CACHE_PREFIX}${version}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, PAGES_CACHE, API_CACHE, REPLAY_MODEL_CACHE]);

const SHELL_ASSETS = [...build, ...files];

/** App routes that should work offline after a prior visit. */
const OFFLINE_PATHS = ["/dashboard", "/replay"];

function isOfflinePage(pathname: string): boolean {
  const clean = pathname.replace(/\/__data\.json$/, "");
  return OFFLINE_PATHS.some((p) => clean === p || clean.startsWith(`${p}/`));
}

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => {
        // First install: take control immediately. Updates wait for the user toast.
        if (!sw.registration.active) return sw.skipWaiting();
      }),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => isManagedServiceWorkerCache(key) && !CURRENT_CACHES.has(key))
          .map((key) => caches.delete(key)),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void sw.skipWaiting();
  }
  if (event.data?.type === "CLEAR_USER_CACHES") {
    event.waitUntil(Promise.all([caches.delete(PAGES_CACHE), caches.delete(API_CACHE)]));
  }
});

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  // Authored 3D meshes are deliberately omitted from the install-time shell.
  // Network-first lets a healthy response replace a malformed cached HTTP-200
  // payload; the versioned runtime cache remains the offline fallback.
  if (
    request.mode !== "navigate" &&
    replayAssetCacheStrategy(url.pathname, base) === "network-first"
  ) {
    event.respondWith(networkFirst(request, REPLAY_MODEL_CACHE));
    return;
  }

  // App shell + static files: cache-first.
  if (request.mode !== "navigate" && SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Workout detail JSON: network-first, fall back to cache (ghost + offline replay data).
  if (url.pathname.startsWith("/api/workouts/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // SSR pages: network-first so fresh data wins; cache for offline revisit.
  // NOTE: authenticated SSR pages set cache-control: private, no-store (see
  // page.server.ts load functions). The service worker honours that header,
  // so authenticated offline visits will receive a 503 — by design. Demo-mode
  // users (no session) still get full offline support.
  if (request.mode === "navigate" && isOfflinePage(url.pathname)) {
    event.respondWith(networkFirst(request, PAGES_CACHE, { ignoreSearch: true }));
    return;
  }

  // SvelteKit data requests for offline routes (e.g. /replay/1005/__data.json).
  if (isOfflinePage(url.pathname) && url.pathname.endsWith("/__data.json")) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
  }
});

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  try {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch((err: unknown) => {
        console.warn("[sw] cache put failed in cacheFirst:", err);
      });
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function networkFirst(
  request: Request,
  cacheName: string,
  options?: CacheQueryOptions,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Respect cache-control: private / no-store headers so authenticated data
    // is never persisted in the origin-wide Cache API. Normalized to
    // lowercase for case-insensitive matching.
    if (response.ok && shouldCacheResponse(response.headers.get("cache-control"))) {
      // Fire-and-forget cache write — if it fails, we still have the valid
      // network response. Using event.waitUntil would be ideal but isn't
      // available in this helper; the caught error is logged and dropped.
      cache.put(request, response.clone()).catch((err: unknown) => {
        console.warn("[sw] cache put failed, serving fresh response anyway:", err);
      });
    }
    return response;
  } catch {
    const hit = await cache.match(request, options);
    if (hit) return hit;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
