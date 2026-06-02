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
		const initial = (await rawP.textContent())?.trim();
		expect(initial).toBeTruthy();

		const scrub = page.locator('input.scrub');
		const t0 = Number(await scrub.inputValue());
		await seekScrub(page, t0 + 0.5);
		await page.waitForTimeout(150);
		expect((await rawP.textContent())?.trim()).toBe(initial);

		await seekScrub(page, t0 + 20);
		await page.waitForTimeout(150);
		const after = (await rawP.textContent())?.trim();
		expect(after).toBeTruthy();
		expect(after).not.toBe(initial);
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
