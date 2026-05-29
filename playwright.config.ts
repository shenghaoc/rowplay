import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke runs against the production build on the real Workers runtime
 * (`npm run preview` = `npm run build && wrangler dev`), never `vite dev`:
 * SvelteKit's server endpoints only run under the Workers runtime, and
 * WebKit/bundling issues only surface after the adapter build. Demo mode (no
 * CONCEPT2_CLIENT_ID) serves deterministic mock data, so no auth/secrets needed.
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
	workers: process.env.CI ? 2 : '75%',
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure'
	},
	webServer: {
		command: `npm run build && npx wrangler dev --ip ${HOST} --port ${PORT}`,
		url: BASE_URL,
		reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
		timeout: 180_000
	},
	projects: [
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
		{ name: 'webkit-mobile', use: { ...devices['iPhone 14'] } }
	]
});
