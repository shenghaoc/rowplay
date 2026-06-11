import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => vi.unstubAllGlobals());
import {
  interpolate,
  isLanguage,
  SUPPORTED_LANGUAGES,
  getStoredLanguage,
  persistLanguage,
} from "./i18n";

describe("isLanguage", () => {
  it("accepts every supported language code", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(isLanguage(lang)).toBe(true);
    }
  });

  it("rejects unknown codes", () => {
    expect(isLanguage("pt")).toBe(false);
    expect(isLanguage("ru")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(isLanguage(42)).toBe(false);
    expect(isLanguage({})).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isLanguage("")).toBe(false);
  });
});

describe("interpolate", () => {
  it("returns the template unchanged when no vars are given", () => {
    expect(interpolate("Hello world")).toBe("Hello world");
    expect(interpolate("Hello world", undefined)).toBe("Hello world");
  });

  it("replaces a single variable", () => {
    expect(interpolate("Hello, {name}!", { name: "Alice" })).toBe("Hello, Alice!");
  });

  it("replaces multiple occurrences of the same variable", () => {
    expect(interpolate("{n} items, {n} total", { n: 5 })).toBe("5 items, 5 total");
  });

  it("replaces multiple distinct variables", () => {
    expect(interpolate("{count} new workouts · {distance}", { count: 3, distance: "2000m" })).toBe(
      "3 new workouts · 2000m",
    );
  });

  it("leaves unreplaced placeholders intact", () => {
    expect(interpolate("Hello, {name}!", {})).toBe("Hello, {name}!");
  });

  it("stringifies numeric values", () => {
    expect(interpolate("Power: {w} W", { w: 250 })).toBe("Power: 250 W");
  });

  it("handles an empty template", () => {
    expect(interpolate("", { n: 1 })).toBe("");
  });
});

describe("getStoredLanguage", () => {
  it('returns "en" in a server/Node environment (no window)', () => {
    // In the Node test environment, typeof window === 'undefined'
    expect(getStoredLanguage()).toBe("en");
  });

  it("returns a valid stored language when localStorage has one", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (_key: string) => "zh",
    });
    expect(getStoredLanguage()).toBe("zh");
  });

  it('returns "en" when localStorage has an unknown code', () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (_key: string) => "klingon",
    });
    expect(getStoredLanguage()).toBe("en");
  });

  it('returns "en" when localStorage throws', () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(getStoredLanguage()).toBe("en");
  });

  it('returns "en" when localStorage returns null', () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: () => null,
    });
    expect(getStoredLanguage()).toBe("en");
  });
});

describe("persistLanguage", () => {
  it("is a no-op in a server environment (no document)", () => {
    // In Node, typeof document === 'undefined' so this should not throw
    expect(() => persistLanguage("en")).not.toThrow();
  });

  it("writes to localStorage and sets document.lang when document exists", () => {
    const stored: Record<string, string> = {};
    const cookiesSet: string[] = [];
    vi.stubGlobal("document", {
      get documentElement() {
        return { set lang(_v: string) {} };
      },
      set cookie(v: string) {
        cookiesSet.push(v);
      },
    });
    vi.stubGlobal("localStorage", {
      setItem: (key: string, val: string) => {
        stored[key] = val;
      },
      getItem: (key: string) => stored[key] ?? null,
    });
    vi.stubGlobal("location", { protocol: "https:" });

    persistLanguage("de");

    expect(stored["lang"]).toBe("de");
    expect(cookiesSet.some((c) => c.startsWith("lang=de"))).toBe(true);
  });

  it("does not throw when localStorage is blocked", () => {
    vi.stubGlobal("document", {
      get documentElement() {
        return { set lang(_v: string) {} };
      },
      set cookie(_v: string) {},
    });
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    vi.stubGlobal("location", { protocol: "https:" });
    expect(() => persistLanguage("fr")).not.toThrow();
  });
});
