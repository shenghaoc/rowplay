# Heart-Rate Device Import — Design

## Overview

The feature layers **imported HR** onto an existing `WorkoutDetail` without
changing the replay engine or renderer. File parsing reuses
`parseWorkoutFile` in `src/lib/replay/sources.ts`; new logic lives in a pure
`src/lib/hrImport.ts` module (merge, interpolate, summarize, apply to detail).

```
replay/[id]/+page.svelte
    │  (no logbook HR) → import panel
    │  parseHrFile(file) ──> sources.parseWorkoutFile ──> extract HR samples
    │  offset slider ──> mergeHrIntoStrokes(strokes, samples, offset)
    │  apply ──> POST /api/workouts/[id]/hr-import  [live]
    │         └─> localStorage overlay               [demo]
    ▼
ReplayEngine(strokes')  →  gauges / uPlot / hrZones (unchanged)
```

## Pure core — `src/lib/hrImport.ts`

```ts
export interface HrSample {
	t: number; // seconds on import timeline
	hr: number; // bpm
}

export function extractHrSeries(strokes: Stroke[]): HrSample[];
export function interpolateHr(samples: HrSample[], fileTime: number): number | undefined;
export function mergeHrIntoStrokes(
	strokes: Stroke[],
	samples: HrSample[],
	offsetSec: number
): Stroke[];
export function summarizeHr(strokes: Stroke[]): {
	avg?: number;
	min?: number;
	max?: number;
};
export function applyHrImport(
	detail: WorkoutDetail,
	samples: HrSample[],
	offsetSec: number
): WorkoutDetail;
```

- **`extractHrSeries`** — keep samples with `hr > 0`, sorted by `t`.
- **`interpolateHr`** — binary search; linear blend between neighbours; `undefined`
  if `fileTime` is before first or after last sample (Req 3.4).
- **`mergeHrIntoStrokes`** — for each stroke at workout time `t`, set
  `hr = interpolateHr(samples, t + offsetSec)` when defined; preserve other fields.
- **`applyHrImport`** — merge strokes, recompute `heartRateAvg` / `hrMin` / `hrMax`
  from merged strokes; leave pace/rate/watts untouched.

Client helper (thin wrapper, may live in same file or `hrImport.client.ts`):

```ts
export async function parseHrFile(file: File): Promise<{ samples: HrSample[]; name: string }>;
```

Calls `parseWorkoutFile`, runs `extractHrSeries`, throws if `< 2` samples.

## Demo data — `src/lib/mockData.ts`

Add `omitHr?: boolean` on one `Spec` (id **1002**, the 5000m steady) so
`buildStrokes` omits `hr` on every stroke and summary fields drop HR. Keeps all
other demo pieces with HR for existing smoke tests.

## Persistence

### Live — `POST` + `DELETE` `/api/workouts/[id]/hr-import`

Handlers in `src/routes/api/workouts/[id]/hr-import/+server.ts`:

| Method | Body | Action |
|--------|------|--------|
| `POST` | `{ samples: HrSample[], offset: number }` | `loadWorkoutDetail`, strip any prior imported HR from logbook base (reload from API if needed — **simpler: always merge onto current cached strokes without HR fields**), `applyHrImport`, `putCachedDetail`, return JSON detail |
| `DELETE` | — | Reload fresh detail from Concept2 (or cache miss → API) **without** overlay; if only overlay existed, re-fetch API detail and replace cache |

**Simpler live strategy (chosen):** On `POST`, load current detail. If strokes
already have logbook HR, return 409. Else `applyHrImport` and `putCachedDetail`.
On `DELETE`, if cached detail has HR only from import we cannot distinguish —
store nothing extra; **DELETE** re-fetches from Concept2 API and overwrites cache
(best-effort restore). For strokes that never had API HR, DELETE clears HR from
strokes in cache (strip `hr` fields, clear summary HR columns).

Actually even simpler for v1:
- POST: merge + putCachedDetail (full merged detail in payload)
- DELETE: getWorkout from API again and putCachedDetail (true reset) OR strip hr from cached

For workouts that never had HR on API, DELETE strips hr from cached strokes.

```ts
export function stripHrFromDetail(detail: WorkoutDetail): WorkoutDetail;
```

### Demo — `localStorage`

Key: `rowplay:hr-import:<workoutId>` → JSON `{ samples, offset }`.

- On replay mount: read overlay, `applyHrImport` to `data.detail` for display.
- On apply: write overlay + update local reactive strokes.
- On clear: remove key + reset view.

## Replay UI — `src/routes/replay/[id]/+page.svelte`

State:

```ts
let overlay = $state<{ samples: HrSample[]; offset: number } | null>(null);
let importPreview = $state<{ samples: HrSample[]; name: string } | null>(null);
let importOffset = $state(0);
```

Derived:

```ts
const baseDetail = $derived(data.detail as WorkoutDetail);
const effectiveDetail = $derived(
	overlay ? applyHrImport(baseDetail, overlay.samples, overlay.offset) : baseDetail
);
const strokes = $derived(effectiveDetail.strokes);
const hasHr = $derived(strokes.some((s) => s.hr != null && s.hr > 0));
```

Panel (when `!hasHr` from logbook **and** no overlay yet, or when previewing):

- File input `accept=".csv,.tcx,.fit"`
- Offset range input −120…120
- Apply / Clear buttons
- Error line from parse/API

On workout id change (`$effect`): load demo overlay from `localStorage`; reset preview.

**Engine refresh:** existing `$effect` on `strokes` already rebuilds `ReplayEngine`
when strokes change — merged HR triggers the same path.

## Server — `src/lib/server/hrImport.ts` (optional thin)

```ts
export async function saveHrImport(event, id, samples, offset): Promise<WorkoutDetail>;
export async function clearHrImport(event, id): Promise<WorkoutDetail>;
```

Wraps `loadWorkoutDetail`, `applyHrImport` / `stripHrFromDetail`, `putCachedDetail`.

## i18n keys (prefix `replay.hrImport.`)

`title`, `hint`, `fileLabel`, `formats`, `offset`, `offsetHint`, `preview`,
`apply`, `clear`, `applied`, `cleared`, `parseError`, `tooFewSamples`, `saveFailed`.

## Tests

- `src/lib/hrImport.test.ts` — interpolation, offset, summarize, apply.
- `tests/fixtures/hr-watch.csv` — minimal time + hr columns for e2e.
- `tests/e2e/hr-import.spec.ts` — open `/replay/1002`, upload fixture, apply,
  assert heart chart / gauge visible.

## Non-goals (v1)

- Uploading HR when logbook already has HR (Req 1.2).
- Distance-based alignment (time-only).
- Pushing merged HR back to Concept2 logbook API.
