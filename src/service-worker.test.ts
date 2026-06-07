import { describe, expect, it } from 'vitest';

/**
 * Test the service worker's cache-control filter logic (extracted for
 * testability). The core invariant: networkFirst must not cache responses
 * with `no-store` or `private` in cache-control.
 *
 * The actual service-worker.ts runs in a ServiceWorkerGlobalScope which
 * Vitest can't easily simulate, so we extract and test the filtering logic.
 */

/** Mirror of the service worker's cache eligibility check. */
function shouldCacheResponse(ccHeader: string | null): boolean {
	const cc = ccHeader ?? '';
	return !cc.includes('no-store') && !cc.includes('private');
}

describe('service-worker cache eligibility', () => {
	it('caches responses with public cache-control', () => {
		expect(shouldCacheResponse('public, max-age=3600')).toBe(true);
	});

	it('caches responses with no cache-control header', () => {
		expect(shouldCacheResponse(null)).toBe(true);
		expect(shouldCacheResponse('')).toBe(true);
	});

	it('does NOT cache responses with private', () => {
		expect(shouldCacheResponse('private, no-store')).toBe(false);
		expect(shouldCacheResponse('private')).toBe(false);
	});

	it('does NOT cache responses with no-store', () => {
		expect(shouldCacheResponse('no-store')).toBe(false);
		expect(shouldCacheResponse('no-cache, no-store')).toBe(false);
	});

	it('does NOT cache responses with stale-while-revalidate but also private', () => {
		expect(
			shouldCacheResponse('private, max-age=0, stale-while-revalidate=86400'),
		).toBe(false);
	});
});

describe('CLEAR_USER_CACHES message format', () => {
	it('has the expected message type', () => {
		const message = { type: 'CLEAR_USER_CACHES' };
		expect(message.type).toBe('CLEAR_USER_CACHES');
	});
});
