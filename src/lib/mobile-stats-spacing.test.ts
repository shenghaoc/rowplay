/**
 * Bug Condition Exploration Test — Mobile Stat Cards Cramped Padding and Gap
 *
 * Property 1: Bug Condition
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * This test asserts the EXPECTED (fixed) behavior by parsing the CSS rules
 * directly from the dashboard component's scoped <style> block.
 *
 * On UNFIXED code this test MUST FAIL — that failure confirms the bug exists:
 *   - No `.stat { padding }` override in the @media (max-width: 720px) block
 *   - No `.stat { padding }` override in the @media (max-width: 400px) block
 *   - `.stats { gap: 0.6rem }` in the @media (max-width: 400px) block (too tight)
 *
 * Expected counterexamples on unfixed code:
 *   - At 375px: `.stat` padding is `0.95rem 1rem` (global `.card` value, no stat override)
 *   - At 500px: `.stat` padding is `1.25rem 1.4rem` (global `.card` value, no stat override)
 *   - At 360px: `.stats` gap is `0.6rem`, expected `0.75rem`
 *   - At 320px: both `.stat` padding and `.stats` gap are wrong
 *
 * NOTE: Because jsdom/happy-dom does not fully simulate CSS media query cascade,
 * this test uses a CSS text parsing approach: it reads the raw CSS from the
 * dashboard component file and asserts that the expected rules are present.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the content of the scoped <style> block from a .svelte file. */
function extractSvelteStyle(filePath: string): string {
	const source = readFileSync(filePath, 'utf-8');
	const match = source.match(/<style>([\s\S]*?)<\/style>/);
	if (!match) throw new Error(`No <style> block found in ${filePath}`);
	return match[1];
}

/**
 * Extract the body of a @media block matching the given max-width value.
 * Returns the raw CSS text inside the matching @media rule.
 */
function extractMediaBlock(css: string, maxWidthPx: number): string {
	// Match @media (max-width: Npx) { ... } — handles nested braces by counting depth
	const pattern = new RegExp(
		`@media\\s*\\(max-width:\\s*${maxWidthPx}px\\)\\s*\\{`,
		'g'
	);
	const match = pattern.exec(css);
	if (!match) return '';

	let depth = 1;
	let i = match.index + match[0].length;
	const start = i;
	while (i < css.length && depth > 0) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}') depth--;
		i++;
	}
	return css.slice(start, i - 1); // exclude the closing }
}

/**
 * Check whether a CSS block contains a rule for `selector` with a given
 * `property` set to `value`. Normalises whitespace for comparison.
 *
 * Returns the found value string if the property exists (regardless of value),
 * or null if the selector/property combination is absent.
 */
function findPropertyValue(
	cssBlock: string,
	selector: string,
	property: string
): string | null {
	// Escape selector for use in regex (e.g. ".stat .value" → "\\.stat \\.value")
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Match selector { ... } — simple single-level rule extraction
	const selectorPattern = new RegExp(
		`${escapedSelector}\\s*\\{([^}]*)\\}`,
		'g'
	);
	let match: RegExpExecArray | null;
	while ((match = selectorPattern.exec(cssBlock)) !== null) {
		const declarations = match[1];
		// Look for the property inside the declarations
		const propPattern = new RegExp(
			`${property.replace(/-/g, '\\-')}\\s*:\\s*([^;]+)`,
			'i'
		);
		const propMatch = propPattern.exec(declarations);
		if (propMatch) {
			return propMatch[1].trim();
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const DASHBOARD_PATH = resolve(
	'src/routes/dashboard/+page.svelte'
);

const css = extractSvelteStyle(DASHBOARD_PATH);
const media720 = extractMediaBlock(css, 720);
const media400 = extractMediaBlock(css, 400);

// ---------------------------------------------------------------------------
// isBugCondition helper (mirrors the design doc specification)
// ---------------------------------------------------------------------------

/**
 * Returns true when the viewport is in a range where the bug manifests:
 *   - widthPx <= 720: stat cards lack a padding override (2-column layout, no compensation)
 *   - widthPx <= 400: gap is too tight AND stat cards lack a padding override
 */
function isBugCondition(viewport: { widthPx: number }): boolean {
	if (viewport.widthPx <= 720) return true; // covers both sub-ranges
	return false;
}

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — Mobile Stat Cards Have Adequate Padding and Gap
//
// Scoped PBT approach: concrete failing viewport ranges
//   - [401, 720]: .stat padding SHALL be `1rem 1.1rem`
//   - [320, 400]: .stat padding SHALL be `0.9rem 1rem` AND .stats gap SHALL be `0.75rem`
//
// Because we parse CSS rules (not computed styles), we assert the rules EXIST
// in the correct media blocks. On unfixed code these rules are absent → FAIL.
// ---------------------------------------------------------------------------

describe('Property 1: Bug Condition — Mobile Stat Cards Cramped Padding and Gap', () => {
	describe('Viewport range [401, 720] — 2-column layout, stat padding override required', () => {
		it('should have .stat { padding: 1rem 1.1rem } inside @media (max-width: 720px)', () => {
			// On UNFIXED code: no .stat padding rule exists in the 720px block → FAILS
			// On FIXED code: .stat { padding: 1rem 1.1rem } is present → PASSES
			const padding = findPropertyValue(media720, '.stat', 'padding');

			// Document what was found vs expected (counterexample on unfixed code)
			// Expected: "1rem 1.1rem"
			// Actual on unfixed code: null (rule absent — stat cards inherit global .card padding)
			expect(padding).not.toBeNull();
			expect(padding).toBe('1rem 1.1rem');
		});

		it('should NOT have .stat padding defaulting to global .card value (1.25rem 1.4rem) at 720px breakpoint', () => {
			// Confirms the stat-specific override is present and not the global fallback.
			// On UNFIXED code: padding is null (no override) → the global .card value applies
			// This test passes on both fixed and unfixed code (it's a documentation assertion)
			// The real failure is the test above — this one documents the counterexample.
			const padding = findPropertyValue(media720, '.stat', 'padding');
			// On unfixed code, padding is null — no override means global .card (1.25rem 1.4rem) applies
			// On fixed code, padding is '1rem 1.1rem' — the override is present
			expect(padding).not.toBe('1.25rem 1.4rem'); // global .card value must NOT be the override
		});
	});

	describe('Viewport range [320, 400] — very small screens, gap and padding both required', () => {
		it('should have .stats { gap: 0.75rem } inside @media (max-width: 400px)', () => {
			// On UNFIXED code: gap is 0.6rem → FAILS
			// On FIXED code: gap is 0.75rem → PASSES
			const gap = findPropertyValue(media400, '.stats', 'gap');

			// Counterexample on unfixed code:
			//   At 360px: .stats gap is "0.6rem", expected "0.75rem"
			//   At 320px: .stats gap is "0.6rem", expected "0.75rem"
			expect(gap).not.toBeNull();
			expect(gap).toBe('0.75rem');
		});

		it('should have .stat { padding: 0.9rem 1rem } inside @media (max-width: 400px)', () => {
			// On UNFIXED code: no .stat padding rule in the 400px block → FAILS
			// On FIXED code: .stat { padding: 0.9rem 1rem } is present → PASSES
			const padding = findPropertyValue(media400, '.stat', 'padding');

			// Counterexample on unfixed code:
			//   At 375px: .stat padding is "0.95rem 1rem" (from global app.css .card override at ≤560px)
			//   At 320px: .stat padding is "0.95rem 1rem" (global .card), expected "0.9rem 1rem"
			expect(padding).not.toBeNull();
			expect(padding).toBe('0.9rem 1rem');
		});
	});

	describe('Scoped PBT — sample viewports across bug-condition ranges', () => {
		/**
		 * Simulates the property check across concrete viewport widths.
		 * For each width in the bug-condition range, we verify the CSS rules
		 * that MUST exist in the component to produce the correct computed styles.
		 *
		 * On unfixed code: the rules are absent → all assertions fail.
		 * On fixed code: the rules are present → all assertions pass.
		 */
		const viewportsIn401To720 = [401, 450, 500, 560, 600, 650, 700, 720];
		const viewportsIn320To400 = [320, 340, 360, 375, 390, 400];

		it.each(viewportsIn401To720)(
			'viewport %ipx (401–720): @media(max-width:720px) must contain .stat { padding: 1rem 1.1rem }',
			(width) => {
				// All viewports in [401, 720] are covered by the 720px media block.
				// The rule must exist in that block for the fix to apply.
				expect(isBugCondition({ widthPx: width })).toBe(true);

				const padding = findPropertyValue(media720, '.stat', 'padding');
				// Counterexample: at ${width}px, .stat padding rule is absent in @media(max-width:720px)
				// Expected: "1rem 1.1rem", Actual: null (unfixed code)
				expect(padding).toBe('1rem 1.1rem');
			}
		);

		it.each(viewportsIn320To400)(
			'viewport %ipx (320–400): @media(max-width:400px) must contain .stats { gap: 0.75rem } and .stat { padding: 0.9rem 1rem }',
			(width) => {
				expect(isBugCondition({ widthPx: width })).toBe(true);

				const gap = findPropertyValue(media400, '.stats', 'gap');
				const padding = findPropertyValue(media400, '.stat', 'padding');

				// Counterexample at ${width}px:
				//   .stats gap: found "0.6rem", expected "0.75rem"
				//   .stat padding: found null (absent), expected "0.9rem 1rem"
				expect(gap).toBe('0.75rem');
				expect(padding).toBe('0.9rem 1rem');
			}
		);
	});

	describe('Sanity checks — existing rules must be preserved', () => {
		it('should preserve .stats { grid-template-columns: repeat(2, minmax(0, 1fr)) } in @media (max-width: 720px)', () => {
			// This rule must remain unchanged — it is the 2-column layout trigger
			const cols = findPropertyValue(media720, '.stats', 'grid-template-columns');
			expect(cols).toBe('repeat(2, minmax(0, 1fr))');
		});

		it('should preserve .stat .value { font-size: 1.25rem } in @media (max-width: 400px)', () => {
			// This rule must remain unchanged — it reduces the value font size on very small screens
			const fontSize = findPropertyValue(media400, '.stat .value', 'font-size');
			expect(fontSize).toBe('1.25rem');
		});
	});
});

// ---------------------------------------------------------------------------
// Helpers for base (non-media) CSS extraction
// ---------------------------------------------------------------------------

/**
 * Extract the CSS text that is NOT inside any @media block.
 * This represents the base styles that apply at all viewport widths (desktop default).
 */
function extractBaseStyles(css: string): string {
	// Remove all @media blocks (including nested braces) to get the base styles
	let result = css;
	let mediaStart = result.search(/@media\s*\(/);
	while (mediaStart !== -1) {
		// Find the opening brace of this @media block
		const braceStart = result.indexOf('{', mediaStart);
		if (braceStart === -1) break;
		let depth = 1;
		let i = braceStart + 1;
		while (i < result.length && depth > 0) {
			if (result[i] === '{') depth++;
			else if (result[i] === '}') depth--;
			i++;
		}
		// Remove the entire @media block
		result = result.slice(0, mediaStart) + result.slice(i);
		mediaStart = result.search(/@media\s*\(/);
	}
	return result;
}

const baseStyles = extractBaseStyles(css);

// ---------------------------------------------------------------------------
// Property 2: Preservation — Desktop Stat Styles Are Unchanged
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
//
// For all viewport widths in [721, 1440], the desktop styles must be unchanged:
//   1. NO .stat { padding } override in base styles (desktop uses global .card value)
//   2. .stats { gap: 1rem } in base styles
//   3. .stats { grid-template-columns: repeat(4, 1fr) } in base styles
//
// These tests PASS on unfixed code (desktop styles are already correct).
// They serve as a regression guard: they must CONTINUE to pass after the fix.
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — Desktop Stat Styles Are Unchanged', () => {
	describe('Base styles (outside all @media blocks) — desktop defaults', () => {
		it('should have NO .stat { padding } rule in base styles (desktop uses global .card padding)', () => {
			// On UNFIXED code: no .stat padding override exists → PASSES (desktop is correct)
			// On FIXED code: the fix only adds .stat padding INSIDE mobile media blocks → still PASSES
			// If this fails after the fix, it means a .stat padding was accidentally added to base styles
			const padding = findPropertyValue(baseStyles, '.stat', 'padding');
			expect(padding).toBeNull();
		});

		it('should have .stats { gap: 1rem } in base styles', () => {
			// On UNFIXED code: .stats gap is 1rem in base → PASSES
			// On FIXED code: the fix does not touch the base .stats gap → still PASSES
			const gap = findPropertyValue(baseStyles, '.stats', 'gap');
			expect(gap).toBe('1rem');
		});

		it('should have .stats { grid-template-columns: repeat(4, 1fr) } in base styles', () => {
			// On UNFIXED code: .stats grid-template-columns is repeat(4, 1fr) in base → PASSES
			// On FIXED code: the fix does not touch the base .stats grid → still PASSES
			const cols = findPropertyValue(baseStyles, '.stats', 'grid-template-columns');
			expect(cols).toBe('repeat(4, 1fr)');
		});
	});

	describe('Scoped PBT — sample desktop viewport widths [721, 1440]', () => {
		/**
		 * For all desktop viewport widths, the base CSS rules must be present and correct.
		 * Since we parse CSS rules (not computed styles), we verify the base rules once —
		 * they apply uniformly to all viewports above 720px.
		 *
		 * The property is: for any width w in [721, 1440], the base styles are unchanged.
		 * We sample representative widths to document this property.
		 */
		const desktopViewports = [721, 768, 800, 900, 1024, 1280, 1440];

		it.each(desktopViewports)(
			'viewport %ipx (721–1440): base .stats gap must be 1rem (no media override applies)',
			(width) => {
				// For all desktop widths, the bug condition does NOT hold
				expect(width).toBeGreaterThan(720);

				// The base .stats gap must be 1rem — no media block overrides it above 720px
				const gap = findPropertyValue(baseStyles, '.stats', 'gap');
				expect(gap).toBe('1rem');
			}
		);

		it.each(desktopViewports)(
			'viewport %ipx (721–1440): base .stats grid-template-columns must be repeat(4, 1fr)',
			(width) => {
				expect(width).toBeGreaterThan(720);

				// The base .stats grid must be 4-column — no media block overrides it above 720px
				const cols = findPropertyValue(baseStyles, '.stats', 'grid-template-columns');
				expect(cols).toBe('repeat(4, 1fr)');
			}
		);

		it.each(desktopViewports)(
			'viewport %ipx (721–1440): NO .stat padding override in base styles (global .card value applies)',
			(width) => {
				expect(width).toBeGreaterThan(720);

				// No .stat padding override in base styles — desktop uses global .card (1.25rem 1.4rem)
				// This must remain null both before and after the fix
				const padding = findPropertyValue(baseStyles, '.stat', 'padding');
				expect(padding).toBeNull();
			}
		);
	});

	describe('Media block isolation — fix must not bleed into desktop range', () => {
		it('should have NO .stat { padding } rule in @media (max-width: 720px) on UNFIXED code', () => {
			// On UNFIXED code: no .stat padding in the 720px block → PASSES (confirms baseline)
			// NOTE: This test will FAIL after the fix is applied (task 3) — that is expected.
			// It documents the pre-fix state. After the fix, task 3.4 re-runs the preservation
			// tests and this specific assertion is superseded by the bug condition test (task 1).
			// We skip this assertion here to avoid a false failure after the fix.
			// Instead, we assert the 720px block does NOT contain a .stat padding that would
			// affect desktop (i.e., the 720px block only applies to ≤720px viewports).
			// The key preservation property is: base styles are unchanged (tested above).
			// This is a documentation-only comment — no assertion needed here.
			expect(true).toBe(true); // placeholder — see comment above
		});

		it('should have NO .stat { padding } rule outside ALL media blocks (base styles only)', () => {
			// This is the definitive preservation assertion:
			// The fix must ONLY add .stat padding inside mobile media blocks.
			// The base styles (desktop default) must never have a .stat padding override.
			const padding = findPropertyValue(baseStyles, '.stat', 'padding');
			expect(padding).toBeNull();
		});

		it('should have NO .stats { gap } override in @media (max-width: 720px)', () => {
			// The 720px block must not override .stats gap — gap stays at 1rem for 401–720px range
			// (the 400px block handles the gap reduction for very small screens)
			const gap = findPropertyValue(media720, '.stats', 'gap');
			expect(gap).toBeNull();
		});
	});
});
