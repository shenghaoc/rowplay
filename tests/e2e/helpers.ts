import type { Page } from "@playwright/test";

/** Wait until Svelte has hydrated the app and attached its interaction handlers. */
export async function waitForAppHydration(page: Page): Promise<void> {
  await page.locator('html[data-app-hydrated="true"]').waitFor({ state: "attached" });
}
