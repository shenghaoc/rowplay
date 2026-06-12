# Mobile Stats Spacing Fix — Bugfix Design

## Overview

On mobile viewports the four stat cards ("Sessions", "Total distance", "Total time", "Avg pace") on the dashboard are visually cramped. The primary root cause is a **daisyUI class-name collision**: markup used `stats` / `stat`, which match daisyUI's Stat component (`display: inline-grid`, `grid-auto-flow: column`), forcing a crushed single-row layout on narrow screens. Secondary factors are missing mobile padding overrides and an over-tight grid gap at ≤400px. The fix renames classes to `.dash-stats` / `.dash-stat`, adjusts responsive padding/gap/label height in the scoped `<style>` block of `src/routes/dashboard/+page.svelte`, and does not change `src/app.css`.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the cramped appearance — a mobile viewport where the stat cards lack sufficient internal padding or inter-card gap due to missing breakpoint overrides.
- **Property (P)**: The desired behavior when the bug condition holds — stat cards must have adequate internal padding and inter-card spacing so labels and values are clearly legible.
- **Preservation**: The existing desktop layout, global `.card` base styles, stat card content, and all other dashboard sections that must remain unchanged by the fix.
- **`.dash-stats`**: The CSS grid container in `src/routes/dashboard/+page.svelte` that holds the four stat cards.
- **`.dash-stat`**: The individual stat card element (also carries the global `.card` class).
- **`app.css`**: The global stylesheet at `src/app.css` that defines the base `.card { padding: 1.25rem 1.4rem }` rule and its `@media (max-width: 560px)` override to `0.95rem 1rem`.
- **Scoped style block**: The `<style>` block inside `src/routes/dashboard/+page.svelte` whose rules are component-scoped by SvelteKit/Vite and do not affect other components.

## Bug Details

### Bug Condition

The bug manifests when the dashboard is viewed on a mobile viewport. Three breakpoints interact to produce cramped stat cards:

1. At ≤560px: `app.css` reduces `.card` padding to `0.95rem 1rem` with no `.dash-stat`-specific override to compensate.
2. At ≤720px: the `.dash-stats` grid switches from 4 columns to 2 columns, narrowing each card, but no padding increase is applied to the now-narrower cards.
3. At ≤400px: the `.dash-stats` gap is further reduced to `0.6rem`, squeezing the cards together.

**Formal Specification:**

```
FUNCTION isBugCondition(viewport)
  INPUT: viewport of type { widthPx: number }
  OUTPUT: boolean

  IF viewport.widthPx <= 560 AND no .dash-stat padding override in 560px breakpoint
    RETURN true   -- cramped internal padding
  END IF

  IF viewport.widthPx <= 720 AND no .dash-stat padding override in 720px breakpoint
    RETURN true   -- narrowed 2-column cards with no padding compensation
  END IF

  IF viewport.widthPx <= 400 AND .dash-stats gap = 0.6rem
    RETURN true   -- gap too tight between cards
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **375px viewport (iPhone SE)**: `.card` padding drops to `0.95rem 1rem`, grid is 2-column, gap is `1rem`. Label and value text feel cramped against the card edges. Expected: `.dash-stat` padding overrides to `0.9rem 1rem` (the ≤720px block sets `1rem 1.1rem`, but the later ≤400px block overrides it to `0.9rem 1rem` via cascade).
- **360px viewport (small Android)**: gap drops to `0.6rem` at ≤400px, cards are squeezed together. Expected: gap stays at `0.75rem`.
- **320px viewport (very small)**: both the gap reduction and the padding reduction compound. Expected: `.dash-stat { padding: 0.9rem 1rem }` and `gap: 0.75rem`.
- **800px viewport (desktop)**: 4-column grid, `padding: 1.25rem 1.4rem` — no bug condition, must remain unchanged.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Desktop layout (viewport > 720px) must continue to render the stats section as a 4-column grid with `gap: 1rem` and the global `.card` padding of `1.25rem 1.4rem`.
- All four stat cards must continue to display their correct label and value content ("Sessions", "Total distance", "Total time", "Avg pace") at every viewport width.
- The global `.card` base styles in `app.css` (background, border, border-radius, box-shadow, and the base `padding: 1.25rem 1.4rem`) must remain unmodified.
- All other dashboard sections (latest session hero, engagement panel, heatmap, PMC, PBs, trend chart, workout list) must retain their existing layout and spacing.

**Scope:**
All viewports wider than 720px are completely unaffected by this fix. The fix only adds `.dash-stat`-specific padding overrides inside the existing `@media (max-width: 720px)` and `@media (max-width: 400px)` blocks in the component's scoped `<style>` block.

## Hypothesized Root Cause

Based on the CSS cascade analysis:

0. **daisyUI class-name collision (primary)**: Markup used `class="stats"` and `class="card stat"`, which match daisyUI v5's Stat component. daisyUI applies `display: inline-grid`, `grid-auto-flow: column`, and `overflow-x: auto` to `.stats`, overriding the dashboard's intended CSS grid and crushing cards into one horizontal row on mobile. Renaming to `.dash-stats` / `.dash-stat` restores the component's grid layout.

1. **Missing stat-specific padding override at ≤720px**: When the grid goes 2-column, each card becomes roughly half as wide. The global `.card` padding (`1.25rem 1.4rem`) is designed for the wider 4-column cards. No `.dash-stat` override compensates for the narrower layout, so the padding-to-content ratio feels off.

2. **Global `.card` padding reduction at ≤560px with no stat compensation**: `app.css` reduces `.card` padding to `0.95rem 1rem` at ≤560px. This is a global rule that affects every card on every page. The dashboard's stat cards need a slightly more generous override because their content (a large mono value + a small label) benefits from more vertical breathing room than a generic card.

3. **Gap reduction at ≤400px**: The `@media (max-width: 400px)` block in the dashboard's scoped style reduces `.dash-stats { gap: 0.6rem }`. This was likely intended to save space on very small screens, but `0.6rem` is too tight — the cards visually merge. Raising it to `0.75rem` provides adequate separation without wasting space.

4. **No interaction between the three breakpoints**: The three breakpoints were written independently. The ≤720px block handles the column change but not padding; the ≤560px global rule handles overall card padding but not stat-specific needs; the ≤400px block handles gap but overshoots the reduction.

## Correctness Properties

Property 1: Bug Condition — Mobile Stat Cards Have Adequate Padding and Gap

_For any_ viewport width where the bug condition holds (isBugCondition returns true — i.e., viewport ≤ 720px), the fixed `.dash-stat` cards SHALL have internal padding and inter-card gap values that meet or exceed the minimum comfortable thresholds: `padding ≥ 0.9rem 1rem` and `gap ≥ 0.75rem`, ensuring labels and values have sufficient breathing room.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Desktop and Non-Stat Styles Are Unchanged

_For any_ viewport width where the bug condition does NOT hold (isBugCondition returns false — i.e., viewport > 720px), the fixed code SHALL produce exactly the same computed styles as the original code for `.dash-stats`, `.dash-stat`, and all other dashboard sections, preserving the 4-column grid, the global `.card` padding, and all other layout properties.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

**File**: `src/routes/dashboard/+page.svelte`

**Location**: The scoped `<style>` block — specifically the existing `@media (max-width: 720px)` and `@media (max-width: 400px)` blocks.

**Specific Changes**:

1. **Add `.dash-stat` padding override in `@media (max-width: 720px)`**: When the grid switches to 2 columns, restore comfortable internal padding that compensates for the narrower card width and the upcoming global padding reduction at ≤560px.
   - Add: `.dash-stat { padding: 1rem 1.1rem; }`
   - This overrides the global `.card { padding: 1.25rem 1.4rem }` with a slightly tighter but still comfortable value appropriate for the 2-column layout.

2. **Increase gap in `@media (max-width: 400px)`**: Change the gap from `0.6rem` to `0.75rem` to keep cards visually distinct on very small screens.
   - Change: `.dash-stats { gap: 0.6rem; }` → `.dash-stats { gap: 0.75rem; }`

3. **Add `.dash-stat` padding override in `@media (max-width: 400px)`**: For very small screens, apply a slightly reduced but still adequate padding.
   - Add: `.dash-stat { padding: 0.9rem 1rem; }`

4. **Rename HTML classes** to avoid daisyUI: `stats` → `dash-stats`, `stat` → `dash-stat`.

5. **Label alignment**: `.dash-stat .label { min-height: 2.6em; }` at ≤720px and ≤400px so two-line labels align values across the 2×2 grid.

No changes to `app.css` or any other component or route.

**Before (relevant excerpt):**

```css
@media (max-width: 720px) {
  .dash-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* no .dash-stat padding override */
}

@media (max-width: 400px) {
  .dash-stats {
    gap: 0.6rem;
  }
  .dash-stat .value {
    font-size: 1.25rem;
  }
}
```

**After (summary — see `+page.svelte` for full rules):**

```html
<div class="dash-stats">
  <div class="card dash-stat">…</div>
</div>
```

```css
.dash-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  width: 100%;
}

@media (max-width: 720px) {
  .dash-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dash-stat {
    padding: 1rem 1.1rem;
  }
  .dash-stat .label {
    min-height: 2.6em;
  }
}

@media (max-width: 400px) {
  .dash-stats {
    gap: 0.75rem;
  }
  .dash-stat {
    padding: 0.9rem 1rem;
  }
  .dash-stat .label {
    font-size: 0.72rem;
    min-height: 2.6em;
  }
  .dash-stat .value {
    font-size: 1.25rem;
  }
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the cramped appearance on the unfixed code, then verify the fix produces adequate spacing and preserves all existing behavior.

The primary testing tools are CSS source-rule assertions (Vitest), a daisyUI collision guard on markup, and visual snapshot comparisons (Playwright). Property-based testing applies to the viewport-width domain — generating many viewport widths across the bug range and verifying the computed padding and gap values.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the cramped styles BEFORE implementing the fix. Confirm the root cause analysis — specifically that the missing `.dash-stat` padding override and the over-reduced gap are the sole causes.

**Test Plan**: Write tests that render the dashboard stat cards at various mobile viewport widths and assert the computed `padding` and `gap` values. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:

1. **375px viewport test**: Render `.dash-stat` at 375px width and assert `padding` — will fail on unfixed code (gets `0.95rem 1rem` from global `.card`, no stat override).
2. **360px viewport test**: Render `.dash-stats` at 360px and assert `gap` — will fail on unfixed code (gets `0.6rem`).
3. **500px viewport test**: Render `.dash-stat` at 500px (≤720px but >400px) and assert `padding` — will fail on unfixed code (no stat override at this breakpoint).
4. **320px viewport test**: Render both `.dash-stat` padding and `.dash-stats` gap at 320px — both will fail on unfixed code.

**Expected Counterexamples**:

- `.dash-stat` computed padding is `0.95rem 1rem` (from global `.card`) at ≤560px with no stat-specific override.
- `.dash-stats` computed gap is `0.6rem` at ≤400px.
- Possible causes confirmed: missing `.dash-stat { padding }` in the 720px and 400px breakpoints; gap value too small in the 400px breakpoint.

### Fix Checking

**Goal**: Verify that for all viewport widths where the bug condition holds, the fixed stat cards have adequate padding and gap.

**Pseudocode:**

```
FOR ALL viewport WHERE isBugCondition(viewport) DO
  render dashboard stat cards at viewport.widthPx
  computedPadding := getComputedStyle(.dash-stat).padding
  computedGap     := getComputedStyle(.dash-stats).gap

  IF viewport.widthPx <= 400 THEN
    -- jsdom returns px (e.g. "14.4px 16px"); compare numerically, not with >= on strings
    ASSERT parseFloat(computedPadding.split(' ')[0]) >= 14.4
    ASSERT parseFloat(computedGap) >= 12
  ELSE IF viewport.widthPx <= 720 THEN
    ASSERT parseFloat(computedPadding.split(' ')[0]) >= 16
  END IF
END FOR
```

The Vitest suite parses the scoped CSS source instead of `getComputedStyle`, so it asserts exact `rem` rule values (`toBe('0.9rem 1rem')`, etc.).

### Preservation Checking

**Goal**: Verify that for all viewport widths where the bug condition does NOT hold (viewport > 720px), the fixed code produces the same computed styles as the original code.

**Pseudocode:**

```
FOR ALL viewport WHERE NOT isBugCondition(viewport) DO
  ASSERT computedStyle_original(.dash-stat, viewport) = computedStyle_fixed(.dash-stat, viewport)
  ASSERT computedStyle_original(.dash-stats, viewport) = computedStyle_fixed(.dash-stats, viewport)
END FOR
```

**Testing Approach**: Property-based testing is well-suited here because:

- It generates many viewport widths automatically across the desktop range (721px–2560px).
- It catches any accidental cascade bleed from the new scoped rules into wider viewports.
- It provides strong guarantees that the fix is truly additive and does not regress desktop layout.

**Test Plan**: Observe computed styles on UNFIXED code at desktop widths first to establish the baseline, then write property-based tests that assert the same values hold after the fix.

**Test Cases**:

1. **Desktop padding preservation**: For viewports 721px–1440px, verify `.dash-stat` computed padding equals the global `.card` value (`1.25rem 1.4rem`).
2. **Desktop gap preservation**: For viewports 721px–1440px, verify `.dash-stats` gap remains `1rem`.
3. **Desktop grid preservation**: For viewports 721px–1440px, verify `.dash-stats` grid-template-columns is `repeat(4, minmax(0, 1fr))`.
4. **Other dashboard sections**: Verify `.latest`, `.formcard`, `.pbcard`, `.chartcard` computed styles are unchanged at all viewport widths.

### Unit Tests

- Assert computed `padding` of `.dash-stat` at 375px equals the fix value (`1rem 1.1rem` from the 720px breakpoint, then `0.9rem 1rem` from the 400px breakpoint).
- Assert computed `gap` of `.dash-stats` at 360px equals `0.75rem` (not `0.6rem`).
- Assert computed `padding` of `.dash-stat` at 800px equals the global `.card` value (`1.25rem 1.4rem`) — no regression.
- Assert all four stat cards render their label and value content correctly at 375px.

### Property-Based Tests

- Generate random viewport widths in `[320, 720]` and verify `.dash-stat` padding meets the minimum threshold for the applicable breakpoint.
- Generate random viewport widths in `[721, 1440]` and verify `.dash-stat` padding and `.dash-stats` gap are identical between the original and fixed code (preservation).
- Generate random viewport widths in `[320, 400]` and verify `.dash-stats` gap is `0.75rem` (not `0.6rem`).

### Integration Tests

- Render the full dashboard at 375px (Playwright / browser) and visually verify the stats section is not cramped — screenshot comparison.
- Render the full dashboard at 800px and verify the stats section is unchanged from the pre-fix baseline — screenshot comparison.
- Verify that switching between mobile and desktop viewport widths (resize) does not produce layout artifacts in the stats section.
