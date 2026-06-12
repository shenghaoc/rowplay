# DPS Trend Over Time — Tasks

Implementation plan. Requirement references point at `requirements.md`.

- [ ] **1. Pure DPS trend core** — `src/lib/dpsTrend.ts`
  - Types: `DpsPoint`, `MovingAvgPoint`.
  - `computeDpsTrend(workouts, sport?): DpsPoint[]`
    - Filter to workouts where `strokeCount` is defined and > 0, AND average pace > 0.
    - Compute `rawDps = distance / strokeCount`.
    - Compute `referencePace` = median `avgPaceSecs` across points (or 120 if
      < 3 points).
    - Compute `normDps = rawDps × sqrt(referencePace / avgPaceSecs)`.
    - Sort by date ascending.
  - `movingAverage(points, metric, windowDays): MovingAvgPoint[]`
    - Centred window: for each point, average all points within ±windowDays/2
      calendar days (shrinking at edges).
  - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [ ] **2. Unit tests** — `src/lib/dpsTrend.test.ts`
  - DPS formula: `distance=10000`, `strokeCount=500` → `rawDps=20`.
  - Normalisation identity: when `avgPaceSecs === referencePace`, `normDps ===
    rawDps`.
  - Exclusion: workout with undefined `strokeCount` not in output.
  - Moving average: 5 points, window 3 days → known mean for middle point.
  - Empty input → empty output array.
  - _Requirements: 3.1_

- [ ] **3. Dashboard DPS chart** — `src/routes/dashboard/+page.svelte`
  - Call `computeDpsTrend(workouts, selectedSport)` (filter wired to the
    existing global `sportFilter` state — no separate segmented control needed).
  - Show empty-state message when result is empty.
  - Raw / normalised toggle (`toggle toggle-sm`).
  - MA window toggle: 7-day / 28-day.
  - Use the existing `UPlotChart` component (`src/components/UPlotChart.svelte`)
    instead of manually instantiating uPlot; `UPlotChart` manages lifecycle,
    `ResizeObserver`, and cleanup on unmount.
  - Click handler on data points → `goto('/replay/' + point.workoutId)`.
  - Tooltip via uPlot cursor plugin showing date, DPS, pace.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1_

- [ ] **4. i18n keys** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
  - Add all `dashboard.dpsTrend.*` keys to all six locale files.
  - `pnpm run validate:locales` passes.
  - _Requirements: 3.2_

- [ ] **5. Quality gate**
  - `pnpm run check` → 0 errors.
  - `pnpm run build` → succeeds.
  - `pnpm run test` → green; count ≥ previous.
  - _Requirements: 3.3, 3.4_
