# DPS Trend Over Time — Design

## Overview

A **Distance-per-Stroke (DPS) trend chart** on the dashboard showing how stroke
efficiency evolves over the training history. DPS is the primary technique metric
for rowing: a improving DPS at the same pace means the athlete is covering more
water per pull, which is the goal of every coached rower. Currently DPS is only
visible inside an individual replay — there is no long-run view.

## DPS definitions

- **Raw DPS** (m/stroke): `total_distance / total_strokes` for a workout or
  split. Available when the Concept2 logbook summary includes a stroke count
  (which it does for most RowErg/SkiErg workouts).
- **Pace-normalised DPS**: raw DPS adjusted to a reference pace so that the
  speed effect is removed and sessions at different intensities can be compared
  on the same axis:

  ```
  normDPS = rawDPS × sqrt(referencePace / avgPace)
  ```

  where all paces are in seconds per 500 m and `referencePace` is the athlete's
  median steady-state pace across workouts in the dataset (or 120 s/500m = 2:00
  if no median is computable). The square-root scaling is derived from the
  approximate kinematic relationship between speed and stroke rate for an
  ergometer.

## Data source

The workout summary list already loaded for the dashboard. Each `WorkoutSummary`
is expected to carry `totalDistance`, `totalTime`, and optionally `strokeCount`
(total strokes for the piece). Workouts without `strokeCount` are excluded from
the chart (no imputation).

No new D1 queries or API calls are needed.

## Pure module — `src/lib/dpsTrend.ts`

```ts
import type { WorkoutSummary, Sport } from '$lib/types';

export interface DpsPoint {
  date: string;           // ISO date string
  workoutId: number;
  sport: Sport;
  rawDps: number;         // metres per stroke
  normDps: number;        // pace-normalised metres per stroke
  avgPaceSecs: number;    // seconds per 500 m (for tooltip)
  strokeCount: number;
}

export interface MovingAvgPoint {
  date: string;
  value: number;          // smoothed rawDps or normDps
}

/**
 * Compute one DpsPoint per workout that has a stroke count.
 * Workouts without strokeCount are excluded (not imputed).
 * referencePace: median avgPaceSecs across the returned points,
 *   or 120 if fewer than 3 points.
 */
export function computeDpsTrend(
  workouts: WorkoutSummary[],
  sport?: Sport,
): DpsPoint[];

/**
 * Centred rolling mean over windowDays calendar days.
 * Points outside the window at either end use a shrinking window.
 */
export function movingAverage(
  points: DpsPoint[],
  metric: 'rawDps' | 'normDps',
  windowDays: number,
): MovingAvgPoint[];
```

No DOM, no Svelte, no side effects.

## Chart

- **Library:** uPlot (same as all existing telemetry and trend charts).
- **x-axis:** date (Unix epoch); uPlot handles date formatting.
- **Primary series:** scatter of individual DPS points — raw (default) or
  normalised (toggle).
- **Secondary series:** 28-day centred moving average line (toggle, on by
  default). A 7-day option is also available.
- **Sport filter:** segmented control (RowErg / SkiErg / BikeErg / All) wired
  to the existing sport-filter state if the dashboard exposes one, or its own
  local `$state`.
- **Click a point → navigate** to that workout's replay (`/replay/{workoutId}`).
- **Tooltip:** date · raw DPS · normalised DPS · avg pace (formatted) · sport.
- **Empty state:** when no workouts have stroke-count data, show an i18n'd
  message rather than an empty chart.
- **Y-axis label:** "m/stroke" (DPS).

## Dashboard placement

In the analytics section, alongside (or below) the existing pace-duration trend
chart, so stroke efficiency sits next to pace trend for easy mental pairing.

## i18n keys

New keys under `dashboard.dpsTrend` (all 6 locale files):

| Key | EN value |
|-----|----------|
| `dashboard.dpsTrend.title` | Stroke efficiency (DPS) |
| `dashboard.dpsTrend.raw` | Raw DPS |
| `dashboard.dpsTrend.normalised` | Pace-normalised |
| `dashboard.dpsTrend.ma7` | 7-day avg |
| `dashboard.dpsTrend.ma28` | 28-day avg |
| `dashboard.dpsTrend.yLabel` | m/stroke |
| `dashboard.dpsTrend.empty` | No stroke-count data available |
| `dashboard.dpsTrend.tooltipPace` | Avg pace |
| `dashboard.dpsTrend.tooltipDps` | DPS |

## Demo mode

Works fully — mock workouts include stroke counts (or the chart shows the empty
state if they don't; either is acceptable).

## Out of scope

- Per-rep or per-split DPS trend (a deeper dive best served by the rep-
  comparison feature).
- Stroke rate as a separate chart (it is already available in replay telemetry).
- Drive-force or catch-angle data (not available from the Concept2 API).
