import { expect, test } from "@playwright/test";

/** Matches `inspector.toggle` in all six locales. */
const INSPECTOR_TOGGLE =
  /Field inspector|字段检查器|Feld-Inspektor|Inspector de campos|Inspecteur de champs|フィールドインスペクター/i;

function seekScrub(page: import("@playwright/test").Page, seconds: number) {
  return page.locator("input.scrub").evaluate((el, t) => {
    const input = el as HTMLInputElement;
    input.value = String(t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, seconds);
}

test.describe("raw field inspector", () => {
  test("raw value holds within a sample and changes across a boundary", async ({ page }) => {
    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    const toggle = page.getByRole("button", { name: INSPECTOR_TOGGLE });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    const rawT = page.getByTestId("inspector-raw-t");
    await expect(rawT).toBeVisible();
    const initial = ((await rawT.textContent()) ?? "").trim();
    expect(initial).toBeTruthy();

    const scrub = page.locator("input.scrub");
    const t0 = Number(await scrub.inputValue());
    // Within a sample span the as-logged value holds (sample-and-hold).
    await seekScrub(page, t0 + 0.5);
    await expect(rawT).toHaveText(initial);

    // Across a sample boundary elapsed time (t) always changes.
    await seekScrub(page, t0 + 20);
    await expect(rawT).not.toHaveText(initial);
  });

  test("toggle is keyboard-operable", async ({ page }) => {
    await page.goto("/replay/1001");
    const toggle = page.getByTestId("inspector-toggle");
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
