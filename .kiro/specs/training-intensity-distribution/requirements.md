# Training Intensity Distribution — Requirements

## Introduction

Most Concept2 athletes train by perceived effort or split targets without a
clear picture of where their training volume actually lands across intensity
zones. rowplay already computes a Performance Management Chart (PMC) showing
fitness/fatigue, but it gives no insight into the *composition* of the training
load — is the athlete spending 80% at easy pace (polarised model) or grinding
in the grey zone?

This feature adds a **Training Intensity Distribution (TID)** chart to the
dashboard: a horizontal stacked bar showing what fraction of training time (or
metres) was spent in each of 5 intensity zones (or 3 when a 2k PB is
unavailable), for a user-selected recent period.

## Requirements

### Requirement 1 — Zone classification

**User story:** As an athlete, I want my workouts automatically classified into
intensity zones, so that I can see how my training is distributed without
entering zones manually.

#### Acceptance criteria

1. WHEN the athlete has a 2k RowErg personal best THEN the system SHALL classify
   training using a 5-zone model (UT2, UT1, AT, TR, AN) with boundaries
   relative to that PB pace.
2. WHEN no 2k PB is available THEN the system SHALL fall back to a 3-zone model
   (Easy, Moderate, Hard) based on the athlete's median training pace.
3. Classification SHALL use per-stroke pace when stroke data is available for a
   workout; otherwise it SHALL fall back to split-level average pace; otherwise
   to workout-level average pace.

### Requirement 2 — Distribution chart

**User story:** As an athlete, I want to see the zone breakdown as a visual
chart with percentages, so that I can interpret my training balance at a glance.

#### Acceptance criteria

1. THE system SHALL display a stacked bar chart (or equivalent proportional
   visualisation) showing the percentage of training volume in each zone.
2. THE athlete SHALL be able to toggle between time-based and distance-based
   percentages.
3. WHEN the athlete hovers over a zone segment THEN a tooltip SHALL show the
   zone name, absolute time (hours:minutes), distance (metres), and percentage.
4. WHEN no workouts exist in the selected period THEN the system SHALL show an
   empty-state message rather than a broken or blank chart.

### Requirement 3 — Period filter

**User story:** As an athlete, I want to filter the distribution by a recent
period, so that I can see how my training composition has changed.

#### Acceptance criteria

1. THE athlete SHALL be able to select from: Last 4 weeks, Last 3 months, Last
   12 months.
2. WHEN the period changes THEN the chart SHALL update without a page reload.

### Requirement 4 — Quality

**User story:** As the maintainer, I want the feature to meet rowplay's bar.

#### Acceptance criteria

1. Zone classification and distribution aggregation SHALL be pure functions in a
   dedicated module and SHALL be covered by Vitest unit tests: boundary values
   for both 5-zone and 3-zone models, fallback data-source selection, percentage
   maths, empty-workout handling.
2. Every user-visible string SHALL be added to all six locale files (en, zh, de,
   es, fr, ja) via `i18n.t()`.
3. The feature SHALL pass the full quality gate: `pnpm run check` (0 errors),
   `pnpm run build`, and `pnpm run test` (count must not decrease).
4. The feature SHALL work in demo mode.
