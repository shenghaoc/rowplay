import { expect, test, type Page } from "@playwright/test";

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test.describe("replay keyboard controls (demo mode)", () => {
  test("Space toggles play/pause", async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    // Focus the body so keyboard events hit the global listener (not a button).
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    const playBtn = page
      .getByRole("button", { name: /^Play$|^播放$|^Reproduzir$|^Lire$|^Abspielen$|^再生$/ })
      .first();

    // Space should start playback.
    await page.keyboard.press("Space");
    // After Space, the button text should change to Pause.
    await expect(
      page
        .getByRole("button", { name: /^Pause$|^暂停$|^Pausar$|^Pause$|^Pausieren$|^一時停止$/ })
        .first(),
    ).toBeVisible({ timeout: 3000 });

    // Space again should pause.
    await page.keyboard.press("Space");
    await expect(playBtn).toBeVisible({ timeout: 3000 });

    await page.waitForTimeout(300);
    expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("ArrowRight scrubs forward, ArrowLeft scrubs back", async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    // Read initial clock value.
    const clock = page.locator(".clock").first();
    const initialText = await clock.textContent();

    // Blur any focused element so keydown reaches the global listener.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    // ArrowRight should advance the timeline.
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const afterForward = await clock.textContent();
    expect(afterForward).not.toBe(initialText);

    // ArrowLeft should scrub back (should get closer to initial or past it).
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(150);
    const afterBack = await clock.textContent();
    // Just verify it changed again.
    expect(afterBack).not.toBe(afterForward);

    await page.waitForTimeout(300);
    expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("technique-first speed starts at 1× and keyboard controls retain fast review speeds", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);

    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    const activeSpeed = page.locator('.speeds button[aria-checked="true"]');

    // A replay opens at a cadence where motion and equipment contact can be
    // inspected before opting into a faster review.
    await expect(activeSpeed).toContainText("1×", { timeout: 2000 });

    // [ still exposes the slow-motion option.
    await page.keyboard.press("[");
    await expect(activeSpeed).toContainText("0.5×", { timeout: 2000 });

    // ] steps through every faster review speed, including 8×.
    for (const expectedSpeed of ["1×", "2×", "4×", "8×"]) {
      await page.keyboard.press("]");
      await expect(activeSpeed).toContainText(expectedSpeed, { timeout: 2000 });
    }

    await page.waitForTimeout(300);
    expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("0 resets the replay to the start", async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    // Advance 10s then reset.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("0");
    await page.waitForTimeout(150);

    const clock = page.locator(".clock").first();
    const text = await clock.textContent();
    // After reset, the clock should show 0:00 (or very close).
    expect(text).toMatch(/^0:00/);

    await page.waitForTimeout(300);
    expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("keyboard shortcuts do not fire when focus is in a text input", async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    // Constant-pace lives inside a collapsible <details>; open it first
    const moreOptions = page.locator("details.ghost-more summary");
    await moreOptions.click();
    await page
      .getByRole("button", {
        name: /A constant pace|恒定配速|Marcha constante|A un rythme constant|Konstante Geschwindigkeit|一定のペース/,
      })
      .click();
    const paceInput = page.locator("input.paceinput");
    await paceInput.focus();

    // Read initial clock.
    const clock = page.locator(".clock").first();
    const before = await clock.textContent();

    // ArrowRight while focus is in the pace input should NOT change the replay time.
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const after = await clock.textContent();
    expect(after).toBe(before);

    await page.waitForTimeout(300);
    expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("remove ghost button clears the ghost lane", async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto("/replay/1001");
    await expect(page.locator("canvas").first()).toBeVisible();

    // Constant-pace lives inside a collapsible <details>; open it first
    const moreOptions2 = page.locator("details.ghost-more summary");
    await moreOptions2.click();
    await page.getByRole("button", { name: /A constant pace|恒定配速/ }).click();
    await page.getByRole("button", { name: /Set pace|设定配速/ }).click();

    // "Remove ghost" button should appear.
    const removeBtn = page.getByRole("button", {
      name: /Remove ghost|移除对手|Eliminar fantasma|Supprimer le fantôme|Gegner entfernen|ゴーストを削除/,
    });
    await expect(removeBtn).toBeVisible({ timeout: 3000 });

    // Clicking it should remove the ghost.
    await removeBtn.click();
    await expect(removeBtn).not.toBeVisible({ timeout: 2000 });

    await page.waitForTimeout(300);
    expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
