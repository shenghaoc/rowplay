# Interval Rep Comparison — Design

## Overview

When a workout contains multiple interval reps, a **Rep Comparison** panel
appears below the main replay telemetry. It renders a single uPlot chart with
every rep overlaid on a **time-normalised x-axis** so the athlete can see at a
glance which rep was fastest, where a rep faded, and whether rep-to-rep
consistency improved over a training block.

## Rep detection

A workout is **multi-rep** when its `splits` array (already hydrated by
`data.ts` as part of `WorkoutDetail`) contains **≥ 2 work splits**, each with
time ≥ 30 s. Rest splits (identified by `isRest === true` on `Split`) are
excluded from the rep count and series.

Detection lives in the pure module `src/lib/repComparison.ts` so it can be
unit-tested without a DOM.

## Pure module — `src/lib/repComparison.ts`

```ts
import type { WorkoutDetail, Split } from "$lib/types";

export interface RepSeries {
  repIndex: number; // 0-based position in the work-interval list
  avgPace: number; // seconds per 500 m (for legend + sort)
  times: Float32Array; // elapsed seconds within the rep (x-axis)
  pace: Float32Array; // seconds per 500 m (y-axis)
  rate: Float32Array; // strokes per minute
  power: Float32Array; // watts
  hr: Float32Array; // bpm (may be all-zeros when HR unavailable)
}

/**
 * Returns one RepSeries per work interval, or null when the workout is not
 * a recognisable multi-rep piece (< 2 work intervals or each < 30 s).
 */
export function detectReps(workout: WorkoutDetail): RepSeries[] | null;

/** Average pace (sec/500m) for a rep, used in the legend. */
export function repAvgPace(series: RepSeries): number;
```

- Stroke-level data (from `workout.strokes`, typed as `Stroke[]`) is the
  preferred source. When only split data is available, each split's average
  values are repeated across `Math.round(split.time)` synthetic time steps.
- `times` is always zero-based (starts at 0 for every rep regardless of when in
  the full workout it occurred).

## Overlay chart

- **Library:** uPlot (same as all existing telemetry charts — no new dep).
- **x-axis:** elapsed seconds within the rep (0 → max rep duration across all
  reps, so shorter reps simply end early and the cursor shows a gap).
- **y-axis:** the currently selected metric.
- **Metrics toggle:** Pace (default) · Stroke rate · Power · Heart rate.
  HR option is disabled when `RepSeries.hr` is all-zero for all reps.
- **Series colours:** a fixed 6-colour palette (wraps for > 6 reps) stored as a
  constant in the module; colours are distinct from the main telemetry colours.
- **Legend:** rep number (1-based) + average pace for that rep, e.g.
  `Rep 3 — 1:54.2`. Click a legend item → bold that series and dim others.
- **Chart lifecycle:** created when the panel is first expanded, destroyed
  (`uplot.destroy()`) on component unmount to avoid memory leaks.

## Panel placement and behaviour

- Location: `replay/[id]/+page.svelte`, below the existing telemetry section.
- Collapsed by default; header reads **"Rep comparison (N reps)"**.
- Expansion uses a daisyUI `collapse` or native `<details>`/`<summary>` element
  (avoid custom CSS animation to keep the implementation simple).
- The panel is **not rendered at all** (no DOM, no uPlot) when `detectReps`
  returns `null`, so there is zero cost for single-piece workouts.

## Demo mode

Mock workout **1001** is a 4 × 2000 m (or 8 × 500 m depending on mock data
structure). If it is currently a single piece, `detectReps` returns `null` and
the panel is simply absent — no error, no empty state. The panel is fully
explorable in demo mode only when a multi-rep mock workout exists.

The spec does not require changing mock data, but a follow-up could add a
multi-rep mock workout.

## i18n keys

New keys in the `replay` block (all 6 locale files):

| Key                               | EN value                  |
| --------------------------------- | ------------------------- |
| `replay.repComparison`            | Rep comparison            |
| `replay.repComparisonN`           | Rep comparison ({n} reps) |
| `replay.repComparisonRep`         | Rep {n}                   |
| `replay.repComparisonAvgPace`     | avg {pace}                |
| `replay.repComparisonMetricPace`  | Pace                      |
| `replay.repComparisonMetricRate`  | Stroke rate               |
| `replay.repComparisonMetricPower` | Power                     |
| `replay.repComparisonMetricHr`    | Heart rate                |

## Out of scope

- Cross-workout rep comparison (comparing reps from different sessions).
- Automatic "best rep" detection and highlighting.
- Exporting rep data.
