/**
 * Vitest Browser Mode tests for Theme — verifies real DOM and cookie
 * persistence without stubbing `document` or `location`.
 *
 * These complement the existing node unit tests in theme.svelte.test.ts
 * which use a mocked document.
 */
import { describe, it, expect, afterEach } from "vite-plus/test";
import { Theme, daisyThemeName } from "./theme.svelte";

afterEach(() => {
  // Clean up any cookie set during the test
  document.cookie = "theme=; Path=/; Max-Age=0";
  delete document.documentElement.dataset.theme;
});

describe("Theme — browser DOM persistence", () => {
  it("toggle() sets data-theme on <html> in a real browser", () => {
    const theme = new Theme("light");
    theme.toggle();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(theme.value).toBe("dark");
  });

  it("toggle() persists the theme cookie", () => {
    const theme = new Theme("light");
    theme.toggle();

    // cookie should be set with theme=dark
    expect(document.cookie).toContain("theme=dark");
  });

  it("toggle() round-trips light → dark → light", () => {
    const theme = new Theme("light");
    theme.toggle();
    expect(document.documentElement.dataset.theme).toBe("dark");

    theme.toggle();
    expect(document.documentElement.dataset.theme).toBe("rowplay");
    expect(theme.value).toBe("light");
  });

  it("set() updates both value and DOM", () => {
    const theme = new Theme("light");
    theme.set("dark");

    expect(theme.value).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("theme=dark");
  });

  it("daisyThemeName maps correctly", () => {
    expect(daisyThemeName("dark")).toBe("dark");
    expect(daisyThemeName("light")).toBe("rowplay");
  });
});
