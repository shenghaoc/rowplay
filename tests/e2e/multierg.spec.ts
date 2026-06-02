import { expect, test, type Page } from '@playwright/test';
import { mockWorkoutDetail } from '../../src/lib/mockData';
import { buildSegmentMap } from '../../src/lib/replay/engine';

/** Set the replay scrubber (WebKit rejects non-step-aligned range values). */
function seekScrub(page: Page, seconds: number) {
	return page.locator('input.scrub').evaluate((el, t) => {
		const input = el as HTMLInputElement;
		const step = Number(input.step) || 0.1;
		const snapped = Math.round(t / step) * step;
		const clamped = Math.min(Number(input.max), Math.max(Number(input.min), snapped));
		input.value = String(clamped);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, seconds);
}

/** Midpoint of the first inter-segment rest in demo fixture 1012. */
function firstRestMidpoint(): number {
	const detail = mockWorkoutDetail(1012);
	if (!detail) throw new Error('demo 1012 missing');
	const segMap = buildSegmentMap(detail.splits, detail.sport);
	return (segMap[0].endT + segMap[1].startT) / 2;
}

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

		const scrub = page.locator('input.scrub');
		const max = Number(await scrub.getAttribute('max'));

		await seekScrub(page, max * 0.75);
		await expect(paceLabel1000).toBeVisible();
		await expect(rpmLabel).toBeVisible();

		await seekScrub(page, max * 0.08);
		await expect(paceLabel).toBeVisible();
		await expect(spmLabel).toBeVisible();

		await seekScrub(page, firstRestMidpoint());
		await expect(page.getByTestId('rest-transition')).toBeVisible();
	});
});
