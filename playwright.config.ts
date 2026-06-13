import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production build on the real Workers runtime via
 * `wrangler dev`, never `vite dev`: SvelteKit's server endpoints only run under
 * the Workers runtime. Demo mode (no CONCEPT2_CLIENT_ID) serves deterministic
 * mock data, so no auth/secrets needed.
 *
 * In CI the build is done by a separate job and the artifact is downloaded
 * before Playwright runs. Set E2E_SKIP_BUILD=1 to use a pre-built artifact so
 * the webServer only starts `wrangler dev` without rebuilding.
 */
const HOST = "127.0.0.1";
const PORT = 8787; // wrangler dev's default port
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  reporter: [["html", { open: "never" }]],
  fullyParallel: true,
  // Two workers in CI keeps e2e under ~2 min while avoiding the parallel
  // dynamic-chunk flake that was common with more workers on older wrangler.
  workers: process.env.CI ? 2 : "75%",
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.E2E_SKIP_BUILD === "1" ? "vp run preview:wrangler" : "vp run preview",
    url: BASE_URL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
