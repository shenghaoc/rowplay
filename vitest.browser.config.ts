import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

/**
 * Vitest Browser Mode config — runs *.browser.test.ts files in a real Chromium
 * browser via the Playwright provider.  Use `vp run test:browser` to invoke.
 *
 * This is separate from the node-unit-test config (vitest.config.ts) so that
 * `vp test` stays fast and doesn't require a browser.
 */
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    name: "browser",
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    // JUnit XML for any GitHub Actions test reporter (see vitest.config.ts comment).
    reporters: process.env.CI && process.env.CI !== "false" ? ["default", "junit"] : "default",
    outputFile:
      process.env.CI && process.env.CI !== "false"
        ? { junit: "test-results/junit-browser.xml" }
        : undefined,
  },
});
