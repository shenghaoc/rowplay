/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

/** Precached shell — versioned so activate can drop stale shells. */
const SHELL_CACHE = `shell-${version}`;
const PAGES_CACHE = `pages-${version}`;
const API_CACHE = `api-${version}`;

const SHELL_ASSETS = [...build, ...files];

/** App routes that should work offline after a prior visit. */
const OFFLINE_PATHS = ['/dashboard', '/replay'];

function isOfflinePage(pathname: string): boolean {
	const clean = pathname.replace(/\/__data\.json$/, '');
	return OFFLINE_PATHS.some((p) => clean === p || clean.startsWith(`${p}/`));
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => {
			// First install: take control immediately. Updates wait for the user toast.
			if (!self.registration.active) return self.skipWaiting();
		})
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) =>
						(key.startsWith('shell-') || key.startsWith('pages-') || key.startsWith('api-')) &&
						key !== SHELL_CACHE && key !== PAGES_CACHE && key !== API_CACHE
					)
					.map((key) => caches.delete(key))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
	if (event.data?.type === 'CLEAR_USER_CACHES') {
		event.waitUntil(
			Promise.all([caches.delete(PAGES_CACHE), caches.delete(API_CACHE)])
		);
	}
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// App shell + static files: cache-first.
	if (request.mode !== 'navigate' && SHELL_ASSETS.includes(url.pathname)) {
		event.respondWith(cacheFirst(request, SHELL_CACHE));
		return;
	}

	// Workout detail JSON: network-first, fall back to cache (ghost + offline replay data).
	if (url.pathname.startsWith('/api/workouts/')) {
		event.respondWith(networkFirst(request, API_CACHE));
		return;
	}

	// SSR pages: network-first so fresh data wins; cache for offline revisit.
	if (request.mode === 'navigate' && isOfflinePage(url.pathname)) {
		event.respondWith(networkFirst(request, PAGES_CACHE, { ignoreSearch: true }));
		return;
	}

	// SvelteKit data requests for offline routes (e.g. /replay/1005/__data.json).
	if (isOfflinePage(url.pathname) && url.pathname.endsWith('/__data.json')) {
		event.respondWith(networkFirst(request, PAGES_CACHE));
	}
});

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

async function networkFirst(request: Request, cacheName: string, options?: CacheQueryOptions): Promise<Response> {
	const cache = await caches.open(cacheName);
	try {
		const response = await fetch(request);
		// Respect cache-control: private / no-store headers so authenticated data
		// is never persisted in the origin-wide Cache API.
		const cc = response.headers.get('cache-control') ?? '';
		if (response.ok && !cc.includes('no-store') && !cc.includes('private')) {
			await cache.put(request, response.clone());
		}
		return response;
	} catch {
		const hit = await cache.match(request, options);
		if (hit) return hit;
		return new Response('Offline', { status: 503, statusText: 'Offline' });
	}
}
