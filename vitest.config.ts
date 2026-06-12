import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["src/**/*.browser.test.ts"],
    environment: "node",
    setupFiles: ["tests/unit/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/types.ts", "src/**/$types.ts"],
    },
  },
});
