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

		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
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
		await expect(page.locator('canvas')).toBeVisible();

		await page.waitForTimeout(500);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
