# Heart-Rate Device Import — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

- [x] **1. Pure HR merge core** — `src/lib/hrImport.ts`
  - `HrSample`, `extractHrSeries`, `interpolateHr`, `mergeHrIntoStrokes`,
    `summarizeHr`, `applyHrImport`, `stripHrFromDetail`, `parseHrFile`.
  - _Requirements: 2.4, 3.3, 3.4, 5.1_

- [x] **2. Unit tests** — `src/lib/hrImport.test.ts`
  - Interpolation edges, offset mapping, apply/strip, parse rejection.
  - _Requirements: 5.1_

- [x] **3. Demo workout without HR** — `src/lib/mockData.ts`
  - `omitHr` on spec id 1002; no `hr` on strokes or summary HR fields.
  - _Requirements: 1.3_

- [x] **4. Server helpers + API** — `src/lib/server/hrImport.ts`,
      `src/routes/api/workouts/[id]/hr-import/+server.ts`
  - POST merge + cache; DELETE strip/refetch; 401 in live mode.
  - _Requirements: 4.2, 4.5_

- [x] **5. Replay import UI** — `src/routes/replay/[id]/+page.svelte`
  - Import panel, offset slider, preview, apply/clear, demo localStorage.
  - Wire `effectiveDetail` / strokes into existing engine path.
  - _Requirements: 1.1, 1.2, 2.1–2.3, 3.1–3.2, 4.1, 4.3, 4.4_

- [x] **6. i18n** — `src/lib/i18n.ts` (en + zh)
  - All `replay.hrImport.*` keys from design.
  - _Requirements: 5.2_

- [x] **7. E2E smoke + fixture** — `tests/fixtures/hr-watch.csv`,
      `tests/e2e/hr-import.spec.ts`
  - _Requirements: 5.3_

- [x] **8. Full gate + HANDOFF** — run check/build/test/e2e; remove parking-lot
      line from `HANDOFF.md`; check task boxes in this file.
  - _Requirements: 5.3_
