import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

/**
 * Vitest Browser Mode config — runs *.browser.test.ts files in a real Chromium
 * browser via the Playwright provider.  Use `pnpm run test:browser` to invoke.
 *
 * This is separate from the node-unit-test config (vitest.config.ts) so that
 * `pnpm run test` stays fast and doesn't require a browser.
 */
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
