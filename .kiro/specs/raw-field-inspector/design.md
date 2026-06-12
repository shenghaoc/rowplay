# Raw Field Inspector — Design

## Overview

A toggleable readout on the replay view that shows the **actual logged sample**
at the scrubber's current time, with as-logged and normalized columns plus a few
derived values, updating sample-and-hold. It hangs off the existing engine/page
seam with one small pure addition; the renderer and `RenderState` are untouched.

```
ReplayEngine.onFrame(frame) ──> page `frame` $state ─┐
                                                     │  $derived
strokes[] ──> sampleIndexAt(strokes, frame.t) ──> idx │  (changes only at
                                                     │   sample boundaries)
                                                     ▼
                              strokes[idx] ──> InspectorPanel
                                  │  asLoggedStroke(stroke, sport)  (pure)
                                  │  distancePerStroke(stroke)      (pure)
                                  └─ static section: workout + metadata fields
```

## Pure additions

### `sampleIndexAt` — `src/lib/replay/engine.ts`

```ts
/** Index of the most recent stroke at or before `t` (sample-and-hold). */
export function sampleIndexAt(strokes: Stroke[], t: number): number;
```

- Returns `-1` when `strokes` is empty (guard before any index access). Otherwise
  mirrors `sampleAt`'s bracketing logic but returns the **lower** index (the real
  sample in effect), clamped to `[0, n-1]`.
- `t <= strokes[0].t` → `0`; `t >= strokes[n-1].t` → `n-1`; otherwise the binary
  search's `lo`. Reuses the same search shape so behaviour can't drift from
  `sampleAt`.
- Unit-tested for empty, before-first, after-last, exact-boundary, and
  between-samples cases (Req 1.2).

### `asLoggedStroke` — `src/lib/replay/inspector.ts` (new, pure)

```ts
export interface LoggedStroke {
  t: number; // tenths of a second
  d: number; // decimetres
  p: number; // pace tenths; per-500m row/ski, per-1000m bike
  spm: number;
  hr?: number;
}
export function asLoggedStroke(s: Stroke, sport: Sport): LoggedStroke;
```

Reconstructs the Concept2 wire representation from the normalized `Stroke` by
**inverting** the transforms `concept2.ts > mapStrokes` applies on read:

| Normalized (`Stroke`) | As-logged   | Inverse                                                           |
| --------------------- | ----------- | ----------------------------------------------------------------- |
| `t` seconds           | tenths      | `round(t * 10)`                                                   |
| `d` metres            | decimetres  | `round(d * 10)`                                                   |
| `pace` sec/500m       | pace tenths | row/ski `round(pace*10)`; **bike `round(pace*2*10)`** (per-1000m) |
| `spm`                 | spm         | identity                                                          |
| `hr` bpm              | hr          | identity                                                          |

**Interval reset:** for interval workouts the API resets `t`/`d` to 0 each rep,
and `mapStrokes` adds a cumulative offset to keep the timeline monotonic — so the
cumulative `Stroke.t`/`d` no longer equal the wire value. `mapStrokes` therefore
retains the per-interval wire value on every stroke (`rawT`/`rawD` in seconds /
metres before the cumulative offset), and `asLoggedStroke` inverts from those
(`s.rawT ?? s.t`). The cache `DETAIL_PAYLOAD_VERSION` is bumped accordingly.

`watts` is derived (not logged per stroke) so it is shown as **normalized only**,
labelled "derived". Round-trip tested against `mapStrokes`, including an interval
fixture that resets mid-piece (Req 2.2).

### `distancePerStroke` — `src/lib/replay/inspector.ts` (pure)

```ts
export function distancePerStroke(s: Stroke): number | undefined;
```

`DPS = 30000 / (pace * spm)` metres/stroke (from speed `500/pace` m/s ÷
`spm/60` strokes/s); `undefined` when pace or rate is non-positive **or NaN**
(guarded with `!(x > 0)`). This is the seed quantity the later
**efficiency-drift** spec consumes (Req 2.4).

## Page wiring — `src/routes/replay/[id]/+page.svelte`

- Add `let inspectorOpen = $state(false)` and a control toggle alongside the
  existing renderer/quality toggles (Req 4.1).
- `const sampleIdx = $derived(sampleIndexAt(strokes, frame.t));` — because
  `frame` is already a `$state` updated by `onFrame`, this recomputes each tick
  **but** returns the same integer between sample boundaries.
- `const rawStroke = $derived(sampleIdx >= 0 ? strokes[sampleIdx] : null);` —
  identity-stable between boundaries, so any `$derived`/child keyed off
  `rawStroke` (or `sampleIdx`) only recomputes when the sample changes (Req 3.2).
- Pass `rawStroke`, `detail.sport`, the split index (computed by the new
  `splitIndexAt(splits, frame.d)` — there is no pre-existing split lookup), and
  the static workout/metadata fields into `InspectorPanel`.
- Split-only workouts: the replay already synthesizes strokes for these; the
  inspector reads those synthesized samples and labels the section accordingly
  (Req 3.3).

## Component — `src/lib/components/InspectorPanel.svelte` (new)

- **Static section** (rendered once, not per sample): sport, distance, time,
  drag factor, workout type, and — when present — the result `metadata` block
  (PM/firmware/erg model/HR type/**source app**). An `isPublic` boolean prop
  (from `/r/<token>`) omits `serialNumber`/`device` on public shares (Req 5.2,
  5.3).
- **Per-sample table**: one row per field with columns _field · as-logged ·
  normalized_, plus derived rows (`progress`, split index, distance-per-stroke).
- **Presentation**: monospace, `font-variant-numeric: tabular-nums`, fixed
  column widths so digits don't reflow as values change (Req 4.2). Field tokens
  (`t`,`d`,`p`,`spm`,`hr`) verbatim; descriptions + headers via i18n.
- No animation, no canvas — pure DOM bound to `rawStroke`. Cheap because it only
  re-renders on sample-index change.

## Dependency on full-fidelity-data

- **Independent for v1:** the per-stroke inspector + static workout fields use
  only data that exists today (`Stroke`, `WorkoutDetail`). It ships without the
  full-fidelity spec.
- **Grows with it:** the `metadata` rows (Req 5.2) light up once full-fidelity
  capture lands and `WorkoutDetail` carries `metadata`. Guard with optional
  chaining so the section simply renders fewer rows until then.

## i18n

New `inspector` block in all six locales: toggle label, section headings
("Workout", "Provenance", "Per-stroke"), column headers (field / as-logged /
normalized / derived), field descriptions, the "no per-stroke data" note, and
the "derived" tag. Sport/machine names and protocol tokens stay untranslated.

## Testing

- **Unit (`engine.test.ts`)**: `sampleIndexAt` boundary/empty/between cases;
  assert it agrees with `sampleAt`'s chosen lower bracket.
- **Unit (`inspector.test.ts`)**: `asLoggedStroke` round-trips `mapStrokes`
  (incl. BikeErg per-1000m pace), `watts` flagged derived; `distancePerStroke`
  formula + guards.
- **E2E (`tests/e2e/inspector.spec.ts`)**: in demo mode, toggle the inspector,
  read a raw value, scrub a little within a sample span and assert it **holds**,
  scrub across a boundary and assert it **changes**; confirm the toggle is
  keyboard-operable.

## Out of scope (follow-ups)

- The **efficiency-drift** overlay (Q14) — this spec only exposes
  `distancePerStroke` as an inspector row; trending it across the piece is its
  own spec.
- **EXR source-aware** handling — this spec _displays_ the source app (once
  full-fidelity provides it); quarantining EXR data from PBs/leaderboard is a
  separate behavioural spec.
- A pinnable / multi-field timeline (oscilloscope-style traces) — v1 is a
  point-in-time readout, not historical traces.
