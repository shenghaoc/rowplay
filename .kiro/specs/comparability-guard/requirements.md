# Comparability Guard — Requirements

## Introduction

rowplay surfaces two entry points where one workout is raced against, or placed
alongside, another: the **ghost picker** on the replay view and the **/compare**
page. Both currently accept any pairing the user (or the auto-picker) presents —
including a 2k fixed-distance piece against a 30-minute fixed-time piece that
merely covered roughly 2k, or a RowErg effort against a BikeErg. Such pairings
are mathematically meaningless: the shorter/lighter piece wins trivially, and
pace cannot be read as equivalent effort across axes.

The leaderboard already enforces same-sport + same-standard-distance scope as
its fundamental invariant. This feature extends that principle to the ghost
picker and `/compare` with a **hard block**: no pairing is presented to the user
unless it is demonstrably like-for-like.

The guiding tenet is: **never accept wrong, meaningless representations.**

### Dependency

This feature depends on `workout_type` being captured and persisted per workout.
That field is already stored in D1 (`workout_type` column) and exposed on
`Workout` / `WorkoutDetail` from the full-fidelity-data capture spec
(PR #61). No schema migration is required beyond what PR #61 introduces.

## Glossary

- **Comparability axis** — the axis that defines the piece: `distance` (the
  athlete targeted a fixed-distance goal) or `time` (the athlete targeted a
  fixed-time goal). These are separate axes and are never cross-comparable.
- **Comparability key** — a two-tuple `(sport, axis-band)` that must match
  exactly for two pieces to be comparable.
- **Distance band** — a stable bucket key from the existing `distanceBand()`
  helper in `analytics.ts`, e.g. `"2000"`, `"r1500"`.
- **Duration band** — a new analogous stable bucket key, e.g. `"1800"` for a
  30-minute piece.
- **workout_type classification** — mapping the Concept2 `workout_type` string
  (or its absence) to `DistanceAxis` or `TimeAxis`, documented in the design.
- **Hard block** — the ghost picker never shows a candidate that fails the
  comparability predicate; `/compare` refuses (does not merely warn) to render
  an incomparable pairing.

## Requirements

### Requirement 1 — Comparability predicate

**User story:** As an athlete, I want the system to only present me with
ghost and comparison workouts that are genuinely comparable to my current
piece, so I am never misled into drawing wrong conclusions.

#### Acceptance criteria

1. THE system SHALL define a pure predicate `areComparable(a, b)` that returns
   `true` if and only if:
   - `a.sport === b.sport`, AND
   - both pieces are classified on the **same axis** (both `distance` or both
     `time`), AND
   - the pieces fall in the **same axis-band** (same distance-band key for
     distance pieces, same duration-band key for time pieces).
2. THE predicate SHALL be a **pure, DOM-free function** in
   `src/lib/replay/comparabilityGuard.ts` with no side effects.
3. THE predicate SHALL treat a missing or unclassifiable `workout_type` as
   `DistanceAxis` (distance), consistent with the Concept2 convention that an
   unlabelled row is a fixed-distance piece.
4. A fixed-distance 2k (e.g. `workout_type = "FixedDistancePace"`, distance
   2000m) SHALL **not** be comparable to a fixed-time piece (e.g.
   `workout_type = "FixedTimePace"`, duration ≈ 2000m worth of time) even if
   the covered distances happen to be similar.
5. Two workouts on the same sport and same distance band SHALL be comparable
   regardless of whether `workout_type` is populated, because both are treated
   as `DistanceAxis` under Acceptance Criterion 3.

### Requirement 2 — Duration-band helper

**User story:** As a developer maintaining the analytics layer, I want a
`durationBand` helper analogous to `distanceBand`, so that fixed-time pieces
bucket consistently without ad-hoc logic scattered across the codebase.

#### Acceptance criteria

1. THE system SHALL add a pure function `durationBand(seconds: number):
DurationBand` to `src/lib/analytics.ts`, returning `{ key: string; label:
string; nominal: number }`.
2. `durationBand` SHALL snap standard fixed-time targets to a stable key using
   a ±10% window:
   - 1 minute (60 s) → `"60"`
   - 4 minutes (240 s) → `"240"`
   - 20 minutes (1200 s) → `"1200"`
   - 30 minutes (1800 s) → `"1800"`
   - 60 minutes (3600 s) → `"3600"`
3. Values outside all standard windows SHALL fall through to a coarse range
   band (analogous to `distanceBand`'s range fallback), using a stable key
   such as `"r<lo>"`.
4. `durationBand` SHALL be pure and unit-tested (standard targets, coarse
   fallback, boundary values).

### Requirement 3 — workout_type axis classification

**User story:** As a developer, I want a single authoritative mapping from
Concept2 `workout_type` strings to `DistanceAxis | TimeAxis`, so the
classification is not duplicated across the codebase.

#### Acceptance criteria

1. THE system SHALL provide a pure function `classifyAxis(workoutType: string |
undefined): 'distance' | 'time'` in `src/lib/replay/comparabilityGuard.ts`.
2. The function SHALL classify as `'time'` any `workout_type` value whose
   semantics indicate a fixed-time target (e.g. strings containing `"FixedTime"`,
   `"JustRow"`, or the equivalent Concept2 canonical names for timed pieces).
3. All other values, including `undefined`, SHALL classify as `'distance'`.
4. The classification SHALL be unit-tested against representative values
   covering the known Concept2 canonical `workout_type` strings, including
   `undefined`.

### Requirement 4 — Ghost picker hard block

**User story:** As an athlete on the replay view, I want the ghost picker to
only offer me pieces I can meaningfully race against, so I am not tricked into
a trivially unfair matchup.

#### Acceptance criteria

1. THE `pickDefaultGhostCandidate` function in `src/lib/replay/ghostPick.ts`
   SHALL filter its candidate pool to only workouts that satisfy
   `areComparable(current, candidate)` before any further ranking.
2. THE ghost picker dropdown on the replay view SHALL only list workouts that
   pass the comparability predicate; incomparable workouts SHALL NOT appear as
   options.
3. WHEN no comparable candidate exists THE picker SHALL render an empty
   dropdown (no options beyond the placeholder), and `pickDefaultGhostCandidate`
   SHALL return `null`.
4. THE hard block SHALL apply both to the automatic default selection
   (on mode change) and to the explicit user-driven dropdown.

### Requirement 5 — /compare hard block

**User story:** As an athlete on the /compare page, I want the page to refuse
to render a comparison between incomparable workouts with a clear explanation,
so I know why it is blocked and what to do instead.

#### Acceptance criteria

1. WHEN `/compare?a=<id>&b=<id>` resolves both workouts and they fail
   `areComparable`, THE page SHALL display a clear, i18n'd error card in place
   of the comparison charts and stat table.
2. THE error message SHALL name the specific reason the pairing is blocked
   (different sport, different axis, or different band).
3. THE error card SHALL NOT render any comparison metrics, overlay charts, or
   verdict for an incomparable pairing — it is a full hard block, not a warning
   alongside results.
4. THE `/compare` selector dropdowns SHOULD visually distinguish incomparable
   pairings (disabled state or grouped by comparability) so the athlete
   understands the constraint before pressing "Compare".
5. THE block SHALL apply consistently in both demo mode (mock data) and
   authenticated mode.

### Requirement 6 — Demo mode coverage

**User story:** As a developer, I want comparability enforcement to work in
demo mode without any token or real data, so I can test and verify it without
credentials.

#### Acceptance criteria

1. THE mock data in `src/lib/mockData.ts` SHALL include at least one
   fixed-time workout (with a `workoutType` string that classifies as
   `'time'`), so the demo pool contains both axis types.
2. WHEN the demo replay view is opened for a fixed-distance workout, the ghost
   picker SHALL exclude any fixed-time mock workout from the dropdown.
3. WHEN `/compare` is opened in demo mode with one fixed-distance and one
   fixed-time workout id, the page SHALL display the incomparability error card.

### Requirement 7 — Unit tests

**User story:** As the maintainer, I want the comparability logic covered by
fast unit tests, so regressions are caught before reaching production.

#### Acceptance criteria

1. THE test suite SHALL include a `comparabilityGuard.test.ts` with cases
   covering at minimum:
   - 2k-vs-500m (same sport, same axis, **different** band → rejected).
   - 2k-vs-2k (same sport, same axis, same band → accepted).
   - 30min-vs-30min (same sport, time axis, same band → accepted).
   - 2k-vs-30min (same sport, distance vs time axis → rejected).
   - cross-sport (same distance band, different sport → rejected).
2. THE test suite SHALL include `durationBand` cases: standard target snap,
   coarse fallback, and boundary near a window edge.
3. THE test suite SHALL include `classifyAxis` cases: known `FixedTime*`
   strings, `undefined`, and an unknown string.
4. ALL existing tests in `ghostPick.test.ts` (if present) SHALL remain green
   after this change, or be updated to reflect the new hard-block behaviour.

### Requirement 8 — i18n

**User story:** As an international user, I want the comparability error
message to appear in my language, so I understand why the comparison is blocked.

#### Acceptance criteria

1. ALL user-visible strings for the incomparability error card and picker empty
   state SHALL be added to all six locale files (`en`, `zh`, `de`, `es`, `fr`,
   `ja`) under a `comparability` namespace.
2. THE strings SHALL include at minimum: a general "incomparable pairing" title,
   reason strings for each block type (cross-sport, cross-axis, cross-band), and
   a guidance string ("Choose two workouts of the same type and distance").
3. `pnpm run validate:locales` SHALL pass with no missing keys.

### Requirement 9 — Quality gate

#### Acceptance criteria

1. `pnpm run check` SHALL complete with 0 errors (existing `state_referenced_locally`
   warnings are acceptable).
2. `pnpm run build` SHALL succeed.
3. `pnpm run test` SHALL be green, including the new comparability unit tests.
4. `pnpm run validate:locales` SHALL pass.
