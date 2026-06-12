# Interval Rep Comparison — Requirements

## Introduction

rowplay's replay view already shows full-workout telemetry charts for pace,
stroke rate, power, and heart rate. However, athletes who do interval workouts
(e.g. 8 × 500 m, 4 × 2000 m) have no easy way to compare individual reps
against each other. The current split-breakdown table shows averages per split,
but not the shape of each rep — where a rep faded, how steady the stroke rate
was, or which rep was the outlier.

This feature adds a collapsible **Rep Comparison** panel to the replay page.
It overlays every rep on the same time-normalised axis using the existing uPlot
library, so the athlete gets a coach-style "rep overlay" chart with no new
dependencies.

## Requirements

### Requirement 1 — Rep detection

**User story:** As an athlete, I want the app to automatically recognise when I
did a multi-rep workout, so that the comparison panel appears without any manual
setup.

#### Acceptance criteria

1. WHEN a workout has ≥ 2 work intervals each lasting ≥ 30 seconds THEN the
   system SHALL offer the rep-comparison panel.
2. WHEN a workout is a single piece, a warmup/cooldown, or has fewer than 2
   qualifying intervals THEN the rep-comparison panel SHALL not be rendered.
3. Rest intervals SHALL be excluded from the rep count and SHALL not appear as
   series in the overlay chart.

### Requirement 2 — Overlay chart

**User story:** As an athlete, I want to see all my reps plotted on the same
time axis, so that I can compare pace, rate, and power rep-by-rep at a glance.

#### Acceptance criteria

1. The chart SHALL display one series per work interval on a shared x-axis of
   elapsed seconds within the rep (zero-based for every rep).
2. Each series SHALL be rendered in a distinct colour from a fixed palette.
3. The legend SHALL show the rep number (1-based) and the average pace for that
   rep.
4. WHEN the athlete clicks a legend entry THEN that series SHALL be highlighted
   and others dimmed.
5. THE athlete SHALL be able to switch the displayed metric among: Pace, Stroke
   rate, Power, and Heart rate.
6. WHERE heart-rate data is unavailable for a workout THEN the Heart rate option
   SHALL be disabled rather than showing an empty or errored chart.

### Requirement 3 — Panel behaviour

**User story:** As an athlete, I want the rep-comparison panel to be out of the
way by default, so that it does not distract from the main replay.

#### Acceptance criteria

1. THE panel SHALL be collapsed by default and show a header with the rep count
   (e.g. "Rep comparison — 8 reps").
2. WHEN the athlete expands the panel THEN the overlay chart SHALL be
   initialised; WHEN collapsed again the chart instance SHALL be destroyed to
   free memory.
3. FOR workouts with a single piece the panel SHALL be entirely absent from the
   DOM — no collapsed stub, no empty state.

### Requirement 4 — Quality

**User story:** As the maintainer, I want the feature to meet rowplay's bar so
that it ships without regressions.

#### Acceptance criteria

1. Rep detection and series extraction SHALL be pure functions in a dedicated
   module and SHALL be covered by Vitest unit tests: multi-rep detection
   threshold, rest-interval exclusion, average pace calculation, series
   zero-basing, empty-HR handling.
2. Every user-visible string SHALL be added to all six locale files (en, zh, de,
   es, fr, ja) via `i18n.t()`.
3. The feature SHALL pass the full quality gate: `pnpm run check` (0 errors),
   `pnpm run build`, and `pnpm run test` (count must not decrease).
4. The feature SHALL work in demo mode; if no multi-rep mock workout exists the
   panel is simply absent (no error).
5. No existing replay functionality SHALL be affected for single-piece workouts.
