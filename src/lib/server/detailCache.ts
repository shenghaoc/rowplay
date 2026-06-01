/** Default age limit for cached workout detail before re-hydration from Concept2. */
export const DETAIL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DetailCacheEnv = {
	DETAIL_CACHE_TTL_DAYS?: string;
};

/**
 * Resolve TTL from Worker vars, falling back to {@link DETAIL_CACHE_TTL_MS}.
 * `DETAIL_CACHE_TTL_DAYS` is parsed as whole days — a fractional value like
 * `"3.7"` truncates to 3 (Number.parseInt); operators should set an integer.
 */
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
	// Reject a negative cachedAt explicitly: putCachedDetail always writes
	// nowEpochMillis() (>= 0), so a negative value is corrupt — treat it as a
	// miss (re-fetch) rather than letting the arithmetic decide implicitly.
	if (typeof cachedAt !== 'number' || !Number.isFinite(cachedAt) || cachedAt < 0 || !Number.isFinite(nowMs) || ttlMs <= 0)
		return false;
	return nowMs - cachedAt <= ttlMs;
}
