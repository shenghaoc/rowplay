import { describe, expect, it } from "vite-plus/test";
import { dictionaries } from "./index";
import { SUPPORTED_LANGUAGES } from "../i18n";

/** Flatten a nested dict to a set of dot-path keys (same logic as validate-locales.mjs). */
function flatKeys(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      for (const sub of flatKeys(v as Record<string, unknown>, path)) {
        keys.add(sub);
      }
    } else {
      keys.add(path);
    }
  }
  return keys;
}

const enKeys = flatKeys(dictionaries.en as unknown as Record<string, unknown>);

function guideMarkdown(lang: (typeof SUPPORTED_LANGUAGES)[number]) {
  return (dictionaries[lang] as { docs: { guideMarkdown: string } }).docs.guideMarkdown;
}

describe("locale completeness", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === "en") continue;

    it(`${lang} has every key present in en`, () => {
      const dict = dictionaries[lang] as unknown as Record<string, unknown>;
      const langKeys = flatKeys(dict);
      const missing = [...enKeys].filter((k) => !langKeys.has(k));
      expect(missing, `${lang} is missing keys: ${missing.join(", ")}`).toHaveLength(0);
    });

    it(`${lang} has no extra keys not in en`, () => {
      const dict = dictionaries[lang] as unknown as Record<string, unknown>;
      const langKeys = flatKeys(dict);
      const extra = [...langKeys].filter((k) => !enKeys.has(k));
      expect(extra, `${lang} has extra keys: ${extra.join(", ")}`).toHaveLength(0);
    });
  }
});

describe("locale values", () => {
  it("en has a non-empty dictionary", () => {
    expect(enKeys.size).toBeGreaterThan(100);
  });

  it("all locales export the correct named export", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(dictionaries[lang], `dictionaries.${lang} should exist`).toBeDefined();
    }
  });

  it("all locales provide localized guide markdown", () => {
    const englishGuide = guideMarkdown("en");
    expect(englishGuide).toMatch(/^# /);

    for (const lang of SUPPORTED_LANGUAGES) {
      const guide = guideMarkdown(lang);
      expect(guide, `${lang} guide should be markdown`).toMatch(/^# /);
      if (lang !== "en") {
        expect(guide, `${lang} guide should not fall back to English`).not.toBe(englishGuide);
      }
    }
  });
});
