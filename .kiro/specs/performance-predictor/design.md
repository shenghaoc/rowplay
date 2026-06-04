# Multi-Distance Performance Predictor — Design

## Overview

A **Performance Predictor** card on the dashboard that applies the Concept2
community standard formula (Paul's Law) to predict finish times across all
standard race distances from any one known time. It also compares predictions
against the athlete's actual personal bests to show which targets have been
beaten, which are pending, and which distances haven't been attempted yet.

## Formula

**Paul's Law** (Concept2 community standard):

```
T₂ = T₁ × (D₂ / D₁) ^ 1.06
```

where `T` is elapsed time (seconds) and `D` is distance (metres). This is the
same equivalence formula used by the Concept2 online ranking system for
cross-distance comparison. The exponent 1.06 accounts for the increasing
aerobic cost at longer distances.

## Pure module — `src/lib/performancePredictor.ts`

```ts
/** Standard Concept2 race distances in metres. */
export const PREDICTOR_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097] as const;

export type PredictorDistance = typeof PREDICTOR_DISTANCES[number];

export type PredictionStatus = 'beaten' | 'behind' | 'untried';

export interface PredictionRow {
  distance: PredictorDistance;
  predictedSeconds: number;
  actualBestSeconds: number | null;   // from the athlete's personal bests
  status: PredictionStatus;
}

/**
 * Apply Paul's Law from one known (distance, time) pair.
 * Returns a Map of distance → predicted seconds for all other standard distances.
 * The source distance maps to knownSeconds exactly.
 */
export function predictTimes(
  knownDistance: number,
  knownSeconds: number,
): Map<PredictorDistance, number>;

/**
 * Build the full prediction table with status by comparing predictions
 * against the athlete's personal bests.
 *
 * status:
 *   'beaten'  — athlete's actual PB is faster than predicted
 *   'behind'  — athlete has a result at this distance but it is slower than predicted
 *   'untried' — no personal best on record for this distance
 *
 * The source distance row shows knownSeconds as predictedSeconds and the
 * athlete's actual PB (if any) for comparison.
 */
export function buildPredictionTable(
  knownDistance: number,
  knownSeconds: number,
  personalBests: Array<{ distance: number; time: number }>,
): PredictionRow[];
```

No DOM, no Svelte, no network. Pure maths.

## Dashboard card

- **Location:** `/dashboard`, after the personal-bests section (which already
  shows `STANDARD_PB_DISTANCES`).
- **Collapsed by default:** header reads "Performance predictor" with a chevron;
  expands on click.
- **Inputs (when expanded):**
  - Distance selector: daisyUI `select select-bordered select-sm` listing all
    `PREDICTOR_DISTANCES` formatted by existing `format.ts` helpers.
  - Time input: `input input-bordered input-sm` accepting `M:SS.T` or `MM:SS`.
    Uses the `parsePaceInput` helper if that spec (pace-band-overlay) lands
    first; otherwise inline parse logic with the same `M:SS` regex.
  - "Predict" button: runs `buildPredictionTable` and renders the table.
- **Pre-fill:** On open, if a RowErg 2k PB is available (`personalBests.find(pb => pb.distance === 2000)`),
  pre-select distance = 2000 m and pre-fill the time input with that PB.
- **Output table:** one row per `PREDICTOR_DISTANCES` entry:
  - Distance (formatted)
  - Predicted time (formatted, greyed when it is the source distance)
  - Your best (formatted, or "—" when `status === 'untried'`)
  - Status badge: green `badge-success` "Beaten", amber `badge-warning` "Behind",
    grey `badge-ghost` "Untried"

## Locale files

All 6 locale files (`en`, `zh`, `de`, `es`, `fr`, `ja`) in
`src/lib/locales/`. New keys under `dashboard.predictor`:

| Key | EN value |
|-----|----------|
| `dashboard.predictor.title` | Performance predictor |
| `dashboard.predictor.distance` | Known distance |
| `dashboard.predictor.time` | Known time |
| `dashboard.predictor.predict` | Predict |
| `dashboard.predictor.colDistance` | Distance |
| `dashboard.predictor.colPredicted` | Predicted |
| `dashboard.predictor.colBest` | Your best |
| `dashboard.predictor.colStatus` | Status |
| `dashboard.predictor.beaten` | Beaten |
| `dashboard.predictor.behind` | Behind |
| `dashboard.predictor.untried` | Untried |
| `dashboard.predictor.noTime` | — |
| `dashboard.predictor.inputError` | Enter a valid time (e.g. 7:04) |

## Demo mode

Works fully — personal bests are available from mock data and pre-fill the 2k
input. No backend calls needed.

## Out of scope

- Sport-specific predictions (SkiErg / BikeErg). Paul's Law applies equally, but
  the pre-fill should come from the same sport's PB. Follow-up can add a sport
  selector.
- Weight-adjusted / age-graded predictions.
- Saving or sharing a prediction.
