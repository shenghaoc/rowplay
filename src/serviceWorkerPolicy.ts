export const REPLAY_MODEL_CACHE_PREFIX = "replay-models-";

export type ReplayAssetCacheStrategy = "network-first";

const MANAGED_CACHE_PREFIXES = ["shell-", "pages-", "api-", REPLAY_MODEL_CACHE_PREFIX] as const;

export function isReplayAssetPath(pathname: string, base: string): boolean {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return pathname.startsWith(`${normalizedBase}/replay-assets/`);
}

/**
 * Authored models use network-first so a later healthy response can replace a
 * malformed HTTP-200 payload. The versioned cache remains the offline fallback.
 */
export function replayAssetCacheStrategy(
  pathname: string,
  base: string,
): ReplayAssetCacheStrategy | null {
  return isReplayAssetPath(pathname, base) ? "network-first" : null;
}

export function isManagedServiceWorkerCache(cacheName: string): boolean {
  return MANAGED_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));
}

export function shouldCacheResponse(cacheControl: string | null): boolean {
  const normalized = (cacheControl ?? "").toLowerCase();
  return !normalized.includes("no-store") && !normalized.includes("private");
}
