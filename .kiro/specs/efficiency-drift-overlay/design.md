# Efficiency-Drift Overlay — Design

## Overview

An animated DPS trace overlaid on the pace chart, computed once from strokes,
self-baselined within the piece, and slaved to the existing replay scrubber. The
feature touches three layers: a pure analytics function, page `$derived` wiring,
and a chart configuration extension.

```
strokes[] ──► efficiencyDrift(strokes)       (analytics.ts, pure, once per workout)
                │
                ├── series: { t, dps }[]      (valid points only)
                ├── baseline: number           (opening-segment mean DPS)
                ├── baselineEndD: number       (distance at baseline close)
                ├── fadeDelta: number          (closing − baseline)
                └── fadePercent: number        (fadeDelta / baseline × 100)

                         │   page $derived: align to full xs[], null-pad gaps
                         ▼
              dpsOverlayData: uPlot.AlignedData   (xs + dps-or-null[])
                         │
                         ▼
              pace UPlotChart ──► second series + right y-axis + baseline line
                         │
                         ▼
              marker={frame.t}  ──► vertical cursor (already wired for pace)
```

## Dependency

This spec requires **PR #63 (raw-field-inspector)** to be merged first.
`distancePerStroke` from `src/lib/analytics.ts` is the only DPS formula in the
codebase; `efficiencyDrift` calls it directly. `src/lib/replay/inspector.ts`
also exports a per-stroke wrapper (used in the inspector panel) but
`efficiencyDrift` uses the `analytics.ts` export directly to stay in the pure
analytics layer with no `$lib/replay` import.

## Pure analytics — `efficiencyDrift` in `src/lib/analytics.ts`

### Interface

```ts
export interface EfficiencyDriftResult {
  /** Valid DPS points only; t = stroke time in seconds. */
  series: { t: number; dps: number }[];
  /** Mean DPS over the opening segment. 0 when insufficient data. */
  baseline: number;
  /** Distance at which the opening segment closes (metres). */
  baselineEndD: number;
  /** Closing-segment mean DPS minus baseline (negative = fade). */
  fadeDelta: number;
  /** fadeDelta / baseline × 100, or 0 when baseline is 0. */
  fadePercent: number;
}

export function efficiencyDrift(strokes: Stroke[]): EfficiencyDriftResult;
```

### Algorithm

1. **Filter valid strokes**: keep only strokes where `distancePerStroke(s.pace, s.spm) > 0`.
   Build `series` from these; if fewer than 5, return the zero result.

2. **Opening segment**: starting from the first valid stroke, collect strokes
   until the cumulative distance `s.d` first reaches the opening threshold:
   - Default threshold: 500 m.
   - Short pieces (total distance < 5000 m): `total * 0.10`.
   - Minimum: 5 valid strokes regardless of distance, so a 200 m sprint still
     gets a baseline.
     `baselineEndD` is set to `s.d` of the last stroke included. `baseline` is the
     mean DPS over these strokes.

3. **Closing segment**: the mirror — strokes from the last valid stroke working
   backwards until the cumulative distance spanned reaches the same threshold
   (500 m or 10% of total). Closing-segment mean is the average DPS.

4. **fadeDelta** = closing mean − baseline; **fadePercent** = `fadeDelta / baseline × 100`.

5. Return `{ series, baseline, baselineEndD, fadeDelta, fadePercent }`.

The function is **O(n)** over strokes and allocates one array. It never reads
the DOM or any Svelte context.

### Unit test fixtures (`src/lib/analytics.test.ts` or a dedicated file)

- **Steady fixture**: strokes at constant pace/spm → series is flat, `fadeDelta ≈ 0`.
- **Fading fixture**: pace starts fast then slows (higher pace value = slower) →
  `fadeDelta < 0`, `fadePercent < 0`, series trends downward.
- **Short fixture** (< 5 valid strokes) → returns zero result with empty series.
- **Gap fixture**: interleaved valid/invalid strokes → series omits invalid points,
  count only equals valid strokes.
- **Short piece** (total distance 400 m): threshold uses 10% rule; baseline
  still includes min 5 strokes.

## Page wiring — `src/routes/replay/[id]/+page.svelte`

### New state

```ts
let driftOverlayOn = $state(false);
```

A single boolean. The toggle is off by default so the existing pace chart is
uncluttered. `$effect` is not needed: the chart opts are rebuilt reactively via
`$derived` when `driftOverlayOn` changes.

### Precomputed drift (once per workout)

```ts
const drift = $derived(efficiencyDrift(strokes));
```

`strokes` is already `$derived` from `detail`, so this re-runs only when the
workout changes (client-side navigation), not per frame.

### Null-padded overlay data (for uPlot)

The pace chart's `xs` is the full stroke time-axis. The DPS series must be
aligned to the same `xs` with `null` where no valid DPS point exists:

```ts
const dpsAligned = $derived.by(() => {
  if (!driftOverlayOn || !drift.series.length) return null;
  // Build a map from stroke time → dps for O(n) lookup.
  const map = new Map(drift.series.map((p) => [p.t, p.dps]));
  return xs.map((t) => map.get(t) ?? null) as (number | null)[];
});
```

`xs` is `strokes.map((s) => s.t)` (already derived in the page). The aligned
array is `null` when `driftOverlayOn` is false so the chart opts ignore it.

### Extended pace chart options

When `driftOverlayOn` is true and `dpsAligned` is non-null, the pace chart
switches from single-series to two-series mode:

```ts
const paceData = $derived<uPlot.AlignedData>(
  dpsAligned ? [xs, strokes.map((s) => s.pace), dpsAligned] : [xs, strokes.map((s) => s.pace)],
);
```

The `paceOpts` computation gains a `driftOverlayOn`-conditional branch:

- **Single-series** (existing): one y-axis left, `invert: true`.
- **Dual-series** (overlay on): left y-axis for pace (inverted), right y-axis
  for DPS (not inverted). DPS series uses `color: 'var(--dps)'` and
  `spanGaps: false`. A `drawHook` (uPlot plugin or hooks API) draws the dashed
  baseline line at `y = drift.baseline` in the DPS y-axis coordinate system.

The baseline hook reads `drift.baseline` and `u.valToPos` (DPS scale) to place
a horizontal dashed line across the plot area. It fires in `draw` (after data
lines) so it appears behind neither axis but above the grid.

### Reduced-motion

The `marker` prop (vertical cursor) is driven by `frame.t`, which the
`ReplayEngine` sets on every rAF tick. No additional motion is introduced by the
overlay: the DPS series is static data; only the cursor moves. Reduced-motion
compliance is therefore inherited from the existing cursor implementation.

### Toggle and fade summary (markup sketch)

```svelte
<!-- inside the pace chart card, below the chart title -->
{#if drift.series.length >= 5}
  <button
    class="vbtn"
    type="button"
    aria-pressed={driftOverlayOn}
    onclick={() => (driftOverlayOn = !driftOverlayOn)}
  >
    {t('drift.toggle')}
  </button>

  {#if driftOverlayOn}
    <div class="drift-summary">
      <span class="muted small">{t('drift.baseline')}</span>
      <span class="mono">{drift.baseline.toFixed(1)}{t('drift.unit')}</span>
      <span class="muted small">{t('drift.fade')}</span>
      <span
        class="mono"
        class:good={drift.fadeDelta >= 0}
        class:warn={drift.fadePercent < 0 && drift.fadePercent >= -5}
        class:bad={drift.fadePercent < -5}
      >
        {drift.fadeDelta >= 0 ? '+' : ''}{drift.fadeDelta.toFixed(1)}{t('drift.unit')}
        ({drift.fadePercent >= 0 ? '+' : ''}{drift.fadePercent.toFixed(1)}%)
      </span>
    </div>
  {/if}
{/if}
```

The `.warn` CSS class is a new addition (amber/orange tone) alongside the
existing `.good` and `.bad` classes.

## Chart theme — `var(--dps)` colour

The `--dps` CSS variable is already part of the chart theme palette (introduced
with the DPS chart in the technique section). If it is not yet a named series
role in `chartTheme.ts`, a `'dps'` role SHALL be added there with appropriate
light/dark fills, alongside the existing `'pace'`, `'rate'`, `'power'`, `'hr'`
roles.

## i18n — new `drift` block in all six locales

| Key                  | en value                                   |
| -------------------- | ------------------------------------------ |
| `drift.toggle`       | `Show efficiency drift`                    |
| `drift.toggleOn`     | `Hide efficiency drift`                    |
| `drift.baseline`     | `Opening baseline`                         |
| `drift.fade`         | `Efficiency fade`                          |
| `drift.unit`         | ` m/st`                                    |
| `drift.summaryTitle` | `Distance-per-stroke drift`                |
| `drift.summaryHint`  | `DPS change from opening segment to close` |
| `drift.axisLabel`    | `DPS`                                      |

All six locale files receive the same keys (translated appropriately).
`pnpm run validate:locales` enforces completeness.

## Testing

### Unit tests (`src/lib/analytics.test.ts` or `src/lib/efficiencyDrift.test.ts`)

Cover `efficiencyDrift` with:

- **Steady fixture** (10 strokes, constant pace 120 s/500m, spm 20):
  `series.length === 10`, `|fadeDelta| < 0.01`, `|fadePercent| < 0.1`.
- **Fading fixture** (20 strokes; pace degrades from 120 → 160 s/500m):
  `fadeDelta < 0`, `fadePercent < 0`, series is monotonically non-increasing.
- **Short fixture** (3 valid strokes): returns `{ series: [], baseline: 0, … }`.
- **Gap fixture** (10 strokes, 3 with `pace = 0`): `series.length === 7`.
- **Short-piece fixture** (total distance 400 m, 8 strokes): opening threshold
  is `400 × 0.10 = 40 m`; baseline includes at min 5 strokes.

### E2E smoke (`tests/e2e/efficiency-drift.spec.ts`)

In demo mode at `/replay/1001` (WebKit, needs `wrangler dev`):

1. Assert toggle button is present.
2. Click the toggle; assert `aria-pressed="true"`.
3. Assert a DPS series element is visible on the pace chart canvas (or assert a
   visible fade-summary element with a numeric `m/st` value — more DOM-stable).
4. Assert the fade summary panel is visible and contains a number.

## Out of scope

- **Cross-workout baseline**: comparing DPS against a different piece's baseline
  requires dashboard-level aggregation; this spec is entirely within-piece.
- **Oscilloscope / pinnable drift traces**: the inspector spec describes this
  future direction; the overlay is a static computed series, not a live trace.
- **BikeErg cadence units**: `distancePerStroke` already normalises bike pace to
  per-500m equivalents on read; DPS units remain m/stroke for all sports.
- **Export / download**: the drift summary is display-only in v1.
