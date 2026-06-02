# EXR source flag — requirements

## Introduction

Some Concept2 logbook entries are recorded by **EXR** (the virtual rowing game)
rather than by the PM5 performance monitor or a faithful logging app such as
ErgData or ErgZone. EXR synthesises its own pace and power using its own
algorithms; the resulting numbers are **not directly comparable** to PM-derived
data from the same athlete on the same machine.

The guiding tenet for this feature is: **"never accept wrong, meaningless
representations."** Showing EXR data as if it were PM-logged data is a false
representation. The correct response is not to exclude or recompute the data, but
to flag its provenance honestly so athletes and coaches can interpret it
accordingly.

**Decision (locked):** FLAG only. Do not quarantine EXR pieces from
PBs/leaderboards/analytics, and do not attempt to re-derive their numbers. Show
the data as-is, caveated with an "EXR / algorithmic source" badge.

**Hard dependency:** PR #61 captures the `source` field from the Concept2
results endpoint into `Workout.source` (already present in `src/lib/types.ts`)
and surfaces it in the metadata panel. This spec depends on that data being
available. All implementation tasks must not be started until #61 is merged.

**Concept2 API alignment:** The Logbook reference documents `source` as a string
but only illustrates `"Web"` and `"ErgData"`. It does **not** guarantee `"EXR"`
(or `"ErgZone"`). rowplay treats `source` as a free string; the EXR badge fires
only when the value matches the **observed-in-the-wild** `"EXR"` token
(case-insensitive). Verify against real logbook data when extending matchers.

**D1 note:** The `workouts` summary table does not persist `source`; replay/detail
and share views read it from API responses or the `workout_detail` JSON cache.
List/dashboard badges would require persisting `source` separately (out of scope).

---

## Requirement 1: Pure EXR detector

**User Story:** As a developer, I want a single source-of-truth helper that
answers "is this workout EXR-sourced?" from the `source` field so every consumer
is consistent.

### Acceptance Criteria

1. GIVEN a `Workout` or `WorkoutDetail` whose `source` field equals the observed
   `"EXR"` token (case-insensitive), WHEN `isExrSource(workout)` is called, THEN
   it SHALL return `true`.
2. GIVEN a workout whose `source` field is absent, the workout reference is
   `null`/`undefined`, or `source` is any other value (e.g. documented examples
   `"ErgData"`, `"Web"`, or other observed strings), WHEN `isExrSource(workout)`
   is called, THEN it SHALL return `false`.
3. The helper SHALL be a pure function with **no DOM dependency** so it can be
   imported by server, client, and unit-test contexts alike.
4. The helper SHALL live in `src/lib/exrSource.ts` alongside a companion Vitest
   unit-test file `src/lib/exrSource.test.ts`.
5. The unit tests SHALL cover both the `true` and `false` paths, including the
   absent-`source` case.

---

## Requirement 2: EXR badge on the replay / workout-detail page

**User Story:** As an athlete viewing a replay or workout detail, I want to see
an "EXR / algorithmic source" badge near the workout headline so I immediately
know the pace and power figures were synthesised by EXR, not read from the PM.

### Acceptance Criteria

1. WHEN `isExrSource(detail)` is `true`, THEN a visible badge SHALL appear in
   the workout header area of `src/routes/replay/[id]/+page.svelte`, adjacent to
   the existing `lowRes` badge in the `.summary` row.
2. The badge text SHALL be the i18n key `replay.exrBadge` (English value:
   `"EXR source"`).
3. The badge SHALL carry an accessible `title` attribute whose text comes from
   i18n key `replay.exrBadgeTitle` (English: `"Pace and power were synthesised
   by EXR, not read from the PM5. Numbers may not be directly comparable to
   PM-logged workouts."`).
4. The badge SHALL be rendered using the existing `.badge` CSS class (as used by
   the `lowRes` badge) — no new CSS classes shall be added solely for this
   badge's shape.
5. WHEN `isExrSource(detail)` is `false`, THEN no EXR badge SHALL be rendered
   (no empty DOM node, no conditional wrapper).

---

## Requirement 3: EXR source row in the metadata / provenance panel

**User Story:** As an athlete reading the full workout metadata panel, I want to
see the raw source value and the EXR flag so I can confirm the logging app
alongside the other provenance fields.

### Acceptance Criteria

1. WHEN `detail.source` is a non-empty string, THEN a `<dt>`/`<dd>` row SHALL
   appear in the "Logging provenance" sub-panel (under `provenanceTitle`) with
   the i18n key `replay.mSource` (English: `"Logged by"`).
2. WHEN `detail.source` is absent or empty, THEN no `mSource` row SHALL render.
3. WHEN `isExrSource(detail)` is `true`, THEN the `mSource` `<dd>` SHALL
   additionally carry an inline badge with text from `replay.exrBadge`, making
   the EXR flag discoverable in the metadata drill-down as well as the header.
4. The provenance panel is inside the "Full metrics" `<details>` block and SHOULD
   only be visible to athletes who open that section (no change to panel
   visibility rules).

---

## Requirement 4: Public share view (`/r/[token]`)

**User Story:** As someone viewing a shared replay link, I want to see the EXR
badge if the workout was EXR-sourced so I can contextualise the data I am shown.

### Acceptance Criteria

1. WHEN a shared workout is EXR-sourced, THEN the `/r/[token]` page SHALL render
   the same `replay.exrBadge` badge in its header area.
2. The `source` field SHALL remain in the `redactForPublic` payload — it is not
   hardware-identifying personal data (unlike `serialNumber`, `device`,
   `deviceOs`, `deviceOsVersion` which are already stripped). No change to
   `redactForPublic` is required; `source` passes through today.
3. The badge SHALL use the same i18n keys and `.badge` CSS class as Requirement 2.

---

## Requirement 5: Demo mode — one EXR-sourced workout

**User Story:** As a developer or evaluator running in demo mode, I want one mock
workout to be visibly flagged as EXR-sourced so I can verify the badge without a
live Concept2 account.

### Acceptance Criteria

1. WHEN demo mode is active, THEN at least one workout in `SPECS` in
   `src/lib/mockData.ts` SHALL have `source: 'EXR'` set on its spec and the
   resulting `WorkoutDetail.source` SHALL equal `'EXR'`.
2. Navigating to the replay page for that workout (`/replay/<id>`) SHALL display
   the EXR badge without any further configuration.
3. The change to mock data SHALL be the minimal addition of `source` to the
   `Spec` interface and the chosen entry; no other mock-data behaviour changes.
4. The `id: 1004` "8000m BikeErg" entry is the preferred candidate (a BikeErg
   piece makes it easy to distinguish from PM-logged rower workouts in the demo
   list), but any existing spec is acceptable.

---

## Requirement 6: Internationalisation

**User Story:** As an athlete whose UI language is not English, I want the EXR
badge and tooltip to appear in my language.

### Acceptance Criteria

1. The following i18n keys SHALL be present in **all six locale files**
   (`en`, `zh`, `de`, `es`, `fr`, `ja`) under the `replay` namespace:
   - `replay.exrBadge` — short badge label (e.g. `"EXR source"`)
   - `replay.exrBadgeTitle` — longer tooltip / accessible description
   - `replay.mSource` — metadata-panel label for the "Logged by" row
2. After adding the keys, `npm run validate:locales` SHALL pass with zero
   missing-key errors.
3. Non-English translations MAY use a reasonable machine-translation placeholder
   for the initial implementation, as long as the key is present and non-empty.

---

## Requirement 7: Quality gate

**User Story:** As the maintainer, I want the EXR flag to ship without regressions.

### Acceptance Criteria

1. `npm run check` SHALL report zero type errors (the known
   `state_referenced_locally` warnings remain acceptable).
2. `npm run build` SHALL succeed.
3. `npm run test` SHALL be green, including the new `exrSource.test.ts` unit tests.
4. Manual demo verification: navigating to the EXR-flagged demo workout
   (`/replay/<id>`) SHALL show the badge; any non-EXR workout SHALL NOT show the
   badge.

---

## Non-goals

- Do NOT exclude EXR workouts from PBs, leaderboards, or analytics.
- Do NOT recompute or adjust EXR pace/power figures.
- Do NOT add a user-facing filter to hide EXR workouts.
- Do NOT change public/private visibility rules for shared workouts beyond
  Requirement 4.
- Do NOT add any EXR-specific rendering to the canvas (`renderer.ts`) or replay
  engine.
