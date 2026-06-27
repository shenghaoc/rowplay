import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["src/**/*.browser.test.ts"],
    environment: "node",
    // JUnit XML is emitted alongside the default reporter in CI so that
    // any GitHub Actions test reporter (e.g. dorny/test-reporter) can
    // surface failures inline on the PR.
    reporters: process.env.CI && process.env.CI !== "false" ? ["default", "junit"] : "default",
    outputFile:
      process.env.CI && process.env.CI !== "false"
        ? { junit: "test-results/junit-node.xml" }
        : undefined,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/types.ts", "src/**/$types.ts"],
    },
  },
});
