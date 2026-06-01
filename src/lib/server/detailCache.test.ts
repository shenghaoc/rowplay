import { describe, expect, it } from 'vitest';
import {
	DETAIL_CACHE_TTL_MS,
	detailCacheTtlMs,
	isDetailCacheFresh
} from './detailCache';

describe('detailCacheTtlMs', () => {
	it('defaults to seven days when env is absent', () => {
		expect(detailCacheTtlMs()).toBe(DETAIL_CACHE_TTL_MS);
		expect(detailCacheTtlMs({})).toBe(DETAIL_CACHE_TTL_MS);
	});

	it('parses DETAIL_CACHE_TTL_DAYS from env', () => {
		expect(detailCacheTtlMs({ DETAIL_CACHE_TTL_DAYS: '14' })).toBe(14 * 24 * 60 * 60 * 1000);
	});

	it('falls back on invalid override', () => {
		expect(detailCacheTtlMs({ DETAIL_CACHE_TTL_DAYS: '0' })).toBe(DETAIL_CACHE_TTL_MS);
		expect(detailCacheTtlMs({ DETAIL_CACHE_TTL_DAYS: 'nope' })).toBe(DETAIL_CACHE_TTL_MS);
		expect(detailCacheTtlMs({ DETAIL_CACHE_TTL_DAYS: '  ' })).toBe(DETAIL_CACHE_TTL_MS);
	});

	it('accepts a numeric override without crashing on .trim()', () => {
		expect(detailCacheTtlMs({ DETAIL_CACHE_TTL_DAYS: 14 })).toBe(14 * 24 * 60 * 60 * 1000);
		expect(detailCacheTtlMs({ DETAIL_CACHE_TTL_DAYS: 0 })).toBe(DETAIL_CACHE_TTL_MS);
		expect(detailCacheTtlMs({ DETAIL_CACHE_TTL_DAYS: -3 })).toBe(DETAIL_CACHE_TTL_MS);
	});
});

describe('isDetailCacheFresh', () => {
	const ttl = 7 * 24 * 60 * 60 * 1000;
	const cachedAt = 1_000_000;

	it('is fresh when age is strictly inside TTL', () => {
		expect(isDetailCacheFresh(cachedAt, cachedAt + ttl - 1, ttl)).toBe(true);
	});

	it('is fresh exactly at the TTL boundary', () => {
		expect(isDetailCacheFresh(cachedAt, cachedAt + ttl, ttl)).toBe(true);
	});

	it('is stale one millisecond past TTL', () => {
		expect(isDetailCacheFresh(cachedAt, cachedAt + ttl + 1, ttl)).toBe(false);
	});

	it('rejects non-finite timestamps', () => {
		expect(isDetailCacheFresh(Number.NaN, cachedAt + ttl, ttl)).toBe(false);
		expect(isDetailCacheFresh(cachedAt, Number.POSITIVE_INFINITY, ttl)).toBe(false);
	});

	it('rejects a negative cachedAt (corrupt row) as a miss', () => {
		expect(isDetailCacheFresh(-1, cachedAt + ttl, ttl)).toBe(false);
	});

	it('treats null/undefined cachedAt as a miss', () => {
		expect(isDetailCacheFresh(null, cachedAt, ttl)).toBe(false);
		expect(isDetailCacheFresh(undefined, cachedAt, ttl)).toBe(false);
	});

	it('treats future cachedAt as fresh (clock skew)', () => {
		expect(isDetailCacheFresh(cachedAt + 1000, cachedAt, ttl)).toBe(true);
	});
});
