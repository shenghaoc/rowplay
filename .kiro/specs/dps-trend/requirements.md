# DPS Trend Over Time — Requirements

## Introduction

Distance-per-stroke (DPS) is the fundamental technique metric for ergometer
rowing: pulling more metres per stroke at the same split means better efficiency.
Coaches track DPS over months to confirm that technical improvements are sticking
and that fatigue isn't causing an athlete to "chop" their stroke.

rowplay shows DPS in the replay view per workout, but there is no long-run trend
chart that lets an athlete see whether their DPS is actually improving over a
training block. This feature adds a DPS trend scatter + moving average chart to
the dashboard, using workout summary data that is already loaded, at no
additional network cost.

## Requirements

### Requirement 1 — DPS trend chart

**User story:** As an athlete, I want to see my distance-per-stroke plotted over
time on the dashboard, so that I can track whether my stroke efficiency is
improving across training blocks.

#### Acceptance criteria

1. WHEN the athlete has workouts with stroke-count data THEN the dashboard SHALL
   display a DPS trend chart with one point per such workout on a date x-axis.
2. THE chart SHALL show raw DPS by default, with a toggle to switch to
   pace-normalised DPS.
3. THE chart SHALL overlay a moving average (28-day by default, with a 7-day
   option) to smooth out day-to-day variation.
4. THE chart SHALL support sport filtering (RowErg / SkiErg / BikeErg / All).
5. WHEN the athlete clicks a data point THEN the system SHALL navigate to that
   workout's replay page.
6. WHERE a workout has no stroke-count data THEN it SHALL be excluded from the
   chart without error or visible gap artefact.

### Requirement 2 — Empty state

**User story:** As an athlete with only summary-level data, I want a clear
message rather than a broken chart.

#### Acceptance criteria

1. WHEN no workouts in the current filter set have stroke-count data THEN the
   system SHALL show an empty-state message (i18n'd) instead of a chart.

### Requirement 3 — Quality

**User story:** As the maintainer, I want the feature to meet rowplay's bar.

#### Acceptance criteria

1. DPS computation, pace normalisation, and moving-average calculation SHALL be
   pure functions in a dedicated module and SHALL be covered by Vitest unit
   tests: DPS formula, normalisation at reference pace = actual pace (expect
   rawDps = normDps), moving-average window, exclusion of workouts without
   stroke count.
2. Every user-visible string SHALL be added to all six locale files (en, zh, de,
   es, fr, ja) via `i18n.t()`.
3. The feature SHALL pass the full quality gate: `npm run check` (0 errors),
   `npm run build`, and `npm run test` (count must not decrease).
4. The feature SHALL work in demo mode.
