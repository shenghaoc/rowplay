import { expect, test } from '@playwright/test';

test.describe('replay 3D view toggle', () => {
	test('2D/3D toggle is present and canvas stays mounted', async ({ page }) => {
		await page.goto('/replay/1001');
		await expect(page.locator('canvas').first()).toBeVisible();

		const group = page.getByRole('group', { name: /Course view|赛道视图|Kursansicht/i });
		await expect(group).toBeVisible();

		const btn3d = group.getByRole('button', { name: /^3D$/ });
		const btn2d = group.getByRole('button', { name: /^2D$/ });

		await expect(btn2d).toHaveAttribute('aria-pressed', 'true');

		if (await btn3d.isEnabled()) {
			await btn3d.click();
			await expect(btn3d).toHaveAttribute('aria-pressed', 'true');
			await expect(page.locator('canvas').first()).toBeVisible();
			await btn2d.click();
			await expect(btn2d).toHaveAttribute('aria-pressed', 'true');
		} else {
			await expect(btn3d).toBeDisabled();
		}
	});
});
