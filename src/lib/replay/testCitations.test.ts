import { describe, expect, it } from "vite-plus/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard for the derivation-pin convention: replay source comments cite the
 * test that re-derives a fitted constant by quoting its exact `it(...)` title
 * (e.g. `"derives the SkiErg curl axis and grip channel from the authored
 * rig"`). The citation is the promise that an asset rebuild cannot silently
 * invalidate the constant — a citation pointing at a test that does not exist
 * makes that promise false while looking true.
 *
 * This has bitten repeatedly: two constants on `main` cited test names that
 * were never in the suite, and a later stack layer renamed the real test out
 * from under three fresh citations. Both failure modes are invisible to the
 * compiler and survive every suite run, so they get their own test.
 *
 * Scope is deliberately the `"derives ..."` convention only. Widening to any
 * title-shaped quote immediately false-positives on ordinary prose (a comment
 * saying "thumbs on the handle ends" is not a citation).
 */
describe("derivation-pin citations", () => {
  const replayDir = dirname(fileURLToPath(import.meta.url));

  it('every quoted "derives ..." citation names a real test', () => {
    const entries = readdirSync(replayDir).filter(
      (name) => name.endsWith(".ts") || name.endsWith(".js"),
    );
    const testFiles = entries.filter((name) => name.endsWith(".test.ts"));
    const sourceFiles = entries.filter((name) => !name.endsWith(".test.ts"));

    const titles = new Set<string>();
    for (const name of testFiles) {
      const text = readFileSync(join(replayDir, name), "utf8");
      for (const match of text.matchAll(/\bit\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        titles.add(match[1]!);
      }
    }
    expect(titles.size).toBeGreaterThan(100); // the collection itself worked

    const dangling: string[] = [];
    let cited = 0;
    for (const name of sourceFiles) {
      const text = readFileSync(join(replayDir, name), "utf8");
      // Citations live in comments and wrap across `*`-prefixed lines, so
      // normalise each comment to one line before looking for quoted spans —
      // a line-based grep is exactly what missed the wrapped ones.
      const comments = [
        ...(text.match(/\/\*[\s\S]*?\*\//g) ?? []),
        ...(text.match(/\/\/[^\n]*/g) ?? []),
      ];
      for (const comment of comments) {
        const flat = comment.replace(/^\s*\*/gm, "").replace(/\s+/g, " ");
        for (const match of flat.matchAll(/"(derives [^"]+)"/g)) {
          cited++;
          if (!titles.has(match[1]!)) dangling.push(`${name}: "${match[1]!}"`);
        }
      }
    }
    // The convention is in active use; if this drops to zero the extraction
    // regex has rotted and the guard is vacuously green.
    expect(cited).toBeGreaterThan(0);
    expect(dangling, "citations must name tests that exist").toEqual([]);
  });
});
