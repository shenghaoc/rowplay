# Multi-Distance Performance Predictor — Tasks

Implementation plan. Requirement references point at `requirements.md`.

- [x] **1. Pure predictor core** — `src/lib/performancePredictor.ts`
  - `PREDICTOR_DISTANCES` constant.
  - `predictTimes(knownDistance, knownSeconds): Map<PredictorDistance, number>`
    — applies `T₂ = T₁ × (D₂/D₁)^1.06` for each standard distance; source
    distance maps to `knownSeconds` exactly.
  - `buildPredictionTable(knownDistance, knownSeconds, personalBests): PredictionRow[]`
    — joins predictions with personal bests; assigns `status`.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 5.1_

- [x] **2. Unit tests** — `src/lib/performancePredictor.test.ts`
  - Formula accuracy: verify the community-known equivalence
    7:04 at 2000 m → ~22:50 at 6000 m (±1 s tolerance).
  - Source distance returns entered seconds unchanged.
  - Status classification: beaten/behind/untried at exact boundary values.
  - `buildPredictionTable` with empty personal bests → all 'untried'.
  - _Requirements: 5.1_

- [x] **3. Dashboard predictor card** — `src/routes/dashboard/+page.svelte`
  - Collapsed card; chevron expander.
  - Distance `<select>` listing `PREDICTOR_DISTANCES` with `format.ts`
    formatting.
  - Time `<input>` with M:SS validation (inline parse, or reuse `parsePaceInput`
    if available); error message on invalid input.
  - "Predict" button calls `buildPredictionTable` with the dashboard's already-
    loaded `personalBests` array; result stored in local `$state`.
  - Pre-fill on expand: if `personalBests` contains a RowErg 2k entry, set
    distance = 2000 and pre-fill time.
  - _Requirements: 1.1, 3.1, 3.2, 4.1, 4.2_

- [x] **4. Prediction output table**
  - One row per distance: distance | predicted | your best | status badge.
  - `badge-success` / `badge-warning` / `badge-ghost` for beaten / behind /
    untried.
  - Source distance row: predicted column shows entered time, greyed badge.
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] **5. i18n keys** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
  - Add all `dashboard.predictor.*` keys to all six locale files.
  - `pnpm run validate:locales` passes.
  - _Requirements: 5.2_

- [x] **6. Quality gate**
  - `pnpm run check` → 0 errors.
  - `pnpm run build` → succeeds.
  - `pnpm run test` → green; count ≥ previous.
  - _Requirements: 5.3, 5.4_
