import { expect, test } from '@playwright/test';

/**
 * Leaderboards / multiplayer race: in demo mode every standard board is seeded
 * with the demo athlete plus synthetic rivals, so the board renders ranked, the
 * distance selector drives the URL, and a rival's "Race" link drops into a
 * replay pre-armed with that rival as a ghost.
 */
test.describe('leaderboard', () => {
	test('renders a ranked board with the demo athlete', async ({ page }) => {
		const res = await page.goto('/leaderboard');
		expect(res?.ok(), 'GET /leaderboard should be 2xx').toBeTruthy();

		await expect(page.getByRole('heading', { name: /Leaderboards|排行榜/ })).toBeVisible();
		// Standings table has ranked rows and the viewer's own row is flagged.
		await expect(page.locator('table.board tbody tr').first()).toBeVisible();
		await expect(page.getByText(/^You$|^你$/).first()).toBeVisible();
	});

	test('distance selector updates the board and the URL', async ({ page }) => {
		await page.goto('/leaderboard');
		// Pick the 2,000 m board (present for RowErg in demo data).
		await page.getByRole('button', { name: /2,?000\s*m|2\s*km/i }).first().click();
		await expect(page).toHaveURL(/distance=2000/);
		await expect(page.locator('table.board tbody tr').first()).toBeVisible();
	});

	test('racing a rival opens a replay pre-armed with a ghost', async ({ page }) => {
		await page.goto('/leaderboard');
		const race = page.getByRole('link', { name: /Race|竞速/ }).first();
		await expect(race).toBeVisible();
		await race.click();
		await expect(page).toHaveURL(/\/replay\/\d+\?.*ghostPace=/);
		await expect(page.locator('canvas').first()).toBeVisible();
	});
});
