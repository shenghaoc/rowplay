import { expect, test, type Page } from '@playwright/test';

function collectPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
	});
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	return errors;
}

test.describe('history windowing', () => {
	test('demo sync-status affordance shows demo badge', async ({ page }) => {
		const errors = collectPageErrors(page);

		await page.goto('/dashboard');
		// Dashboard sync-status line (not the masthead badge, which is hidden in the mobile nav).
		await expect(page.locator('.syncnote .badge')).toBeVisible();

		await page.goto('/settings');
		await expect(page.getByTestId('settings-sync-demo-badge')).toBeVisible();

		await page.waitForTimeout(300);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
