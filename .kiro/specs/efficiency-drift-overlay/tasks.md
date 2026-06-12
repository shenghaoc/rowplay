# Efficiency-Drift Overlay — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

**Dependency:** PR #63 (raw-field-inspector) must be merged before implementation
begins. That PR provides `distancePerStroke` in `src/lib/analytics.ts` and
`src/lib/replay/inspector.ts`, and is the only DPS source in the codebase.

---

- [x] **1. `EfficiencyDriftResult` type + `efficiencyDrift` function** —
      `src/lib/analytics.ts`
  - Export `EfficiencyDriftResult` interface (`series`, `baseline`,
    `baselineEndD`, `fadeDelta`, `fadePercent`).
  - Implement `efficiencyDrift(strokes)`: filter valid DPS points via existing
    `distancePerStroke(pace, spm)`; derive opening/closing segments (500 m or
    10% threshold, min 5 valid strokes); compute baseline mean, closing mean,
    fadeDelta, fadePercent.
  - Return zero result (`series: []`, all numbers 0) when fewer than 5 valid
    DPS samples.
  - Pure; no DOM; no Svelte imports.
  - _Requirements: 1.1–1.9_

- [x] **2. Unit tests for `efficiencyDrift`** — `src/lib/analytics.test.ts`
      (or `src/lib/efficiencyDrift.test.ts`)
  - Steady fixture: constant pace/spm → flat series, `|fadeDelta| < 0.01`.
  - Fading fixture: pace degrades → `fadeDelta < 0`, series non-increasing.
  - Short fixture (< 5 valid strokes) → zero result with empty series.
  - Gap fixture (some strokes have `pace = 0`) → series omits those points.
  - Short-piece fixture (total distance < 5000 m) → 10% threshold applies,
    min-5 floor is respected.
  - _Requirements: 1.1–1.9, 7.3_

- [x] **3. Chart theme — `var(--dps)` role** — `src/lib/chartTheme.ts`
  - Ensure a `'dps'` `SeriesRole` entry exists with appropriate `color` values
    for light and dark themes (warm amber, e.g. `#d97706` / `#fbbf24`).
  - If `--dps` CSS variable is already present from an existing DPS chart, verify
    it is defined in both `[data-theme="light"]` and `[data-theme="dark"]` selectors
    (or equivalent). Add it if missing.
  - _Requirements: 3.4_

- [x] **4. Page `$derived` wiring + null-padded overlay data** —
      `src/routes/replay/[id]/+page.svelte`
  - `import { efficiencyDrift, type EfficiencyDriftResult } from '$lib/analytics'`.
  - `const drift = $derived(efficiencyDrift(strokes))` — recomputes only when
    `strokes` changes, not per frame.
  - `let driftOverlayOn = $state(false)` — off by default.
  - `const dpsAligned = $derived.by(...)` — aligns `drift.series` to the full
    `xs` array with `null` for missing points.
  - Extend `paceData` to include `dpsAligned` when non-null.
  - _Requirements: 3.3, 3.6, 2.3_

- [x] **5. Dual-series pace chart options** — `src/routes/replay/[id]/+page.svelte`
  - When `driftOverlayOn` is true, build overlay chart options: right-side DPS
    y-axis (not inverted), `spanGaps: false` on the DPS series, `color: 'var(--dps)'`.
  - Add `drawHook` (uPlot plugin or `hooks.draw`) to render a dashed horizontal
    baseline line at `y = drift.baseline` in DPS y-axis coordinates, coloured
    with a muted tone.
  - When `driftOverlayOn` is false, fall back to the existing single-series
    pace-only options (no regression to existing behaviour).
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [x] **6. Toggle button and fade summary badge** —
      `src/routes/replay/[id]/+page.svelte`
  - Render the toggle button inside the pace chart card only when
    `drift.series.length >= 5`.
  - `aria-pressed={driftOverlayOn}`, keyboard-operable, visible focus ring.
  - Render the fade summary (`baseline`, `fadeDelta`, `fadePercent`) below the
    toggle when `driftOverlayOn` is true and `drift.series.length >= 5`.
  - Apply `.good` / `.warn` / `.bad` semantic colour classes per the thresholds
    (`fadeDelta >= 0` → good; `fadePercent` in [−5, 0) → warn; < −5 → bad).
  - Add `.warn` CSS class definition (amber) alongside existing `.good` / `.bad`
    if not yet present.
  - _Requirements: 4.1–4.3, 6.2_

- [x] **7. i18n — all six locales** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
      (or `.json`)
  - Add `drift` block: `toggle`, `toggleOn`, `baseline`, `fade`, `unit`,
    `summaryTitle`, `summaryHint`, `axisLabel`.
  - Run `pnpm run validate:locales` after each locale file is updated; all must
    pass before the task is closed.
  - _Requirements: 6.1–6.3_

- [x] **8. E2E smoke test** — `tests/e2e/efficiency-drift.spec.ts`
  - In demo mode at `/replay/1001` (WebKit):
    1. Assert toggle button is present and has `aria-pressed="false"`.
    2. Click the toggle; assert `aria-pressed="true"`.
    3. Assert the fade summary element is visible and contains a numeric string
       matching `/\d+\.\d/` (e.g. `"8.2"`).
  - _Requirements: 5.1, 6.2, 7.4_

- [x] **9. Full quality gate** — (no code; CI verification step)
  - `pnpm run check` → 0 errors.
  - `pnpm run build` → succeeds.
  - `pnpm run test` → green (including new unit tests from task 2).
  - `pnpm run validate:locales` → no missing keys.
  - `pnpm run test:e2e` → passes (including task 8 smoke spec).
  - _Requirements: 7.1–7.4_
