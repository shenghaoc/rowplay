import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5173
	},
	build: {
		rollupOptions: {
			// Vite 8 / Rolldown emits a "[PLUGIN_TIMINGS] Your build spent significant
			// time in plugins" diagnostic dominated by SvelteKit's internal
			// `vite-plugin-sveltekit-guard`. The percentages are relative to a tiny
			// build, so the guard trivially dominates — it's informational, not a
			// regression. Silence it to keep build / E2E logs clean.
			// https://rolldown.rs/options/checks#plugintimings
			checks: { pluginTimings: false }
		}
	}
});
