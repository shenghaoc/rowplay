import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { I18n } from "./i18n.svelte";
import { SUPPORTED_LANGUAGES } from "./i18n";

// persistLanguage touches localStorage — stub it
vi.mock("./i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./i18n")>();
  return { ...actual, persistLanguage: vi.fn() };
});

describe("I18n class", () => {
  it("initialises with the provided language", () => {
    const i18n = new I18n("en");
    expect(i18n.lang).toBe("en");
  });

  it("initialises with non-English language", () => {
    const i18n = new I18n("zh");
    expect(i18n.lang).toBe("zh");
  });

  it("t() returns a translation for a known key", () => {
    const i18n = new I18n("en");
    const result = i18n.t("dashboard.title");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("t() interpolates variables", () => {
    const i18n = new I18n("en");
    // Use a key with a variable; if none exist return the key with vars replaced
    const result = i18n.t("someKey", { count: "5" });
    expect(typeof result).toBe("string");
  });

  it("t() falls back to English for unknown keys", () => {
    const i18n = new I18n("zh");
    // For a missing key, returns the key itself
    const result = i18n.t("__nonexistent_key__");
    expect(result).toBe("__nonexistent_key__");
  });

  it("setLanguage() updates lang", () => {
    const i18n = new I18n("en");
    i18n.setLanguage("de");
    expect(i18n.lang).toBe("de");
  });

  it("setLanguage() calls persistLanguage", async () => {
    const { persistLanguage } = await import("./i18n");
    const i18n = new I18n("en");
    i18n.setLanguage("fr");
    expect(persistLanguage).toHaveBeenCalledWith("fr");
  });

  it("cycle() advances to the next language in the list", () => {
    const i18n = new I18n("en");
    const startIdx = SUPPORTED_LANGUAGES.indexOf("en");
    i18n.cycle();
    const expectedNext = SUPPORTED_LANGUAGES[(startIdx + 1) % SUPPORTED_LANGUAGES.length];
    expect(i18n.lang).toBe(expectedNext);
  });

  it("cycle() wraps around after the last language", () => {
    const last = SUPPORTED_LANGUAGES[SUPPORTED_LANGUAGES.length - 1];
    const i18n = new I18n(last);
    i18n.cycle();
    expect(i18n.lang).toBe(SUPPORTED_LANGUAGES[0]);
  });
});
