# Pace-Band Overlay on Replay — Requirements

## Introduction

During a replay, athletes frequently want to compare their actual pacing against
a goal pace — e.g. "did I hold 1:52 through the middle 1000?" The current replay
shows a real-time pace gauge and a telemetry chart, but there is no reference
line on the chart to make the comparison immediate and visual.

This feature adds a configurable target-pace horizontal line (with optional ±5 s
band) to the existing pace telemetry chart. It is intentionally minimal: no new
backend, no persistence, no new chart library — just an additional series drawn
inside the existing uPlot instance.

## Requirements

### Requirement 1 — Display target pace on chart

**User story:** As an athlete, I want to see a target-pace line on the pace chart
during replay, so that I can immediately tell where I was on-pace, ahead, or
behind my goal.

#### Acceptance criteria

1. WHEN a target pace is set THEN a horizontal dashed line at that pace value
   SHALL be drawn on the replay's pace telemetry chart.
2. WHEN the band toggle is enabled THEN a shaded region of ±5 seconds around
   the target line SHALL also be rendered in the same colour at reduced opacity.
3. WHERE no target pace is configured THEN no line or band SHALL be drawn and
   the existing chart SHALL be visually and functionally unchanged.
4. THE target-pace line and band SHALL use the existing `--pace` CSS colour
   token for visual consistency with the pace series.
5. A formatted pace label (e.g. `1:52 /500m`) SHALL appear at the right edge of
   the chart alongside the target line.

### Requirement 2 — Configure target pace

**User story:** As an athlete, I want to type in a target pace and optionally
arm it from a URL parameter, so that I can set it without leaving the replay.

#### Acceptance criteria

1. WHEN the athlete opens the target-pace control THEN they SHALL be able to
   enter a pace in `M:SS` format (minutes:seconds per 500 m).
2. WHEN a `?targetPace=<seconds>` URL parameter is present on page load THEN it
   SHALL pre-arm the target pace without any additional interaction.
3. WHERE the URL parameter is not a valid positive integer THEN it SHALL be
   silently ignored and the control SHALL start empty.
4. WHEN the athlete clears the target THEN the line and band SHALL be removed
   from the chart immediately.

### Requirement 3 — Quality and compatibility

**User story:** As the maintainer, I want the feature to meet rowplay's bar so
that it ships without regressions.

#### Acceptance criteria

1. The pace input parser and formatter SHALL be pure functions in a dedicated
   module and SHALL be covered by Vitest unit tests (parse round-trip, invalid
   inputs, edge cases).
2. Every user-visible string SHALL be added to all six locale files (en, zh, de,
   es, fr, ja) via `t()`.
3. The feature SHALL pass the full quality gate: `npm run check` (0 errors),
   `npm run build`, and `npm run test` (test count must not decrease).
4. The feature SHALL work in demo mode with no Concept2 credentials.
5. No existing replay functionality (gauges, telemetry charts, ghost racing,
   speed controls) SHALL be affected.
