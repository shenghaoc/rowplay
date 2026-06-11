/**
 * Mobile Stat Cards — Spacing Guard
 *
 * The dashboard stat strip must stay comfortable (never cramped) down to small
 * phones. The Jet Set Blue redesign replaced the old `.dash-stat` + daisyUI
 * `.stat` parts with custom `.statcard` / `.statlabel` / `.statval` cards that
 * carry comfortable padding at every breakpoint and simply collapse columns
 * (4 → 2 → 1) as the viewport narrows. These tests assert that property against
 * the current implementation. (Originally: Requirements 1.1, 1.2, 1.3.)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const DASHBOARD_PATH = resolve("src/routes/dashboard/+page.svelte");

function extractSvelteStyle(filePath: string): string {
  const source = readFileSync(filePath, "utf-8");
  const match = source.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) throw new Error(`No <style> block found in ${filePath}`);
  return match[1];
}

function extractMediaBlock(css: string, maxWidthPx: number): string {
  const pattern = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidthPx}px\\)\\s*\\{`, "g");
  const match = pattern.exec(css);
  if (!match) return "";

  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

function findPropertyValue(cssBlock: string, selector: string, property: string): string | null {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const selectorPattern = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g");
  let match: RegExpExecArray | null;
  while ((match = selectorPattern.exec(cssBlock)) !== null) {
    const propPattern = new RegExp(`${property.replace(/-/g, "\\-")}\\s*:\\s*([^;]+)`, "i");
    const propMatch = propPattern.exec(match[1]);
    if (propMatch) return propMatch[1].trim();
  }
  return null;
}

function extractBaseStyles(css: string): string {
  let result = css;
  let mediaStart = result.search(/@media\s*\(/);
  while (mediaStart !== -1) {
    const braceStart = result.indexOf("{", mediaStart);
    let depth = 1;
    let i = braceStart + 1;
    while (i < result.length && depth > 0) {
      if (result[i] === "{") depth++;
      else if (result[i] === "}") depth--;
      i++;
    }
    result = result.slice(0, mediaStart) + result.slice(i);
    mediaStart = result.search(/@media\s*\(/);
  }
  return result;
}

const css = extractSvelteStyle(DASHBOARD_PATH);
const baseStyles = extractBaseStyles(css);
const media720 = extractMediaBlock(css, 720);
const media460 = extractMediaBlock(css, 460);

describe("daisyUI collision guard", () => {
  it("dashboard summary uses a custom dash-stats grid, not the daisyUI stats container", () => {
    const source = readFileSync(DASHBOARD_PATH, "utf-8");
    const html = source.slice(0, source.indexOf("<style>"));
    expect(html).not.toMatch(/class="stats"/);
    expect(html).toContain("dash-stats");
    expect(html).toMatch(/class="card statcard/);
    expect(html).not.toMatch(/class="stat\b/);
  });
});

describe("Property 1: Mobile stat cards stay comfortable (not cramped)", () => {
  it("statcard carries comfortable padding in base styles (applies at every width)", () => {
    // Redesign keeps a single comfortable padding everywhere instead of shrinking it
    // at breakpoints — the strongest guarantee against cramping on small phones.
    expect(findPropertyValue(baseStyles, ".statcard", "padding")).toBe("1rem 1.1rem");
  });

  it("dash-stats keeps a comfortable gap in base styles", () => {
    expect(findPropertyValue(baseStyles, ".dash-stats", "gap")).toBe("0.85rem");
  });

  it("collapses to 2 columns at 720px so cards are not squeezed", () => {
    expect(findPropertyValue(media720, ".dash-stats", "grid-template-columns")).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
  });

  it("collapses to a single column on small phones (max-width: 460px)", () => {
    expect(findPropertyValue(media460, ".dash-stats", "grid-template-columns")).toBe("1fr");
  });
});

describe("Property 2: Desktop stat strip is a 4-up grid", () => {
  it("dash-stats is a 4-column grid in base styles", () => {
    expect(findPropertyValue(baseStyles, ".dash-stats", "grid-template-columns")).toBe(
      "repeat(4, minmax(0, 1fr))",
    );
  });

  it("statval keeps a prominent numeric voice", () => {
    expect(findPropertyValue(baseStyles, ".statval", "font-size")).toBe("1.7rem");
  });
});
