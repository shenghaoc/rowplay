import { expect, test } from '@playwright/test';

test.describe('MultiErg replay (demo 1012)', () => {
	test('switches pace units, shows rest overlay, hides publish', async ({ page }) => {
		await page.goto('/replay/1012');
		await expect(page.getByText(/MultiErg/i).first()).toBeVisible();

		const paceLabel = page.locator('.gauges .field-label').filter({ hasText: '/500m' });
		const paceLabel1000 = page.locator('.gauges .field-label').filter({ hasText: '/1000m' });
		const rpmLabel = page.locator('.gauges .field-label').filter({ hasText: 'rpm' });
		const spmLabel = page.locator('.gauges .field-label').filter({ hasText: 'spm' });

		await expect(paceLabel).toBeVisible();
		await expect(spmLabel).toBeVisible();
		await expect(page.getByRole('button', { name: /Publish to leaderboard|Publish/i })).toHaveCount(0);

		const scrub = page.getByRole('slider', { name: 'Seek' });
		const max = Number(await scrub.getAttribute('max'));
		await scrub.fill(String(max * 0.75));
		await scrub.dispatchEvent('input');
		await page.waitForTimeout(200);
		await expect(paceLabel1000).toBeVisible();
		await expect(rpmLabel).toBeVisible();

		await scrub.fill(String(max * 0.08));
		await scrub.dispatchEvent('input');
		await page.waitForTimeout(200);
		await expect(paceLabel).toBeVisible();
		await expect(spmLabel).toBeVisible();

		const midRest = max * 0.28;
		await scrub.fill(String(midRest));
		await scrub.dispatchEvent('input');
		await page.waitForTimeout(200);
		await expect(page.getByText(/Rest/i).first()).toBeVisible();
	});
});
