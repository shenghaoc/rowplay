# Raw Field Inspector — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

- [x] **1. `sampleIndexAt`** — `src/lib/replay/engine.ts`
  - Most-recent-sample-at-or-before-`t` index, reusing the bracketing search;
    clamp; `-1` only for empty.
  - _Requirements: 1.1, 1.2, 1.3_

- [x] **2. Inspector pure core** — `src/lib/replay/inspector.ts`
  - `asLoggedStroke(stroke, sport)` (inverse of `mapStrokes`, BikeErg per-1000m
    pace), `distancePerStroke(stroke)`.
  - _Requirements: 2.1, 2.2, 2.4_

- [x] **3. Unit tests** — `engine.test.ts` + `inspector.test.ts`
  - `sampleIndexAt` boundary/empty/between; agreement with `sampleAt`'s lower
    bracket. `asLoggedStroke` round-trips `mapStrokes`; `watts` flagged derived;
    `distancePerStroke` formula + guards.
  - _Requirements: 1.2, 2.2, 6.1_

- [x] **4. InspectorPanel component** — `src/components/InspectorPanel.svelte`
  - Static workout section + per-sample table (field · as-logged · normalized),
    derived rows (progress, split index, DPS). Monospace, tabular-nums, fixed
    columns. Verbatim protocol tokens; i18n descriptions.
  - _Requirements: 2.1, 2.3, 2.4, 4.2, 5.1_

- [x] **5. Replay page wiring + toggle** — `replay/[id]/+page.svelte`
  - `inspectorOpen` toggle by the renderer/quality controls; `sampleIdx` /
    `rawStroke` `$derived` (sample-and-hold, recompute only on index change);
    split-only graceful fallback.
  - _Requirements: 3.1, 3.2, 3.3, 4.1_

- [x] **6. Metadata rows + public redaction** — InspectorPanel + shared view
  - `WorkoutMetadata` on `WorkoutDetail`; render `metadata` (incl. source app)
    when present; `isPublic` prop omits `serialNumber`/`device` on `/r/<token>`.
    Optional-chained so it no-ops until full-fidelity-data lands.
  - _Requirements: 5.2, 5.3, 5.4_

- [x] **7. i18n** — all six locales
  - `inspector` block (toggle, headings, column headers, field descriptions,
    no-stroke-data note, "derived" tag). `pnpm run validate:locales`.
  - _Requirements: 4.3, 6.2_

- [x] **8. E2E + full gate** — `tests/e2e/inspector.spec.ts`
  - Demo: toggle inspector, raw value **holds** within a sample span and
    **changes** across a boundary; toggle keyboard-operable. Then `check` +
    `build` + `test` + `validate:locales` + `test:e2e`.
  - _Requirements: 1.3, 4.3, 6.3_
