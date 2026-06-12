# Implementation tasks: EXR source flag

Spec: `.kiro/specs/exr-source-flag/`
**Hard dependency: PR #61 must be merged before any task below is started.**
PR #61 introduces `Workout.source` in `mapResult()`. The demo-mode tasks
(Task 3) can be validated locally without real API traffic, but all other tasks
depend on #61 being live.

---

## Tasks

- [x] 1. Pure detector + unit tests
  - [x] 1.1 Create `src/lib/exrSource.ts` exporting `isExrSource(workout?: Pick<Workout, 'source'> | null): boolean`.
        The function returns `true` iff `workout?.source?.toUpperCase() === 'EXR'`
        (observed EXR token; Concept2 docs do not enumerate `source` values).
        No DOM access; safe in server, client, and test contexts.
  - [x] 1.2 Create `src/lib/exrSource.test.ts` with Vitest unit tests covering:
        - `source: 'EXR'` → `true`
        - `source: 'exr'` (lowercase) → `true`
        - `source: 'ErgData'` → `false`
        - `source: 'Web'` → `false`
        - `source` absent (`{}`) → `false`
        - `workout` null / undefined → `false`
  - [x] 1.3 Run `pnpm run test` locally to confirm the new tests pass before
        proceeding.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. i18n keys — all six locales
  - [x] 2.1 Add `replay.mSource`, `replay.exrBadge`, and `replay.exrBadgeTitle`
        to `src/lib/locales/en.ts` with the English values from the design.
        Insert the three keys after the existing `mDevice` / `mErgModel` block
        for readability.
  - [x] 2.2 Add the same three keys (with appropriate translations or placeholders)
        to `zh.ts`, `de.ts`, `es.ts`, `fr.ts`, and `ja.ts`.
  - [x] 2.3 Run `pnpm run validate:locales` and confirm zero missing-key errors.
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 3. Demo mode — EXR-sourced mock workout
  - [x] 3.1 Add optional `source?: string` to the `Spec` interface in
        `src/lib/mockData.ts`.
  - [x] 3.2 Update `detailFor()` to set `detail.source = spec.source` when
        `spec.source` is present (one-liner alongside existing field assignments).
  - [x] 3.3 Add `source: 'EXR'` to the `id: 1004` "8000m BikeErg" entry in
        `SPECS` (or a different existing entry if preferred).
  - [x] 3.4 Manually verify `/replay/1004` in demo mode shows the EXR badge
        (after badge rendering is added in Task 4).
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 4. EXR badge on the replay / workout-detail page
  - [x] 4.1 Import `isExrSource` from `$lib/exrSource` in
        `src/routes/replay/[id]/+page.svelte`.
  - [x] 4.2 Add a `$derived` reactive variable:
        `const exrFlagged = $derived(isExrSource(detail));`
  - [x] 4.3 In the `.summary` row (after the `lowRes` badge), add:
        ```svelte
        {#if exrFlagged}
          <span class="badge" title={t('replay.exrBadgeTitle')}>{t('replay.exrBadge')}</span>
        {/if}
        ```
  - [x] 4.4 In the "Logging provenance" `<dl>` block (currently after
        `provenanceTitle`), add the `mSource` row at the top:
        ```svelte
        {#if detail.source}
          <div>
            <dt>{t('replay.mSource')}</dt>
            <dd>
              {detail.source}
              {#if exrFlagged}<span class="badge">{t('replay.exrBadge')}</span>{/if}
            </dd>
          </div>
        {/if}
        ```
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [x] 5. EXR badge on the public share page
  - [x] 5.1 Import `isExrSource` from `$lib/exrSource` in
        `src/routes/r/[token]/+page.svelte`.
  - [x] 5.2 Add the same `exrFlagged` derived variable and the badge in the
        header area of the share page, using the same `replay.exrBadge` and
        `replay.exrBadgeTitle` keys.
  - [x] 5.3 Confirm `redactForPublic()` in `src/lib/server/share.ts` requires
        no changes (the `source` field is not in the strip list).
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Quality gate
  - [x] 6.1 `pnpm run check` → zero type errors.
  - [x] 6.2 `pnpm run build` → succeeds.
  - [x] 6.3 `pnpm run test` → green (includes the new `exrSource.test.ts`).
  - [x] 6.4 Manual demo verification:
        - `/replay/1004` shows the EXR badge in the header `.summary` row and in
          the provenance panel.
        - `/replay/1001` (non-EXR) shows no EXR badge.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
