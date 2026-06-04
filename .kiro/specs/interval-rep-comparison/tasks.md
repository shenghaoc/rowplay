# Interval Rep Comparison — Tasks

Implementation plan. Requirement references point at `requirements.md`.

- [x] **1. Pure rep-comparison core** — `src/lib/repComparison.ts`
  - Types: `RepSeries`.
  - `detectReps(workout: WorkoutDetail): RepSeries[] | null`
    - Filter work intervals (≥ 30 s each, ≥ 2 total).
    - Build zero-based time axis per rep from stroke data (preferred) or split
      averages (fallback).
    - Return `null` when criteria not met.
  - `repAvgPace(series: RepSeries): number`
  - _Requirements: 1.1, 1.2, 1.3_

- [x] **2. Unit tests** — `src/lib/repComparison.test.ts`
  - Multi-rep detection: exactly-2 qualifying intervals passes; 1 fails; rest
    intervals not counted.
  - Series zero-basing: every `times[0] === 0`.
  - Average pace maths: known values assert expected result.
  - Empty HR: `hr` array all-zeros when no HR data in workout.
  - _Requirements: 4.1_

- [x] **3. Rep comparison panel** — `src/routes/replay/[id]/+page.svelte`
  - Call `detectReps` with the hydrated `WorkoutDetail`; store result in a
    derived or local variable.
  - Render the panel only when result is non-null (Req 3.3).
  - Collapsed `<details>/<summary>` or daisyUI `collapse` with header showing
    rep count via `i18n.t('replay.repComparisonN', { n })`.
  - Metric selector: segmented control (daisyUI `join` of `btn btn-sm`) for
    Pace / Stroke rate / Power / Heart rate; HR disabled when unavailable.
  - _Requirements: 1.1, 1.2, 2.5, 2.6, 3.1, 3.3_

- [x] **4. uPlot overlay chart** — inline in the panel or extracted to a
  dedicated Svelte component `RepComparisonChart.svelte`
  - Initialise a uPlot instance when the panel expands; destroy on collapse or
    component unmount.
  - Multi-series data from `RepSeries[]` using `uPlot.AlignedData` format: a
    shared normalised X grid with each rep's metric array padded with `null` or
    interpolated onto that grid before rendering. Reps with different stroke
    timestamps/durations must be aligned to a common X axis.
  - Palette from a constant 6-colour array.
  - Legend: `"Rep N — M:SS.T avg"` with click-to-highlight interaction.
  - Re-initialise chart (or update series) when metric selection changes.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2_

- [x] **5. i18n keys** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
  - Add all `replay.repComparison*` keys to all six locale files.
  - `npm run validate:locales` passes.
  - _Requirements: 4.2_

- [x] **6. Quality gate**
  - `npm run check` → 0 errors.
  - `npm run build` → succeeds.
  - `npm run test` → green, count ≥ previous.
  - _Requirements: 4.3, 4.4, 4.5_
