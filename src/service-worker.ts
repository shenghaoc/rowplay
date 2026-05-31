/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

/** Precached shell — versioned so activate can drop stale shells. */
const SHELL_CACHE = `shell-${version}`;
const PAGES_CACHE = 'pages-v1';
const API_CACHE = 'api-v1';

const SHELL_ASSETS = [...build, ...files];

/** App routes that should work offline after a prior visit. */
const OFFLINE_PATHS = ['/dashboard', '/replay/'];

function isOfflinePage(pathname: string): boolean {
	return OFFLINE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL_CACHE)
			.then((cache) => cache.addAll(SHELL_ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith('shell-') && key !== SHELL_CACHE)
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

async function networkFirst(request: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	try {
		const response = await fetch(request);
		if (response.ok) await cache.put(request, response.clone());
		return response;
	} catch {
		const hit = await cache.match(request);
		if (hit) return hit;
		return new Response('Offline', { status: 503, statusText: 'Offline' });
	}
}
