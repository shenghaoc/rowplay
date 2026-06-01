/** Default age limit for cached workout detail before re-hydration from Concept2. */
export const DETAIL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DetailCacheEnv = {
	DETAIL_CACHE_TTL_DAYS?: string;
};

/** Resolve TTL from Worker vars, falling back to {@link DETAIL_CACHE_TTL_MS}. */
export function detailCacheTtlMs(env?: DetailCacheEnv): number {
	const raw = env?.DETAIL_CACHE_TTL_DAYS?.trim();
	if (!raw) return DETAIL_CACHE_TTL_MS;
	const days = Number.parseInt(raw, 10);
	if (!Number.isFinite(days) || days <= 0) return DETAIL_CACHE_TTL_MS;
	return days * MS_PER_DAY;
}

/** True when `cachedAt` is still within the TTL window (inclusive at the boundary). */
export function isDetailCacheFresh(
	cachedAt: number | null | undefined,
	nowMs: number,
	ttlMs: number = DETAIL_CACHE_TTL_MS
): boolean {
	if (typeof cachedAt !== 'number' || !Number.isFinite(cachedAt) || !Number.isFinite(nowMs) || ttlMs <= 0) return false;
	return nowMs - cachedAt <= ttlMs;
}
