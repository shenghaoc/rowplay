import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/hr-watch.csv');

test.describe('heart-rate import', () => {
	// Applies HR then mounts several uPlot charts at once — keep off the parallel
	// worker grid so WebKit + wrangler are not fighting other specs for chunks.
	test.describe.configure({ mode: 'serial' });

	test('demo workout without logbook HR can import watch file', async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
		});
		page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

		await page.goto('/replay/1002');
		await page.evaluate(() => localStorage.removeItem('rowplay:hr-import:1002'));
		// Navigate fresh instead of reload() — WebKit module-import flake on reload.
		await page.goto('/replay/1002');
		await expect(page.getByText(/Import heart rate|导入心率/)).toBeVisible();

		const fileInput = page.locator('.hrimport input[type="file"]');
		await fileInput.setInputFiles(fixture);
		await expect(page.getByRole('button', { name: /Apply heart rate|应用心率/ })).toBeVisible();
		await page.getByRole('button', { name: /Apply heart rate|应用心率/ }).click();

		await expect(page.getByRole('button', { name: /Remove imported HR|移除导入的心率/ })).toBeVisible();
		await expect(page.locator('.gauges').getByText(/bpm/i)).toBeVisible();
		// HR import mounts extra uPlot charts; verify at least one chart canvas rendered.
		const chartCanvas = page.locator('.charts canvas').first();
		await expect(chartCanvas).toBeVisible();
		await expect(async () => {
			const w = await chartCanvas.evaluate((el: HTMLCanvasElement) => el.width);
			expect(w).toBeGreaterThan(0);
		}).toPass({ timeout: 10_000 });

		expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
