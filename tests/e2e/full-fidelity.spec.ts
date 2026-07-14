import { expect, test } from "@playwright/test";

/**
 * Full-fidelity capture: metadata panel on owner replay; redaction on public share.
 */
test.describe("full-fidelity data", () => {
  test("interval replay shows HR recovery and target-vs-actual", async ({ page }) => {
    await page.goto("/replay/1005");
    await page.getByText(/full metrics|完整指标/i).click();
    await expect(page.getByText(/hr at finish|结束时心率/i)).toBeVisible();
    await expect(page.getByText(/target vs actual|目标与实际/i)).toBeVisible();
  });
});
