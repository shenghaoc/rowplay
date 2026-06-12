# Milestone Tracking — Design

## Overview

A **Milestones** panel on the dashboard that celebrates training achievements —
lifetime metres, session counts, streaks, and first personal bests — with a row
of badge cards. In live mode, achieving a new milestone during a sync triggers a
celebration toast via the existing svelte-sonner infrastructure.

## Milestone categories

### 1. Lifetime distance (per sport + combined)

Thresholds in metres:

| Threshold  | Label |
| ---------- | ----- |
| 100 000    | 100k  |
| 250 000    | 250k  |
| 500 000    | 500k  |
| 1 000 000  | 1M    |
| 2 000 000  | 2M    |
| 5 000 000  | 5M    |
| 10 000 000 | 10M   |

One milestone ID per `(sport | 'combined', threshold)` pair, e.g.
`lifetime_distance_rower_500k`, `lifetime_distance_combined_1M`.

### 2. Lifetime session count

Thresholds: 10, 25, 50, 100, 250, 500, 1 000, 2 500.
IDs: `session_count_100`, `session_count_500`, …

### 3. Active streak (consecutive calendar days with at least one workout)

Thresholds: 7, 14, 30, 60, 100 days.
IDs: `streak_7d`, `streak_30d`, …

A streak resets if there is a gap of >= 1 calendar day (i.e. any skipped day;
in the athlete's local timezone — use the Temporal API already polyfilled in
the project).

### 4. Personal-best speed gates

Milestone achieved the first time the athlete rows (RowErg) faster than the
listed pace:

| Milestone      | Target time (2000 m) |
| -------------- | -------------------- |
| `pb_2k_sub8`   | < 8:00               |
| `pb_2k_sub730` | < 7:30               |
| `pb_2k_sub7`   | < 7:00               |
| `pb_2k_sub630` | < 6:30               |

These are detected from the `personalBests[2000]` already loaded for the
dashboard. Additional distances can be added later.

## Pure module — `src/lib/milestones.ts`

```ts
export interface Milestone {
  id: string;
  /** i18n key for the display label, e.g. 'milestone.lifetime_1M_rower' */
  labelKey: string;
  achieved: boolean;
  /** ISO date string of first achievement, or undefined */
  achievedAt?: string;
  /** 0–1 fraction toward the threshold; 1.0 when achieved */
  progress: number;
  currentValue: number;
  threshold: number;
}

/**
 * Compute the full milestone list from available dashboard data.
 * All inputs are already loaded before this call — no network.
 */
export function computeMilestones(
  workouts: WorkoutSummary[],
  personalBests: Array<{ distance: number; sport: Sport; seconds: number }>,
): Milestone[];

/**
 * Return the subset of milestones that are NOT yet achieved but are closest
 * (highest progress) — used to render "coming next" cards.
 */
export function nextMilestones(all: Milestone[], limit: number): Milestone[];
```

No DOM. No Svelte. No network.

## Dashboard panel

- **Location:** top of the dashboard, above the stats summary row, so it catches
  the eye without requiring a scroll.
- **Achieved milestones:** horizontal scrollable row of daisyUI `badge`-decorated
  `card card-compact` elements, one per achieved milestone. Each card shows an
  icon (Lucide), the label (i18n'd), and the date achieved.
- **"Coming next" card:** a single greyed-out card (last in the row) showing the
  next upcoming milestone with a linear `progress` element (daisyUI) and
  the current vs threshold value.
- **Empty state:** if no milestones are achieved and no "next" is computable
  (< 3 workouts), the panel is hidden entirely.

## Live-mode toast integration

In `liveMode.svelte.ts`, after a successful sync cycle:

1. Snapshot `computeMilestones(prevWorkouts, prevPBs)` → `before`.
2. Snapshot `computeMilestones(newWorkouts, newPBs)` → `after`.
3. For each milestone newly achieved (was `!achieved`, now `achieved`):
   fire `toast.success(i18n.t(milestone.labelKey + '.toast'))` via
   svelte-sonner (same pattern as existing PB celebration toasts).

The comparison is a pure diff; no new server calls.

## i18n keys

New keys in `milestone` block (all 6 locale files). Representative sample:

| Key                                            | EN value               |
| ---------------------------------------------- | ---------------------- |
| `milestone.title`                              | Milestones             |
| `milestone.next`                               | Up next                |
| `milestone.lifetime_distance_rower_500k`       | 500k metres rowed      |
| `milestone.lifetime_distance_combined_1M`      | 1 million metres total |
| `milestone.session_count_100`                  | 100 workouts           |
| `milestone.streak_30d`                         | 30-day streak          |
| `milestone.pb_2k_sub7`                         | Sub-7 minute 2k        |
| `milestone.lifetime_distance_rower_500k.toast` | 🎉 500k metres rowed!  |
| …                                              | …                      |

Each milestone has a base key (dashboard display) and a `.toast` variant.

## Demo mode

`computeMilestones` runs against mock workouts and personal bests. The demo
athlete is intentionally set to have achieved a few milestones and be near the
next, so the panel is populated and demonstrable out of the box.

## Out of scope

- Server-side persistence of achievement dates (computed client-side from
  workout history, which already syncs to D1).
- Social sharing of milestones.
- Custom user-defined milestones.
