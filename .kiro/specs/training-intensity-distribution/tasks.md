# Training Intensity Distribution — Tasks

Implementation plan. Requirement references point at `requirements.md`.

- [ ] **1. Pure training-zones core** — `src/lib/trainingZones.ts`
  - `ZONES_5`, `ZONES_3`, `ZoneConfig`, `ZoneSlice`, `ZoneDistribution`.
  - `classifyPace(pace, config): ZoneLabel` — 5-zone when `basePace` non-null;
    3-zone fallback.
  - `buildDistribution(workouts, config): ZoneDistribution` — iterates workouts,
    picks stroke > split > summary data source per workout, accumulates seconds
    and metres per zone.
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] **2. Unit tests** — `src/lib/trainingZones.test.ts`
  - 5-zone boundary values: pace exactly at each threshold → correct zone.
  - 3-zone fallback: no basePace → uses medianPace; correct boundaries.
  - `buildDistribution`: pure-summary workouts accumulate correctly; total
    seconds matches sum of workout durations.
  - Empty workout array → all slices at 0 seconds/metres.
  - _Requirements: 4.1_

- [ ] **3. Dashboard TID chart** — `src/routes/dashboard/+page.svelte`
  - Compute `ZoneConfig` from available personal bests (2k pace → 5-zone;
    fallback → medianPace via a helper).
  - Period filter: local `$state` defaulting to "Last 4 weeks"; filter workouts
    by date before passing to `buildDistribution`.
  - Time/Distance toggle: local `$state`.
  - Render: SVG stacked bar using percentage widths per zone slice; colour
    tokens as CSS custom properties so they respect the theme.
  - Tooltip on hover: zone label + hh:mm + metres + percentage.
  - Empty state when `totalSeconds === 0`.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

- [ ] **4. i18n keys** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
  - Add all `dashboard.tid.*` keys to all six locale files.
  - `npm run validate:locales` passes.
  - _Requirements: 4.2_

- [ ] **5. Quality gate**
  - `npm run check` → 0 errors.
  - `npm run build` → succeeds.
  - `npm run test` → green; count ≥ previous.
  - _Requirements: 4.3, 4.4_
