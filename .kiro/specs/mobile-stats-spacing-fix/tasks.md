# Implementation Plan

## Overview

Fix cramped dashboard stat cards on mobile: rename classes to `.dash-stats` / `.dash-stat` (daisyUI collision), then adjust scoped CSS in `src/routes/dashboard/+page.svelte` for padding, gap, and label alignment. The workflow follows the exploratory bugfix methodology: write tests first to confirm the bug, then apply the fix, then verify both the fix and preservation of desktop behavior.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] },
    { "wave": 3, "tasks": ["4"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Mobile Stat Cards Cramped Padding and Gap
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the cramped styles exist on the unfixed code
  - **Scoped PBT Approach**: Scope the property to the concrete failing viewport ranges: widths in [320, 720] for padding and [320, 400] for gap
  - Create a Vitest test file at `src/lib/mobile-stats-spacing.test.ts` (or co-locate with the dashboard if preferred)
  - Use `jsdom` / happy-dom + a CSS parsing helper (or inline style injection) to simulate the computed styles at given viewport widths
  - **Bug Condition (from design)**: `isBugCondition(viewport)` returns `true` when `viewport.widthPx <= 720` and no `.dash-stat` padding override is present, OR when `viewport.widthPx <= 400` and `.dash-stats { gap }` is `0.6rem`
  - Test assertions (expected behavior after fix):
    - For viewports in [401, 720]: `.dash-stat` computed padding SHALL be `1rem 1.1rem`
    - For viewports in [320, 400]: `.dash-stat` computed padding SHALL be `0.9rem 1rem` and `.dash-stats` gap SHALL be `0.75rem`
  - Run test on UNFIXED code: `pnpm run test -- --run`
  - **EXPECTED OUTCOME**: Test FAILS (confirms the bug — no `.dash-stat` padding override exists and gap is `0.6rem` at ≤400px)
  - Document counterexamples found, e.g.:
    - "At 375px: `.dash-stat` padding is `0.95rem 1rem` (global `.card` value), expected `0.9rem 1rem` (≤400px block overrides ≤720px)"
    - "At 360px: `.dash-stats` gap is `0.6rem`, expected `0.75rem`"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Desktop Stat Styles Are Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (viewport > 720px):
    - Observe: `.dash-stat` computed padding at 800px is `1.25rem 1.4rem` (global `.card` base)
    - Observe: `.dash-stats` gap at 800px is `1rem`
    - Observe: `.dash-stats` grid-template-columns at 800px is `repeat(4, minmax(0, 1fr))`
  - Write property-based tests in the same test file:
    - For all viewport widths in [721, 1440]: `.dash-stat` padding SHALL equal `1.25rem 1.4rem` (global `.card` value, no stat override)
    - For all viewport widths in [721, 1440]: `.dash-stats` gap SHALL equal `1rem`
    - For all viewport widths in [721, 1440]: `.dash-stats` grid-template-columns SHALL equal `repeat(4, minmax(0, 1fr))`
  - Run tests on UNFIXED code: `pnpm run test -- --run`
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline desktop behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Apply the CSS fix to `src/routes/dashboard/+page.svelte`
  - [x] 3.1 Add `.dash-stat { padding: 1rem 1.1rem; }` inside the `@media (max-width: 720px)` block
    - Open `src/routes/dashboard/+page.svelte` and locate the scoped `<style>` block
    - Find the existing `@media (max-width: 720px)` rule that sets `.dash-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }`
    - Add `.dash-stat { padding: 1rem 1.1rem; }` immediately after the `.dash-stats` rule inside that block
    - Do NOT modify `app.css` or any other file
    - _Bug_Condition: isBugCondition(viewport) where viewport.widthPx <= 720 and no .dash-stat padding override exists_
    - _Expected_Behavior: .dash-stat computed padding >= "1rem 1.1rem" for all viewports in (400, 720]_
    - _Preservation: viewports > 720px must continue to use global .card padding of 1.25rem 1.4rem_
    - _Requirements: 2.1, 2.3, 3.1, 3.3_

  - [x] 3.2 Update `.dash-stats { gap }` and add `.dash-stat { padding }` inside the `@media (max-width: 400px)` block
    - In the same scoped `<style>` block, locate the `@media (max-width: 400px)` rule
    - Change `.dash-stats { gap: 0.6rem; }` to `.dash-stats { gap: 0.75rem; }`
    - Add `.dash-stat { padding: 0.9rem 1rem; }` after the updated `.dash-stats` rule and before `.dash-stat .value { font-size: 1.25rem; }`
    - Do NOT modify `app.css` or any other file
    - _Bug_Condition: isBugCondition(viewport) where viewport.widthPx <= 400 and .dash-stats gap = 0.6rem_
    - _Expected_Behavior: .dash-stats gap = "0.75rem" and .dash-stat padding = "0.9rem 1rem" for all viewports in [320, 400]_
    - _Preservation: .dash-stat .value { font-size: 1.25rem } and all other rules in the 400px block must remain unchanged_
    - _Requirements: 2.2, 2.3, 3.1, 3.3_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Mobile Stat Cards Cramped Padding and Gap
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (padding ≥ thresholds, gap = 0.75rem)
    - Run: `pnpm run test -- --run`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the fix satisfies the expected behavior for all bug-condition viewports)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Desktop Stat Styles Are Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `pnpm run test -- --run`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — desktop layout, global `.card` styles, and all other dashboard sections are unchanged)
    - Confirm all tests still pass after fix (no regressions)

  - [x] 3.5 Visual verification at mobile breakpoints
    - Start the dev server: `pnpm run dev`
    - Open the dashboard at `http://localhost:5173/dashboard` in a browser
    - Use DevTools device emulation to verify at the following widths:
      - **375px** (iPhone SE): stat cards should have comfortable padding (`0.9rem 1rem` from ≤400px block overriding ≤720px), 2-column grid, gap `0.75rem`
      - **360px** (small Android): gap between stat cards should be `0.75rem` (not cramped)
      - **320px** (very small): both padding (`0.9rem 1rem`) and gap (`0.75rem`) should be adequate
    - Confirm labels ("Sessions", "Total distance", "Total time", "Avg pace") and values are clearly legible with breathing room
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.6 Visual regression check at desktop width
    - With the dev server still running, resize to 800px and wider
    - Confirm the stats section renders as a 4-column grid with the original spacing (gap `1rem`, padding `1.25rem 1.4rem`)
    - Confirm all other dashboard sections (latest session hero, engagement panel, heatmap, PMC, PBs, trend chart, workout list) are visually unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full unit test suite: `pnpm run test`
  - Run the type checker: `pnpm run check`
  - Confirm both pass with 0 errors before marking this task complete
  - Ask the user if any questions arise about visual results or test failures

## Notes

- This is a CSS-only fix. No HTML changes, no changes to `app.css`, no changes to any other component or route.
- The scoped `<style>` block in `src/routes/dashboard/+page.svelte` is the only file that needs to be modified.
- Because CSS computed-style assertions in a jsdom/happy-dom environment may not fully simulate media query cascade, the visual verification steps (3.5, 3.6) are the primary confirmation of the fix. The unit tests (tasks 1 and 2) validate the structural intent of the CSS changes.
- Run `pnpm run test` (Vitest) for unit tests and `pnpm run check` for type checking. E2E tests (`pnpm run test:e2e`) require `wrangler dev` and are not required for this CSS-only fix.
