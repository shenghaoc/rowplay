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

/** Work-time of the first segment boundary preceded by a rest (demo fixture 1012). */
function firstBoundaryT(): number {
	const detail = mockWorkoutDetail(1012);
	if (!detail) throw new Error('demo 1012 missing');
	const segMap = buildSegmentMap(detail.splits, detail.sport);
	for (let k = 0; k < segMap.length - 1; k++) {
		if (segMap[k + 1].restBefore > 0) return segMap[k].endT;
	}
	throw new Error('demo 1012 has no inter-segment rest');
}

test.describe('MultiErg replay (demo 1012)', () => {
	// The rest interstitial honours prefers-reduced-motion; Playwright's default
	// emulation is 'no-preference' (motion on), so the overlay plays in CI.
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

		// Rest is a live-play interstitial, not a scrubber position (spec: a "visual-only
		// interstitial, not clock extension"). Scrub to just before the first boundary
		// with a rest, play, and the overlay appears as the playhead crosses it.
		await seekScrub(page, firstBoundaryT() - 0.5);
		await page.locator('button.play').click();
		await expect(page.getByTestId('rest-transition')).toBeVisible({ timeout: 10_000 });
	});
});
