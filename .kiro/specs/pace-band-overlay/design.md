# Pace-Band Overlay on Replay — Design

## Overview

Adds a configurable **target-pace line** (and optional tolerance band) to the
replay's uPlot telemetry pace chart. No engine, D1, or KV changes are needed —
this is a pure chart-rendering enhancement to the existing replay page.

## Target-pace sources (priority order)

1. URL param `?targetPace=<seconds-per-500m>` (e.g. `?targetPace=112` for
   1:52/500m) — pre-armed from leaderboard "Race at pace" or any external link.
2. User input in the replay UI — a small inline control below the pace chart.
3. Absent → no line drawn; no performance impact on existing replays.

## Rendering

- A horizontal **dashed line** at the target-pace value on the uPlot pace series.
- An optional **±5 s shaded band** (toggle) around the line, using a low-opacity
  fill in the same `--pace` CSS colour token.
- A small formatted label at the right edge of the chart (e.g. `1:52 /500m`)
  rendered via the existing `format.ts` helpers.
- The line and band are added as extra uPlot series / plugins; the rest of the
  chart (existing data series, markers, scrub) is untouched.

## Pure module — `src/lib/paceInput.ts`

Single exported parser to keep the replay component thin and to enable unit
testing:

```ts
/** Parse "M:SS" or "MM:SS" → positive integer seconds, or null on error. */
export function parsePaceInput(raw: string): number | null;

/** Format positive-integer seconds back to "M:SS" for display / prefill. */
export function formatPaceInput(seconds: number): string;
```

- Accepts `1:52`, `01:52`, `2:05`, bare integers (treated as seconds).
- Returns `null` for empty strings, non-positive results, or unparseable input.
- No DOM imports; no Svelte; pure TS.

## URL param

`?targetPace=<integer>` — seconds per 500 m (same unit as `?ghostPace`).
Parsed on `onMount` in `replay/[id]/+page.svelte`; invalid → silently ignored.
The param is already familiar to users from the leaderboard Race link convention.

## UI control

A compact inline row below the pace telemetry chart:

```
Target pace: [__:__] [Show band ☐]  [Clear ×]
```

- `input[type=text]` styled `input input-bordered input-sm` (daisyUI).
- Band toggle: `input[type=checkbox]` styled `toggle toggle-sm`.
- Clear button: removes the target from state (hides the line).
- The control is only shown when the user expands it (collapsed by default with
  a small "Set target pace" link) or when pre-armed via URL param.

## State

In `replay/[id]/+page.svelte` (Svelte 5 runes):

```ts
let targetPaceSecs = $state<number | null>(null);
let showBand       = $state(false);
```

Both are local — no persistence, no server round-trip.

## i18n keys

New keys in `replay` block (all 6 locale files):

| Key | EN value |
|-----|----------|
| `replay.targetPace` | Target pace |
| `replay.targetPacePlaceholder` | M:SS |
| `replay.targetPaceSet` | Set target pace |
| `replay.targetPaceClear` | Clear |
| `replay.targetPaceBand` | Show ±5 s band |

## Demo mode

Works identically — no backend dependency whatsoever.

## Out of scope

- Persisting the target pace across sessions.
- Multiple target lines.
- Pace-band width other than ±5 s (could be a follow-up input).
