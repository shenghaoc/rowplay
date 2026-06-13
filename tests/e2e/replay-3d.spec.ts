import { expect, test, type Locator } from "@playwright/test";

/**
 * The 3D toggle is disabled during hydration (`webglOk` starts false until the
 * onMount WebGL probe runs) and stays disabled where WebGL is unavailable.
 * Resolve to whether 3D is actually supported only once the probe has settled,
 * so callers don't race the transient disabled→enabled flip — a slow CI
 * WebServer widens that window and was flaking the `else` branch.
 */
async function supports3d(btn3d: Locator): Promise<boolean> {
  try {
    await expect(btn3d).toBeEnabled({ timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

test.describe("replay 3D view toggle", () => {
  test("2D/3D toggle is present and canvas stays mounted", async ({ page }) => {
    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    const group = page.getByRole("group", {
      name: /Course view|赛道视图|Kursansicht|Vue du parcours|Vista del recorrido|コース表示/i,
    });
    await expect(group).toBeVisible();

    const btn3d = group.getByRole("button", { name: /^3D$/ });
    const btn2d = group.getByRole("button", { name: /^2D$/ });

    await expect(btn2d).toHaveAttribute("aria-pressed", "true");

    if (await supports3d(btn3d)) {
      await btn3d.click();
      // Lazy Three.js chunk can take several seconds on CI.
      await expect(btn3d).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
      // 3D renders into its own canvas inside the host; the 2D canvas is hidden.
      await expect(page.locator(".canvas3d-host canvas")).toBeVisible();
      await btn2d.click();
      await expect(btn2d).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("canvas").first()).toBeVisible();
    } else {
      await expect(btn3d).toBeDisabled();
    }
  });

  // The 3D scene picks its avatar + ground from the workout's sport. Exercise the
  // SkiErg (skier) and BikeErg (cyclist) paths so a sport-specific init throw
  // (which reverts to 2D) would fail the test rather than pass silently.
  for (const { id, sport } of [
    { id: 1003, sport: "SkiErg" },
    { id: 1004, sport: "BikeErg" },
  ]) {
    test(`3D view renders for ${sport}`, async ({ page }) => {
      await page.goto(`/replay/${id}`);
      await expect(page.locator("canvas").first()).toBeVisible();

      const group = page.getByRole("group", {
        name: /Course view|赛道视图|Kursansicht|Vue du parcours|Vista del recorrido|コース表示/i,
      });
      const btn3d = group.getByRole("button", { name: /^3D$/ });

      if (await supports3d(btn3d)) {
        await btn3d.click();
        await expect(btn3d).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
        await expect(page.locator(".canvas3d-host canvas")).toBeVisible();
      } else {
        await expect(btn3d).toBeDisabled();
      }
    });
  }
});
