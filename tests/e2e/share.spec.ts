import { expect, test } from "@playwright/test";

/**
 * Shareable replays: create a capability URL and watch without a session.
 */
test.describe("share", () => {
  test("shared replay loads in a fresh context", async ({ browser, baseURL }) => {
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    const res = await ownerPage.request.post(`${baseURL}/api/workouts/1005/share`);
    expect(res.ok(), "POST share should succeed in demo mode").toBeTruthy();
    const { path } = (await res.json()) as { path: string };
    expect(path).toMatch(/^\/r\/[a-f0-9]{48}$/);

    const viewer = await browser.newContext();
    const page = await viewer.newPage();
    const viewRes = await page.goto(path);
    expect(viewRes?.ok(), "GET shared replay should be 2xx").toBeTruthy();
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.getByText(/shared replay|共享回放/i)).toBeVisible();

    await owner.close();
    await viewer.close();
  });

  test("replay page exposes share and download controls", async ({ page }) => {
    await page.goto("/replay/1005");
    await expect(page.getByRole("button", { name: /share replay|分享回放/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /download image|下载图片/i })).toBeVisible();
  });
});
