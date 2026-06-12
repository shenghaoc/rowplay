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

  test("public share omits serial number and device", async ({ browser, baseURL }) => {
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    const res = await ownerPage.request.post(`${baseURL}/api/workouts/1005/share`);
    expect(res.ok()).toBeTruthy();
    const { path } = (await res.json()) as { path: string };

    const viewer = await browser.newContext();
    const page = await viewer.newPage();
    await page.goto(path);
    await expect(page.getByText("DEMO-SN-1005")).toHaveCount(0);
    await expect(page.getByText("Demo iPhone")).toHaveCount(0);

    await owner.close();
    await viewer.close();
  });
});
