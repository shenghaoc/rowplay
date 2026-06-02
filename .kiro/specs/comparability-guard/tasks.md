# Comparability Guard — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

- [x] **1. `durationBand` helper** — `src/lib/analytics.ts`
  - Add `DurationBand` interface and `durationBand(seconds: number): DurationBand`
    alongside the existing `distanceBand`. Standard targets with ±10% snap window
    (60 s, 240 s, 1200 s, 1800 s, 3600 s); coarse range fallback.
  - _Requirements: 2.1, 2.2, 2.3_

- [x] **2. Comparability guard module** — `src/lib/replay/comparabilityGuard.ts`
  - `ComparabilityAxis` type, `classifyAxis(workoutType?)`, `ComparableContext`
    interface, `areComparable(a, b)`. Pure and DOM-free; re-exports `durationBand`
    from analytics for convenience.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3_

- [x] **3. Unit tests** — `src/lib/comparabilityGuard.test.ts`
  - Five mandatory `areComparable` cases: 2k-vs-500m rejected, 2k-vs-2k
    accepted, 30min-vs-30min accepted, 2k-vs-30min rejected, cross-sport
    rejected. `durationBand` standard-target snap, coarse fallback, boundary.
    `classifyAxis` for `"JustRow"`, `"FixedTimePace"`, `undefined`, unknown
    string.
  - _Requirements: 7.1, 7.2, 7.3_

- [x] **4. Ghost picker guard** — `src/lib/replay/ghostPick.ts`
  - Extend `GhostPickContext` with optional `time` and `workoutType`.
  - Replace the existing sport-only filter with
    `areComparable(current, candidate)`.
  - Update (or add) `ghostPick.test.ts` to cover the new rejection cases.
  - _Requirements: 4.1, 4.3, 7.4_

- [x] **5. Replay page wiring** — `src/routes/replay/[id]/+page.svelte`
  - Pass `time` and `workoutType` from `detail` into `GhostPickContext` on
    the `onModeChange` auto-pick call.
  - Filter the ghost `<select>` options to `areComparable(detail, candidate)`.
  - Show `t('comparability.noComparableCandidates')` when the filtered list is
    empty.
  - _Requirements: 4.2, 4.3, 4.4_

- [x] **6. /compare hard block** — `src/routes/compare/+page.svelte`
  - Add `incomparableReason` derived value using `classifyAxis`,
    `distanceBand`, `durationBand`.
  - Replace the existing soft `crossSport` warning with the unified error card
    (i18n key `comparability.blockedTitle` + reason + guidance).
  - Wrap all comparison rendering in `{#if !incomparableReason}`.
  - Add `<optgroup>` grouping in the workout picker dropdowns.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] **7. Mock data** — `src/lib/mockData.ts`
  - Add one fixed-time workout (e.g. id `1012`, 30-minute JustRow) to the
    WORKOUT_SPECS so demo mode has a mixed-axis pool.
  - _Requirements: 6.1, 6.2, 6.3_

- [x] **8. i18n** — all six locale files
  - Add `comparability` block (blockedTitle, guidance, noComparableCandidates,
    reason.crossSport, reason.crossAxis, reason.crossBand) to `en`, `zh`,
    `de`, `es`, `fr`, `ja`. Run `npm run validate:locales`.
  - _Requirements: 8.1, 8.2, 8.3_

- [x] **9. Quality gate**
  - `npm run check` (0 errors) + `npm run build` + `npm run test` (all green,
    including new comparability tests) + `npm run validate:locales`.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
