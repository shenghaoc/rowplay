# Training Intensity Distribution — Design

## Overview

A **Training Intensity Distribution (TID)** chart on the dashboard showing what
percentage of total training time (or metres) was spent in each intensity zone
over a selected period. This makes the polarised/pyramidal structure of training
immediately visible and lets athletes see whether they are stuck in the "grey
zone" or following an appropriate aerobic base.

## Zone model

A **5-zone pace-based model** relative to the athlete's 2k RowErg personal best
pace (`P₂k` in seconds per 500 m):

| Zone | Label | Pace range | Effort character |
|------|-------|-----------|-----------------|
| 1 | UT2 | pace > P₂k × 1.20 | Recovery / easy |
| 2 | UT1 | P₂k × 1.10 < pace ≤ P₂k × 1.20 | Aerobic base |
| 3 | AT | P₂k × 1.02 < pace ≤ P₂k × 1.10 | Threshold |
| 4 | TR | P₂k × 0.97 < pace ≤ P₂k × 1.02 | Race / interval |
| 5 | AN | pace ≤ P₂k × 0.97 | Anaerobic / sprint |

These boundaries are the community-standard Concept2 training zones expressed
relative to 2k pace (erg coaches routinely present them this way).

**Fallback (no 2k PB available):** a simplified **3-zone model** based on the
athlete's median training pace (`P̃`) across all workouts in the period:

| Zone | Label | Pace range |
|------|-------|-----------|
| L1 | Easy | pace > P̃ × 1.10 |
| L2 | Moderate | P̃ × 0.95 < pace ≤ P̃ × 1.10 |
| L3 | Hard | pace ≤ P̃ × 0.95 |

## Data source

- **Preferred:** per-stroke pace from `workout.strokes` (already cached in D1
  `workout_detail` by the replay infra). If stroke data is available for a
  workout, each stroke's duration is attributed to the zone matching that
  stroke's pace.
- **Fallback:** split-level average pace. The split's entire duration is
  attributed to the zone matching the split's average pace. This is less
  accurate but covers workouts without per-stroke detail.
- Workouts where neither stroke nor split data is available contribute to the
  chart only by their summary-level average pace × total duration (lowest
  accuracy; still correct at the gross level).

The data is already loaded for the dashboard; no new API calls are needed.

## Pure module — `src/lib/trainingZones.ts`

```ts
export const ZONES_5 = ['UT2', 'UT1', 'AT', 'TR', 'AN'] as const;
export const ZONES_3 = ['Easy', 'Moderate', 'Hard'] as const;
export type ZoneLabel = typeof ZONES_5[number] | typeof ZONES_3[number];

export interface ZoneConfig {
  basePace: number | null;   // 2k PB pace (sec/500m); null → 3-zone fallback
  medianPace?: number;       // required only when basePace is null
}

export interface ZoneSlice {
  zone: ZoneLabel;
  seconds: number;
  meters: number;
}

export interface ZoneDistribution {
  slices: ZoneSlice[];
  totalSeconds: number;
  totalMeters: number;
}

/**
 * Classify a single pace value (sec/500m) into a zone label.
 * config.basePace non-null → 5-zone model; null → 3-zone model.
 */
export function classifyPace(pace: number, config: ZoneConfig): ZoneLabel;

/**
 * Aggregate workouts into a zone distribution for the given config.
 * Uses stroke data when present; falls back to split then summary average.
 */
export function buildDistribution(
  workouts: WorkoutSummary[],
  config: ZoneConfig,
): ZoneDistribution;
```

No DOM, no Svelte, no server imports.

## Chart

- **Library:** uPlot or a lightweight SVG bar — whichever keeps bundle impact
  lower. Because this is a static distribution (not time-series), a simple
  horizontal stacked bar rendered in SVG is preferred over a full uPlot instance.
- **Layout:** horizontal stacked bar; each zone is a proportional segment.
  Below the bar, a small legend row shows zone label + percentage (+ time or
  metres depending on the toggle).
- **Colours:** fixed per zone, cool-to-warm: UT2 blue, UT1 teal, AT yellow,
  TR orange, AN red (or equivalent accessible palette matching the app's theme).
- **Toggle:** "Time" (default) / "Distance" — switches the quantity used for the
  percentage and tooltip values.
- **Period filter:** dropdown with "Last 4 weeks", "Last 3 months", "Last 12
  months". Synced with the existing dashboard period selector if one exists;
  otherwise an independent local control.
- **Empty state:** When no workouts exist in the selected period, show a brief
  message (i18n'd) instead of a broken chart.
- **Tooltip:** hover over a segment → zone name, time (hh:mm), metres, percentage.

## Dashboard placement

After the existing PMC (Performance Management Chart) section, before the
pace-duration trend chart.

## i18n keys

New keys under `dashboard.tid` (all 6 locale files):

| Key | EN value |
|-----|----------|
| `dashboard.tid.title` | Training intensity |
| `dashboard.tid.time` | Time |
| `dashboard.tid.distance` | Distance |
| `dashboard.tid.period4w` | Last 4 weeks |
| `dashboard.tid.period3m` | Last 3 months |
| `dashboard.tid.period12m` | Last 12 months |
| `dashboard.tid.empty` | No workouts in this period |
| `dashboard.tid.zone.UT2` | UT2 — Recovery |
| `dashboard.tid.zone.UT1` | UT1 — Aerobic |
| `dashboard.tid.zone.AT` | AT — Threshold |
| `dashboard.tid.zone.TR` | TR — Race pace |
| `dashboard.tid.zone.AN` | AN — Anaerobic |
| `dashboard.tid.zone.Easy` | Easy |
| `dashboard.tid.zone.Moderate` | Moderate |
| `dashboard.tid.zone.Hard` | Hard |

## Demo mode

Works fully — `buildDistribution` runs against mock workouts. The mock dataset
does not have per-stroke data for every workout so the split-level fallback
activates for most of them; the distribution is still a plausible-looking
breakdown.

## Out of scope

- HR-based zone classification (follow-up; requires HR data per stroke which
  the HR import spec already provides infrastructure for).
- Zone-target overlays (e.g. "your coach wants 75% UT2").
- Per-sport TID (follow-up segmentation).
