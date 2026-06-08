import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke runs against the production build on the real Workers runtime via
 * `wrangler dev`, never `vite dev`: SvelteKit's server endpoints only run under
 * the Workers runtime, and WebKit/bundling issues only surface after the adapter
 * build. Demo mode (no CONCEPT2_CLIENT_ID) serves deterministic mock data, so
 * no auth/secrets needed.
 *
 * In CI the build is done by a separate job and the artifact is downloaded
 * before Playwright runs. Set E2E_SKIP_BUILD=1 to use a pre-built artifact so
 * the webServer only starts `wrangler dev` without rebuilding.
 *
 * WebKit on Linux needs system libraries — `npx playwright install --with-deps
 * webkit` on Debian/Ubuntu (CI). Other distros (e.g. RHEL) must install the
 * equivalent libs (libwoff1, libharfbuzz-icu0, libavif, libmanette, libhyphen,
 * libflite1, libjpeg-turbo) by hand before WebKit will launch.
 */
const HOST = '127.0.0.1';
const PORT = 8787; // wrangler dev's default port
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	reporter: [['html', { open: 'never' }]],
	fullyParallel: true,
	// Two workers in CI keeps e2e under ~2 min while avoiding the parallel
	// dynamic-chunk flake that was common with more workers on older wrangler.
	workers: process.env.CI ? 2 : '75%',
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure'
	},
	webServer: {
		command:
			process.env.E2E_SKIP_BUILD === '1'
				? 'npm run preview:ci'
				: 'npm run preview',
		url: BASE_URL,
		reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
		timeout: 180_000
	},
	projects: [
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
		{ name: 'webkit-mobile', use: { ...devices['iPhone 14'] } }
	]
});
