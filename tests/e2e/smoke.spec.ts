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
	test('language picker switches dashboard copy', async ({ page }) => {
		const errors = collectPageErrors(page);

		await page.goto('/dashboard');
		// LanguagePicker appears twice (desktop masthead + mobile dialog); count one.
		await expect(page.locator('.lang-picker').first().locator('select option')).toHaveCount(6);
		const langSelect = page.locator('.lang-picker select').first();
		// WebKit can miss Playwright's selectOption before hydration; dispatch change explicitly.
		await langSelect.evaluate((el) => {
			const select = el as HTMLSelectElement;
			select.value = 'de';
			select.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await expect(langSelect).toHaveValue('de');
		await expect(
			page.getByRole('heading', { name: /Ergebnisse & Replays/ })
		).toBeVisible();

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('dashboard loads cleanly and lists workouts', async ({ page }) => {
		const errors = collectPageErrors(page);

		const res = await page.goto('/dashboard');
		expect(res?.ok(), 'GET /dashboard should be 2xx').toBeTruthy();

		await expect(page.getByRole('heading', { name: /Results & replays|成绩与回放/ })).toBeVisible();
		await expect(
			page.getByText(/Season goals|赛季目标/)
		).toBeVisible();
		await expect(page.getByRole('link', { name: /rowplay/i })).toBeVisible();
		// Critical-power panel (Task 4) — must render in demo mode.
		await expect(
			page.getByText(/Critical power & pace predictor|临界功率与配速预测/)
		).toBeVisible();
		await expect(page.getByText(/What can I hold\?|我能维持多少？/)).toBeVisible();
		// The workout list must render at least one replay link.
		await expect(page.locator('a[href^="/replay/"]').first()).toBeVisible();

		// Let post-hydration effects run, then assert a clean console.
		await page.waitForTimeout(500);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('dashboard hierarchy keeps workouts before advanced analysis and hints persist dismissal', async ({ page }) => {
		const errors = collectPageErrors(page);

		await page.goto('/dashboard');
		const tour = page.locator('[data-e2e="dashboard-tour"]');
		await expect(tour.getByRole('heading', { name: /Try this first/ })).toBeVisible();
		await expect(tour.locator('a[href^="/replay/"]').first()).toBeVisible();
		await expect(tour.locator('a[href="/dashboard#critical-power"]')).toBeVisible();
		await expect(tour.locator('a[href="/dashboard#workout-filters"]')).toBeVisible();
		await expect(tour.locator('a[href^="/leaderboard"]')).toBeVisible();

		const order = await page.locator('[data-e2e="latest-replay"], [data-e2e="workout-section"], [data-e2e="advanced-section"]').evaluateAll((els) =>
			els.map((el) => {
				const rect = el.getBoundingClientRect();
				return rect.top + window.scrollY;
			})
		);
		expect(order).toHaveLength(3);
		expect(order[0]).toBeLessThan(order[1]);
		expect(order[1]).toBeLessThan(order[2]);

		const overflow = await page.evaluate(() => {
			const viewport = document.documentElement.clientWidth;
			const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
				.map((el) => {
					const rect = el.getBoundingClientRect();
					return {
						tag: el.tagName.toLowerCase(),
						className: el.className.toString(),
						text: el.textContent?.trim().slice(0, 80) ?? '',
						left: Math.round(rect.left),
						right: Math.round(rect.right),
						width: Math.round(rect.width)
					};
				})
				.filter((item) => item.right > viewport + 1 || item.left < -1)
				.slice(0, 8);
			return {
				ok: document.documentElement.scrollWidth <= viewport + 1,
				viewport,
				scrollWidth: document.documentElement.scrollWidth,
				offenders
			};
		});
		expect(overflow.ok, JSON.stringify(overflow, null, 2)).toBe(true);

		await tour.getByRole('button', { name: /^Dismiss$/ }).click();
		await expect(tour).toBeHidden();
		await page.reload();
		await expect(page.locator('[data-e2e="dashboard-tour"]')).toBeHidden();

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('replay pace-boat rival shows live gap readout', async ({ page }) => {
		const errors = collectPageErrors(page);

		await page.goto('/replay/1005');
		await expect(page.locator('canvas').first()).toBeVisible();

		await page.getByRole('button', { name: /A constant pace|恒定配速/ }).click();
		await page.getByRole('button', { name: /Set pace|设定配速/ }).click();

		const gap = page.locator('.gap[role="status"]');
		await expect(gap).toBeVisible();
		await expect(gap).toContainText(/ahead|behind|领先|落后/);

		await page.waitForTimeout(300);
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

	test('workout list filters update the URL and narrow results', async ({ page }) => {
		const errors = collectPageErrors(page);

		await page.goto('/dashboard');
		await page.getByRole('button', { name: /More filters|更多筛选/ }).click();
		await page.getByRole('button', { name: /^2k$/ }).click();
		await expect(page).toHaveURL(/[?&]dist=2000/);

		await page.getByRole('group', { name: /Sort|排序/ }).getByRole('button', { name: /Pace|配速/ }).click();
		await expect(page).toHaveURL(/[?&]sort=pace/);

		await expect(page.locator('a[href^="/replay/"]').first()).toBeVisible();

		await page.waitForTimeout(400);
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

		await expect(page.getByRole('heading', { name: /^Use your Concept2 token$/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: /How rowplay handles the token/i })).toBeVisible();
		await expect(page.locator('input[name="token"]')).toBeVisible();

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
