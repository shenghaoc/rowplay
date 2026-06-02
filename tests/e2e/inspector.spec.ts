import { expect, test } from '@playwright/test';

function seekScrub(page: import('@playwright/test').Page, seconds: number) {
	return page.locator('input.scrub').evaluate((el, t) => {
		const input = el as HTMLInputElement;
		input.value = String(t);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, seconds);
}

test.describe('raw field inspector', () => {
	test('raw value holds within a sample and changes across a boundary', async ({ page }) => {
		await page.goto('/replay/1001');
		await expect(page.locator('canvas').first()).toBeVisible();

		const toggle = page.getByRole('button', {
			name: /Field inspector|字段检查器|Feld-Inspektor/i
		});
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');

		const rawP = page.getByTestId('inspector-raw-p');
		await expect(rawP).toBeVisible();
		const initial = ((await rawP.textContent()) ?? '').trim();
		expect(initial).toBeTruthy();

		const scrub = page.locator('input.scrub');
		const t0 = Number(await scrub.inputValue());
		// Within a sample span the as-logged value holds (sample-and-hold).
		await seekScrub(page, t0 + 0.5);
		await expect(rawP).toHaveText(initial);

		// Across a sample boundary it changes.
		await seekScrub(page, t0 + 20);
		await expect(rawP).not.toHaveText(initial);
	});

	test('toggle is keyboard-operable', async ({ page }) => {
		await page.goto('/replay/1001');
		const toggle = page.getByRole('button', {
			name: /Field inspector|字段检查器|Feld-Inspektor/i
		});
		await toggle.focus();
		await page.keyboard.press('Space');
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press('Space');
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	});
});
