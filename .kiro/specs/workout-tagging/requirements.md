# Workout Type Tagging — Requirements

## Introduction

rowplay's workout list shows every session as an identical row — a 10k steady
state looks the same as a 4 × 2000m interval session or a 500m all-out sprint.
Athletes who mix workout types (as all well-trained rowers do) have no way to
filter by type or quickly understand the composition of their training history.

This feature adds **auto-detected workout type tags** (steady-state, interval,
race-piece, time-trial, warmup-cooldown) to every workout, with user-overridable
manual labels and a type filter in the workout list. The auto-detection is
rule-based from split structure — no ML, no new API calls.

## Requirements

### Requirement 1 — Auto-detection

**User story:** As an athlete, I want the app to automatically label each workout
with its type, so that I don't have to categorise sessions manually.

#### Acceptance criteria

1. WHEN a workout is displayed THEN the system SHALL show its auto-detected type
   tag (steady-state, interval, race-piece, time-trial, warmup-cooldown, or
   unknown).
2. Detection SHALL use only the workout's split and interval structure — no
   external data, no ML.
3. A workout SHALL be classified as `interval` when it has ≥ 2 work intervals
   separated by distinct rest periods.
4. A workout SHALL be classified as `warmup-cooldown` when it is a single piece
   shorter than 8 minutes with average pace slower than 125 % of the athlete's
   median pace.
5. A workout SHALL be classified as `race-piece` when it is a single piece
   shorter than 12 minutes OR at most 2 000 m, with average pace ≤ 125 % of the
   athlete's median pace.
6. A workout SHALL be classified as `time-trial` when it is a single piece
   between 12 and 35 minutes with pace variance under 3 s/500m across splits.
7. A workout SHALL be classified as `steady-state` when it is a single piece
   longer than 35 minutes with low pace variance (under 6 s/500m).
8. WHEN a workout does not match any specific pattern THEN it SHALL be tagged
   `unknown` rather than incorrectly assigned a type.

### Requirement 2 — User override

**User story:** As an athlete, I want to override the auto-detected tag when the
app guesses wrong, and have my choice persist.

#### Acceptance criteria

1. WHEN the athlete taps the tag badge THEN the system SHALL offer the full list
   of tag options plus a "— Auto-detect —" (clear) option.
2. WHEN the athlete selects a tag THEN it SHALL be saved server-side (D1 in live
   mode; optimistic state in demo mode) and SHALL be reflected immediately in
   the UI via optimistic update.
3. WHEN the athlete selects "Auto-detect" THEN the server-side override SHALL be
   cleared and the auto-detected tag SHALL be shown again.
4. WHERE the save fails THEN the system SHALL revert the optimistic update and
   show an error toast.

### Requirement 3 — Filtering

**User story:** As an athlete, I want to filter my workout list by type, so that
I can review all my interval sessions or all my race pieces in sequence.

#### Acceptance criteria

1. THE dashboard workout list SHALL include a "Type" filter that allows selecting
   one tag (or "All types").
2. WHEN a type filter is active THEN only workouts whose resolved tag (user
   override or auto-detected) matches SHALL be shown.
3. Type filtering SHALL be client-side — no new server requests.

### Requirement 4 — Quality

**User story:** As the maintainer, I want the feature to meet rowplay's bar.

#### Acceptance criteria

1. Tag auto-detection and tag resolution SHALL be pure functions in a dedicated
   module and SHALL be covered by Vitest unit tests: all 6 tag types, boundary
   conditions, user-override resolution, null-override fallback to auto-detect.
2. The PATCH API endpoint SHALL be covered by a unit test (fake D1 + fake
   RequestEvent): valid tag saves; null clears; 401 without auth; 400 with
   unrecognised tag string.
3. Every user-visible string SHALL be added to all six locale files (en, zh, de,
   es, fr, ja) via `i18n.t()`.
4. The feature SHALL pass the full quality gate: `npm run check` (0 errors),
   `npm run build`, and `npm run test` (count must not decrease).
5. The feature SHALL work in demo mode without D1 writes.
