import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/hr-watch.csv');

test.describe('heart-rate import', () => {
	test('demo workout without logbook HR can import watch file', async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
		});
		page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

		await page.goto('/replay/1002');
		await page.evaluate(() => localStorage.removeItem('rowplay:hr-import:1002'));
		await page.reload();
		await expect(page.getByText(/Import heart rate|导入心率/)).toBeVisible();

		const fileInput = page.locator('.hrimport input[type="file"]');
		await fileInput.setInputFiles(fixture);
		await expect(page.getByRole('button', { name: /Apply heart rate|应用心率/ })).toBeVisible();
		await page.getByRole('button', { name: /Apply heart rate|应用心率/ }).click();

		await expect(page.getByText(/Heart rate|心率/).first()).toBeVisible();
		await expect(page.locator('.gauges').getByText(/bpm/i)).toBeVisible();

		await page.waitForTimeout(400);
		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
