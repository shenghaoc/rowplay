import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke: every key page must load on the real Workers runtime (demo mode) with
 * no console errors / uncaught exceptions, and render its defining content.
 *
 * The console-error guard is deliberate: a runtime effect loop in the workout
 * list once passed `svelte-check` clean yet threw effect_update_depth_exceeded
 * only in a browser. This catches that whole class of regression. Runs on both
 * the `webkit` (desktop Safari) and `webkit-mobile` (iPhone 14) projects.
 */

/** Attach error collectors before navigation; returns the accumulated list. */
function collectPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
	});
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	return errors;
}

test.describe('smoke', () => {
	test('dashboard loads cleanly and lists workouts', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/dashboard');
		expect(res?.ok(), 'GET /dashboard should be 2xx').toBeTruthy();

	await expect(page.getByRole('heading', { name: /Results & replays|成绩与回放/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /rowplay/i })).toBeVisible();
		// The workout list must render at least one replay link.
		await expect(page.locator('a[href^="/replay/"]').first()).toBeVisible();

		// Let post-hydration effects run, then assert a clean console.
		await page.waitForTimeout(500);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('replay loads cleanly and renders the course canvas', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/replay/1005'); // demo: 4x1500m intervals
		expect(res?.ok(), 'GET /replay/1005 should be 2xx').toBeTruthy();

		await expect(page.getByRole('link', { name: /rowplay/i })).toBeVisible();
		// The replay renders several canvases (course + uPlot charts); any one
		// visible means it mounted. `.first()` avoids a strict-mode violation.
		await expect(page.locator('canvas').first()).toBeVisible();

		await page.waitForTimeout(500);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('PWA manifest and service worker register', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/dashboard');
		expect(res?.ok(), 'GET /dashboard should be 2xx').toBeTruthy();

		const manifest = await page.evaluate(async () => {
			const link = document.querySelector('link[rel="manifest"]');
			if (!link) return null;
			const href = link.getAttribute('href');
			if (!href) return null;
			const r = await fetch(href);
			if (!r.ok) return null;
			return r.json() as Promise<{ name?: string; display?: string }>;
		});
		expect(manifest?.name).toBe('rowplay');
		expect(manifest?.display).toBe('standalone');

		await page.waitForFunction(
			async () => {
				if (!('serviceWorker' in navigator)) return false;
				const reg = await navigator.serviceWorker.getRegistration();
				return !!reg?.active;
			},
			undefined,
			{ timeout: 15_000 }
		);

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('service worker caches viewed replay for offline', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/replay/1005');
		expect(res?.ok()).toBeTruthy();
		await expect(page.locator('canvas').first()).toBeVisible();

		await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, {
			timeout: 15_000
		});
		// First navigation installs the SW; a reload is intercepted and cached.
		await page.reload({ waitUntil: 'load' });

		const cacheDump = await page.evaluate(async () => {
			const names = await caches.keys();
			const dump: Record<string, string[]> = {};
			for (const name of names) {
				dump[name] = (await caches.open(name).then((c) => c.keys())).map((r) => r.url);
			}
			return dump;
		});
		const cached = Object.values(cacheDump)
			.flat()
			.some((url) => url.includes('/replay/1005'));
		expect(cached, `replay SSR page should be cached; got ${JSON.stringify(cacheDump)}`).toBe(
			true
		);

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('settings page loads with export controls', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/settings');
		expect(res?.ok(), 'GET /settings should be 2xx').toBeTruthy();

		await expect(
			page.getByRole('heading', { name: /Account & data|账户与数据/ })
		).toBeVisible();
		await expect(page.getByRole('link', { name: /Download CSV|下载 CSV/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /Download JSON|下载 JSON/ })).toBeVisible();

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('compare page loads two workouts with overlay charts', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/compare?a=1001&b=1007');
		expect(res?.ok(), 'GET /compare should be 2xx').toBeTruthy();

		await expect(page.getByRole('heading', { name: /Compare workouts|训练对比/ })).toBeVisible();
		await expect(page.getByText(/Head-to-head stats|逐项对比/)).toBeVisible();
		await expect(page.locator('canvas').first()).toBeVisible();

		await page.waitForTimeout(500);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('token entry page renders its form', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/auth/token');
		expect(res?.ok(), 'GET /auth/token should be 2xx').toBeTruthy();

		await expect(page.getByRole('heading', { name: /token/i })).toBeVisible();
		await expect(page.locator('input[name="token"]')).toBeVisible();

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
