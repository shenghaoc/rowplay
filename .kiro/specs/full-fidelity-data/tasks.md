# Full-fidelity Concept2 Data — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

- [x] **1. Confirm the read schema** — capture a real
  `GET /api/users/me/results/{id}` response (interval + steady) and verify the
  three open items: is `workout.targets` echoed on read; is the result
  `metadata` block echoed (and which keys); are rest periods separate
  `intervals[]` rows or only `rest_time`/`rest_distance` on work rows. Record
  findings in `design.md`; downgrade any read-absent field to "best-effort when
  present".
  - _Requirements: 1.2, 1.3, Open verification_

- [x] **2. Widen the shared types** — `src/lib/types.ts`
  - Add `HeartRateDetail`, `WorkoutTargets`, `LoggingMetadata`.
  - Add the optional fields to `Workout` and `Split`; keep
    `heartRateAvg`/`hrMin`/`hrMax` populated for back-compat.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.3_

- [x] **3. Widen the mapping** — `src/lib/server/concept2.ts`
  - Extend `RawResult`/`RawSplit` + add raw target/metadata/HR shapes.
  - `mapResult`/`mapSplits` populate new fields with correct units; absent →
    `undefined`. Add `mapHeartRate`/`mapTargets`/`mapMetadata` helpers.
  - Re-confirm stroke capture is complete (no `RawStroke` change expected).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.4_

- [x] **4. Mapping unit tests** — `src/lib/server/concept2.test.ts`
  - Every new field maps with correct units; absent → `undefined`; bike pace
    halving and interval `t`/`d` reset still hold.
  - _Requirements: 1.4, 1.5, 2.1, 2.2, 6.2_

- [x] **5. Cache version bump** — `src/lib/server/db.ts`
  - Bump `DETAIL_PAYLOAD_VERSION`; confirm the version guard re-hydrates stale
    payloads and never renders a partial old shape.
  - _Requirements: 3.1, 3.2_

- [x] **6. Demo data** — `src/lib/mockData.ts`
  - Extend mocks so an interval piece carries full HR (ending/recovery), rest,
    per-split detail, targets, and metadata; a steady piece carries HR recovery.
  - _Requirements: 6.2_

- [x] **7. Analysis core** — `src/lib/analytics.ts` (+ `analytics.test.ts`)
  - `hrRecoveryTrend`, `workRestEfficiency`, `targetVsActual` — pure, fixture-
    tested.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] **8. Public-view redaction** — `src/lib/server/share.ts`
  - `redactForPublic(detail)` strips `serialNumber`/`device` (and sensitive
    metadata) from the `/r/<token>` detail; unit-tested.
  - _Requirements: 6.1_

- [x] **9. Metadata panel + richer splits** — `replay/[id]/+page.svelte`
  - "Full metrics" panel listing every present result field + provenance
    sub-block + target-vs-actual; splits view gains calories/watt-minutes/HR/
    interval type + rest. Present-only rows; `format.ts` formatting.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] **10. i18n** — all six locales
  - Keys for every new label (metadata fields, provenance, targets, HR
    recovery, work:rest). `npm run validate:locales`.
  - _Requirements: 4.4, 6.3_

- [x] **11. E2E + full gate** — `tests/e2e/`
  - Demo: open an interval replay, expand "Full metrics", assert HR-recovery +
    target-vs-actual rows render; open via public `/r/<token>` and assert no
    serial/device shown. Then `check` + `build` + `test` + `validate:locales` +
    `test:e2e`.
  - _Requirements: 4.1, 6.1, 6.4_
