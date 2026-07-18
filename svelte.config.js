import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/**
 * Keep heavyweight, 3D-only replay models out of the install-time app shell.
 * The service worker caches them on first use instead.
 *
 * @param {string} file
 */
export function shouldPrecacheStaticFile(file) {
  return !/\.DS_Store/.test(file) && !file.startsWith("replay-assets/");
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      $components: "src/components",
    },
    serviceWorker: {
      register: true,
      files: shouldPrecacheStaticFile,
    },
  },
};

export default config;
