# Milestone Tracking — Requirements

## Introduction

Concept2 athletes are famously goal-driven: hitting 1 million lifetime metres,
maintaining a streak, breaking 7 minutes for the 2k. These are culturally
significant achievements in the Concept2 community. rowplay already tracks
personal bests and totals, but it offers no celebration or progression feedback
for these wider training milestones.

This feature adds a **Milestones** panel to the dashboard and celebration toasts
in live mode, turning already-available workout data into a motivational
progression layer with no new API calls or backend changes.

## Requirements

### Requirement 1 — Compute and display milestones

**User story:** As an athlete, I want to see my training milestones on the
dashboard, so that I can celebrate what I've achieved and stay motivated toward
the next target.

#### Acceptance criteria

1. WHEN the athlete has workout data THEN the system SHALL compute and display
   achieved milestones in a panel on the dashboard.
2. THE milestones SHALL cover at minimum: lifetime distance thresholds
   (per sport and combined), lifetime session count thresholds, active streaks,
   and RowErg 2k personal-best speed gates.
3. THE system SHALL show the next upcoming (not yet achieved) milestone with a
   progress indicator showing current vs threshold value.
4. WHERE the athlete has no achieved milestones and fewer than 3 workouts THEN
   the milestone panel SHALL be hidden (no empty-state card required).
5. Milestone computation SHALL use only workout data already fetched for the
   dashboard — no additional API or database calls.

### Requirement 2 — Live-mode celebration

**User story:** As an athlete who has live mode enabled, I want a celebration
toast when I achieve a new milestone during a sync, so that the app acknowledges
my achievement in the moment.

#### Acceptance criteria

1. WHEN a new milestone is achieved during a live-mode sync (comparing pre- and
   post-sync milestone state) THEN the system SHALL display a celebration toast
   notification for each newly achieved milestone.
2. THE toast SHALL use the existing svelte-sonner toast infrastructure and follow
   the same pattern as the existing personal-best celebration toast.

### Requirement 3 — Quality

**User story:** As the maintainer, I want the feature to meet rowplay's bar.

#### Acceptance criteria

1. Milestone computation and streak calculation SHALL be pure functions in a
   dedicated module and SHALL be covered by Vitest unit tests: threshold
   boundary conditions for every category, streak reset logic (gap >= 1 day),
   progress clamping to [0, 1], `nextMilestones` ordering.
2. Every milestone label and toast string SHALL be added to all six locale files
   (en, zh, de, es, fr, ja) via `i18n.t()`.
3. The feature SHALL pass the full quality gate: `pnpm run check` (0 errors),
   `pnpm run build`, and `pnpm run test` (count must not decrease).
4. The feature SHALL work in demo mode with the mock athlete having at least
   one achieved milestone visible in the panel.
