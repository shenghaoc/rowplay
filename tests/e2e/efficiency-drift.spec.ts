import { expect, test } from "@playwright/test";

/** Matches `drift.toggle` in all six locales. */
const DRIFT_TOGGLE =
  /Show efficiency drift|显示效率漂移|Effizienzdrift anzeigen|Mostrar deriva de eficiencia|Afficher la dérive d’efficacité|効率ドリフトを表示/i;

test.describe("efficiency drift overlay", () => {
  test("toggle reveals fade summary with numeric values", async ({ page }) => {
    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    const toggle = page.getByTestId("drift-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAccessibleName(DRIFT_TOGGLE);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    const summary = page.getByTestId("drift-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/\d+\.\d/);
  });

  test("toggle is keyboard-operable", async ({ page }) => {
    await page.goto("/replay/1001");
    const toggle = page.getByTestId("drift-toggle");
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
