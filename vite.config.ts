import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // Agent/editor doc packs and generated artifacts stay out of the formatter
  // (mirrors the fmt ignore list in the hdb-resale-visualizer counterpart).
  fmt: {
    ignorePatterns: [
      ".jules",
      ".kiro",
      "artifacts",
      "docs/superpowers",
      "pnpm-lock.yaml",
      "tests/fixtures/golden",
    ],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
  },
});
