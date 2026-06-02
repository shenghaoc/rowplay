# Design Document: MultiErg Sport-Switching Replay

## Overview

A Concept2 MultiErg workout is a single logged result whose intervals alternate
between RowErg, SkiErg, and BikeErg. This design corrects five interlocking
defects in rowplay's current single-sport assumption:

1. **Per-segment stroke normalization** — `mapStrokes` uses one `paceDiv` for
   the whole array; bike segments get the wrong divisor.
2. **Time-varying sport in `RenderState`** — both renderers receive a static
   `sport` at construction; they must receive a per-frame `sport` instead.
3. **2D and 3D world morph** — the lane surface (water/snow/asphalt), avatar
   glyph, wake, and ground mesh must switch at segment boundaries.
4. **Gauge re-baseline** — `MetricGauge` pace axis (`/500m` vs `/1000m`) and
   range must update when the machine changes.
5. **Rest-interval animation** — the `rest_time` between intervals must be
   visible on the timeline with an idle avatar and countdown overlay.

The design introduces no new routes, no new network requests, and no new
rendering dependencies. All changes are confined to:
- `src/lib/server/concept2.ts` (normalization)
- `src/lib/types.ts` (new fields)
- `src/lib/replay/engine.ts` (segment map)
- `src/lib/replay/renderer.ts` (`RenderState` additions)
- `src/lib/replay/renderer3d.ts` (three-avatar model)
- `src/routes/replay/[id]/+page.svelte` (page wiring)
- `src/routes/r/[token]/+page.svelte` (shared view wiring)
- `src/components/MetricGauge.svelte` (optional `axisLabel` prop)
- `src/lib/mockData.ts` (fixture 1012)
- Locale files

Single-sport replays are untouched by every change; the new code paths are
entered only when `isMultiErg` is true or when `segMap.length > 1`.

---

## Architecture

```
                     ┌─────────────────────────────────────┐
                     │  concept2.ts: mapStrokes(raw, sport, │
                     │  splits?)                            │
                     │  - Bucket strokes by interval reset  │
                     │  - Apply per-segment paceDiv         │
                     └───────────────┬─────────────────────┘
                                     │ Stroke[] (correctly normalised)
                                     ▼
          ┌──────────────────────────────────────────────┐
          │  engine.ts (pure, side-effect-free)           │
          │  buildSegmentMap(splits) → SegmentInfo[]      │
          │  activeMachineAt(segMap, d) → Sport           │
          │  activeSegmentIndexAt(segMap, d) → number     │
          │  sampleAt / sampleIndexAt (unchanged)         │
          └──────────────────┬───────────────────────────┘
                             │  SegmentInfo[], Sport
                             ▼
     ┌───────────────────────────────────────────────────┐
     │  +page.svelte: buildState(frame) → RenderState    │
     │  sport = activeMachineAt(segMap, frame.d)          │
     │  segmentIndex = activeSegmentIndexAt(segMap, d)   │
     │  transitionPhase? = restProgress(segMap, frame.t) │
     └──────────────┬──────────────┬─────────────────────┘
                    │              │
                    ▼              ▼
          CourseRenderer    CourseRenderer3D
          (2D morph)        (3D morph, 3 pre-built avatars)
                    │              │
                    └──────┬───────┘
                           │ RenderState.sport / .transitionPhase
                           ▼
                     MetricGauge (pace re-baselined per activeSport)
```

---

## 1. Per-Segment Normalization: `mapStrokes`

### Current state

```ts
export function mapStrokes(raw: RawStroke[], sport: Sport): Stroke[]
```

A single `paceDiv = sport === 'bike' ? 2 : 1` is applied to every stroke.
For MultiErg, `sport` is the overall result type (usually `'rower'`), so all
bike strokes are divided by `1` — their pace is reported double what it should
be (per-1000 m instead of per-500 m).

### New signature

```ts
export function mapStrokes(
  raw: RawStroke[],
  sport: Sport,
  splits?: Split[]
): Stroke[]
```

The third argument is optional and defaults to `undefined`, preserving
backward compatibility for all existing callers.

### Bucketing logic

The reset-boundary loop already tracks `prevT` / `prevD`. At the point where
`rawT < prevT` (a reset), the stroke index marks the boundary between
segment `k` and `k+1`. We count resets to maintain `segmentIndex` and look up
`splits[segmentIndex]?.machine`:

```
segmentIndex starts at 0
on each reset: segmentIndex++
paceDiv for stroke = (splits?.[segmentIndex]?.machine ?? sport) === 'bike' ? 2 : 1
```

Work-interval splits are non-rest splits in `splits[]`. Because `mapSplits`
already maps `machine` from the API (including the `isRest` flag), we need to
step over rest splits when indexing into `splits`. In practice, the reset
counter in stroke data corresponds to work intervals only (the API does not
include rest-period strokes), so `segmentIndex` advances in lockstep with
non-rest work splits.

If `splits` is undefined or the indexed split has no `machine`, fall back to
the top-level `sport`. This is identical to the current behaviour.

### Caller update

`Concept2Client.getWorkout` calls:

```ts
const splits = mapSplits(detail.data);
strokes = mapStrokes(s.data, base.sport, splits);
```

The `splits` array is available before `mapStrokes` is called. Passing it
enables per-segment normalization for MultiErg results that carry `machine`.

---

## 2. `WorkoutDetail.isMultiErg` and `WorkoutDetail.isMultiErg`

### Type additions (`src/lib/types.ts`)

```ts
export interface WorkoutDetail extends Workout {
  strokes: Stroke[];
  splits: Split[];
  isInterval: boolean;
  isMultiErg: boolean;  // NEW: true when splits carry 2+ distinct machines
}
```

`isMultiErg` is computed server-side after `mapSplits`:

```ts
const workMachines = splits
  .filter(s => !s.isRest && s.machine != null)
  .map(s => s.machine!);
const isMultiErg = new Set(workMachines).size >= 2;
```

This requires zero API changes — `machine` is already captured by `mapSplits`.

---

## 3. Segment Map: `engine.ts` additions

### `SegmentInfo` interface

```ts
export interface SegmentInfo {
  index: number;
  machine: Sport;
  startD: number;
  endD: number;
  startT: number;
  endT: number;
  restBefore: number;  // seconds; 0 for segment 0
}
```

### `buildSegmentMap(splits: Split[]): SegmentInfo[]`

Iterates `splits`, accumulating cumulative distance and time, skipping rest
splits for the distance/time counters but reading their `restTime` to set
`restBefore` on the following work segment. Returns a single-element fallback
for non-MultiErg (or empty splits).

Example for the demo fixture (1012): Row 1000 m / 60 s rest / Ski 500 m /
60 s rest / Bike 2000 m:

```
[
  { index: 0, machine: 'rower', startD: 0,    endD: 1000, startT: 0,    endT: T0, restBefore: 0  },
  { index: 1, machine: 'skierg', startD: 1000, endD: 1500, startT: T0+60, endT: T1, restBefore: 60 },
  { index: 2, machine: 'bike',  startD: 1500, endD: 3500, startT: T1+60, endT: T2, restBefore: 60 },
]
```

`startT` for segment `k` = `segMap[k-1].endT + segMap[k].restBefore`.
The segment map's `startT`/`endT` are cumulative over work time only. Rest
time is "before" the segment — the playhead occupies `[endT_prev, startT_curr)`
during a rest.

### `activeMachineAt(segMap: SegmentInfo[], d: number): Sport`

Binary search on `[startD, endD)`. Clamp to last segment for `d >= endD` of
the final segment. O(log n), but `n <= 10` in practice so linear scan is also
acceptable.

### `activeSegmentIndexAt(segMap: SegmentInfo[], d: number): number`

Same search, returns `index` field.

### `restProgressAt(segMap: SegmentInfo[], t: number): { phase: number; from: Sport; to: Sport; remaining: number } | null`

For each pair of adjacent segments `k`, `k+1`:
- If `segMap[k].endT <= t < segMap[k+1].startT`, return
  `{ phase: (t - segMap[k].endT) / segMap[k+1].restBefore, from: segMap[k].machine, to: segMap[k+1].machine, remaining: segMap[k+1].startT - t }`.
- Return `null` outside all rest intervals.

This is called in `buildState` to populate `transitionPhase`.

---

## 4. `RenderState` extensions (`renderer.ts`)

```ts
export interface RenderState {
  frame: Frame;
  distFrac: number;
  totalDistance: number;
  ghost?: AvatarState;
  sport: Sport;              // was sport?: Sport — now required, always set
  segmentIndex?: number;     // 0-based active segment (MultiErg only)
  transitionPhase?: number;  // 0..1 during rest interval; absent otherwise
  transitionFrom?: Sport;    // machine leaving during rest
  transitionTo?: Sport;      // machine arriving after rest
}
```

Making `sport` required is a **breaking change** at the type level. Both call
sites (`+page.svelte` and `r/[token]/+page.svelte`) already set `sport:
detail.sport` today, so this requires only changing the lookup to
`activeMachineAt(segMap, frame.d)`. The change is additive at runtime since
the value was always provided.

---

## 5. 2D Renderer — World Morph

The 2D renderer currently dispatches on `state.sport` for the avatar glyph.
The world morph extends that dispatch to the lane environment.

### Lane style by sport

| `state.sport` | Water band fill | Ripples | Wake sine | Trail |
|---|---|---|---|---|
| `rower` | accent tint gradient (existing) | animated sine | animated sine | yes |
| `skierg` | snow white flat (`#eef4f7` / `#b8c4cc`) | flat line only | flat | white spray |
| `bike` | asphalt grey flat (`#9aa4ac` / `#2a333a`) | none | flat | none |

The lane colour constants already exist in `SPORT_PROFILES` within
`renderer3d.ts` — they should be mirrored into a shared export in
`sports.ts` (`SPORT_LANE_COLORS: Record<Sport, { light: string; dark: string }>`)
so both renderers consume one source of truth.

### 2D transition overlay

When `state.transitionPhase` is present, `drawAvatar` is called with a frozen
phase (`s = 0`) and a modified HUD pill:

```
"Rest · {fmtTime(remaining)}s"
```

The lane strip uses `state.transitionFrom`'s environment. After the rest
completes the strip switches to `state.transitionTo`'s environment at the
first `render()` where `transitionPhase` is absent.

Under `prefers-reduced-motion`, `transitionPhase` is ignored and the cut
happens immediately at `segMap[k+1].startT`.

---

## 6. 3D Renderer — Three-Avatar Model

### Current state

`CourseRenderer3D` pre-builds one live avatar and one ghost avatar from
`this.profile.make(...)` in the constructor. Changing sport requires tearing
down the renderer.

### New model: pre-build all three

```ts
// Construction: build all three, add to scene, start hidden except the initial sport
private liveAvatars: Record<Sport, THREE.Group>;
private liveAvatarImpls: Record<Sport, Avatar>;
private ghostAvatars: Record<Sport, THREE.Group>;
private ghostAvatarImpls: Record<Sport, Avatar>;
private activeSport: Sport;
```

At construction, iterate `['rower', 'skierg', 'bike']`, call
`SPORT_PROFILES[s].make(accent, castShadow, opacity)` for each, add all
six groups to the scene, set `visible = false` except the initial sport.

Cost: three avatar meshes instead of one. Avatar geometry is low-poly (< 500
triangles each); the total GPU cost is ~3× single-sport, which the product
owner has accepted.

### Per-frame sport switch

```ts
private lastRenderedSport: Sport | null = null;

render(state, playing, theme) {
  ...
  if (state.sport !== this.lastRenderedSport) {
    this.switchAvatarTo(state.sport);
    this.switchGroundTo(state.sport, theme);
    this.lastRenderedSport = state.sport;
  }
  ...
}

private switchAvatarTo(sport: Sport): void {
  for (const s of (['rower', 'skierg', 'bike'] as Sport[])) {
    this.liveAvatars[s].visible = s === sport;
    this.ghostAvatars[s].visible = s === sport;
  }
  // Wake: disable old trail, enable new
  this.liveWake?.reset();
  this.ghostWake?.reset();
  // Rebuild wake trails if the new sport has a different trailColor
}
```

### Ground morph during rest intervals

When `state.transitionPhase` is present:

```ts
const fromColor = SPORT_PROFILES[state.transitionFrom!].groundColor(theme);
const toColor = SPORT_PROFILES[state.transitionTo!].groundColor(theme);
const blended = lerp3(fromColor, toColor, state.transitionPhase);
groundMat.color.setHex(blended);
```

`lerp3` performs linear interpolation on the three RGB channels of two packed
hex integers.

Wave displacement is disabled during transitions (both `from` and `to` profiles
may have different `waves` values; the ground stays flat during the rest to
avoid popping).

### Wake trail management

Wakes carry a `color` parameter set at construction. A sport switch resets the
trail history and, if the new sport's `trailColor` differs, the existing
`WakeTrail` objects must be re-colored. `WakeTrail` gains a `setColor(c: number | null)`
method that updates all segment materials and toggles `visible = false` when
`c === null` (bike).

### 3D transition overlay

The live label sprite shows the rest countdown during `transitionPhase`:

```ts
const label = state.transitionPhase != null
  ? `Rest · ${fmtTime(remaining)}s`
  : `YOU · ${fmtPace(state.frame.pace)} · ...`;
```

The avatar is animated with `animate(0, true)` (frozen pose) during the rest.

### `destroy()` update

```ts
destroy() {
  for (const s of SPORTS) {
    this.disposeObject3D(this.liveAvatars[s]);
    this.disposeObject3D(this.ghostAvatars[s]);
  }
  this.liveWake?.dispose();
  this.ghostWake?.dispose();
  // ... rest unchanged
}
```

### `applyTheme` update

`recolorAccent` must traverse all six avatar groups, not just one live/ghost
pair. The loop over `SPORTS` handles this.

---

## 7. Gauge Re-Baseline: `MetricGauge` and page wiring

### `MetricGauge.svelte` change

Add optional prop:

```ts
interface Props {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  color: string;
  unit?: string;
  axisLabel?: string;  // NEW: overrides the unit in the SVG label
}
```

The label line renders `{label}{axisLabel ?? (unit ? ` · ${unit}` : '')}`.

No other change to the component. The `frac` and arc path are unchanged.

### Page wiring

Replace:

```ts
const sportTheme = $derived(themeFor(detail.sport));
```

with:

```ts
const segMap = $derived(buildSegmentMap(detail.splits));
const activeSport = $derived(activeMachineAt(segMap, frame.d));
const sportTheme = $derived(themeFor(activeSport));
```

The segment map is recomputed once per `detail` change (not per frame), because
`buildSegmentMap` is a pure function of `splits` which is stable. `activeSport`
recomputes each frame but is a cheap O(n) lookup.

The pace gauge:

```ts
const paceGaugeUnit = $derived(activeSport === 'bike' ? '/1000m' : '/500m');
const paceGaugeDisplay = $derived(
  activeSport === 'bike'
    ? fmtPace(frame.pace * 2).replace('/500m', '')  // show native per-1000m
    : fmtPace(frame.pace).replace('/500m', '')
);
const paceGaugeRange = $derived(
  paceRangeForSegment(segMap, activeSegmentIndexAt(segMap, frame.d), strokes)
);
```

`paceRangeForSegment` is a pure helper that filters strokes belonging to the
active segment and returns `{ min, max }` with sport-appropriate defaults
(row/ski: 90–200 s/500 m; bike: 45–120 s/500 m normalised, i.e. 90–240 s/1000 m
native).

---

## 8. `buildState` on the Replay Page

```ts
function buildState(f: Frame): RenderState {
  const g = ghostStrokes ? sampleAt(ghostStrokes, f.t) : null;
  ghostFrame = g;
  const rest = restProgressAt(segMap, f.t);
  return {
    frame: f,
    distFrac: total ? f.d / total : 0,
    totalDistance: total,
    sport: activeMachineAt(segMap, f.d),
    segmentIndex: activeSegmentIndexAt(segMap, f.d),
    transitionPhase: rest?.phase,
    transitionFrom: rest?.from,
    transitionTo: rest?.to,
    ghost: g
      ? { distFrac: total ? g.d / total : 0, pace: g.pace, spm: g.spm, label: ghostLabel }
      : undefined
  };
}
```

For single-sport replays `segMap` has one element covering the full distance,
`activeMachineAt` always returns `detail.sport`, and `restProgressAt` always
returns `null`. Zero overhead for the common path.

---

## 9. Demo Fixture (1012)

The `Spec` type gains an `isMultiErg?: true` flag. When set, `detailFor` calls
a new `buildMultiErgDetail` function instead of `buildStrokes` + `buildSplits`.

`buildMultiErgDetail` constructs three stroke segments with explicit resets
(rawT/rawD back to 0 at each interval boundary), per-segment spm/pace profiles,
and splits with `machine` set. The BikeErg segment has raw `p` values in the
API's per-1000 m units (i.e. `paceDiv = 2` is applied on read). The result's
`isMultiErg = true` and `isInterval = true`.

The fixture uses IDs already outside the used range: `1012`.

---

## 10. Leaderboard and Ghost Fencing

### Leaderboard exclusion

In `src/routes/replay/[id]/+page.svelte`:

```ts
const canPublish = $derived(
  !data.demo &&
  !!data.user &&
  !detail.isMultiErg &&              // NEW fence
  matchStandardDistance(detail.distance) != null
);
```

### Ghost candidate filtering

In `filteredCandidates`:

```ts
const filteredCandidates = $derived.by(() => {
  const base = ...;
  if (detail.isMultiErg) {
    // For a MultiErg live workout, exclude MultiErg ghosts
    return base.filter(c => !c.isMultiErg);
  }
  return base;
});
```

`Workout` (the summary type) does not currently carry `isMultiErg`. It must be
added there too, or the filter can rely on the absence of the field (treating
`undefined` as `false`).

---

## 11. Shared View (`r/[token]/+page.svelte`)

This route builds `RenderState` with `sport: detail.sport` today. It must also
build a segment map and use `activeMachineAt`:

```ts
const segMap = $derived(buildSegmentMap(detail.splits));
// In buildState:
sport: activeMachineAt(segMap, f.d),
```

No gauge re-baseline is needed on the shared view (it has no `MetricGauge`),
but the sport change keeps the 2D renderer's avatar correct.

---

## 12. Engine Clock and Rest-Interval Time

### Duration

`ReplayEngine.duration` is `strokes[n-1].t`, which is the total **work time**
(sum of segment times, no rest). Rest intervals extend the playback timeline
beyond the stroke array end.

We must extend the engine duration:

```ts
const workDuration = strokes.length ? strokes[strokes.length - 1].t : 0;
const totalRestTime = segMap.reduce((s, seg) => s + seg.restBefore, 0);
this.duration = workDuration + totalRestTime;
```

The engine's `loop` function maps wall-clock-scaled `this._time` (which can now
exceed `workDuration`) to the stroke array by computing:

```ts
function workTimeAt(segMap: SegmentInfo[], clockT: number): number {
  // Find which segment or rest interval clockT falls in,
  // then return the equivalent work time (ignoring rests).
}
```

`sampleAt(strokes, workTimeAt(segMap, frame.t))` produces the correct frame.

This is the most significant engine change. It must be implemented carefully to
preserve seek/scrub correctness. Alternative: keep `engine.duration` as pure
work time, and map the scrubber range to include rests at the page level.
**Preferred:** keep the engine opaque and let `buildState` handle rest detection
from the raw engine time vs the segment map.

Given complexity, the engine clock remains at work-time only in v1. Rest
intervals are a **display-only** extension: `buildState` detects when the work
time is at `segMap[k].endT` (the last stroke of segment k) and the scrubber is
positioned in the rest window using a separate `$state restPhase` that advances
independently. This avoids engine changes while delivering the rest overlay
without scrubber distortion.

### Revised rest-interval approach (simpler)

The replay engine does not change. Rest time is not on the playback clock.
Instead:

1. When the engine pauses at `frame.t === segMap[k].endT` (within epsilon),
   Replay_Page detects "at a segment boundary" and can automatically advance
   a `restOffset` counter from 0 to `segMap[k+1].restBefore` using a separate
   `setTimeout`/`rAF` loop while the engine is paused at that position.
2. `transitionPhase = restOffset / segMap[k+1].restBefore`.
3. When `restOffset` reaches `restBefore`, the engine resumes at
   `segMap[k+1].startT` (which equals `segMap[k].endT` in work time — the engine
   has no gap).

This means rests play out as a visual-only interstitial at the end of each work
segment. The scrubber does not show rest time in v1. The rest animation runs
at normal wall time (not scaled by `speed`). This is simpler and avoids
substantial engine surgery.

If the user seeks past a segment boundary, `transitionPhase` is skipped (hard
cut). This is the correct behaviour per Req 7.5.

---

## 13. Performance

### 3D three-avatar cost

Three avatars instead of one. Each avatar is ~300–500 triangles. Combined
~1200 triangles is negligible compared to the ground plane (140×140 with up to
`28×28 = 784` segments for the rolling water) and the rest of the scene.
Shadow maps are `1024×1024` regardless of avatar count.

The `switchAvatarTo` method only runs on segment boundaries (at most 2 times
per MultiErg workout) — it is effectively free at playback time.

### 2D lane cost

The 2D world morph is a conditional `if (sport === 'rower')` in the hot path.
The branching is already present for other per-sport decisions. No new per-frame
allocations.

### `buildSegmentMap` cost

Called once per `detail` change, not per frame. `n` is at most ~20 splits.
O(n). Effectively free.

### `activeMachineAt` cost

Called twice per frame (once in `buildState`, once in `paceGaugeRange`). O(n)
linear scan, `n <= 5`. Well within budget.

---

## 14. Testing Strategy

### Unit tests (`src/lib/server/concept2.test.ts`)

- `mapStrokes` three-segment MultiErg: raw bike `p = 200` (per-1000 m tenths)
  → normalised pace `= 200 / 10 / 2 = 10 s/500 m`; raw row `p = 1200` →
  `120 / 10 / 1 = 120 s/500 m`. Verify both.
- `mapStrokes` single-sport unchanged with and without `splits`.
- Reset boundary: last stroke of segment 0 and first stroke of segment 1 get
  different `paceDiv`.

### Unit tests (`src/lib/replay/engine.test.ts`)

- `buildSegmentMap` with three-segment fixture: verify `startD`/`endD`,
  `restBefore`, `startT`/`endT`.
- `activeMachineAt` boundary conditions.
- `restProgressAt` returns `null` outside rests, correct `phase` inside.
- Empty splits fallback.

### Type check

`npm run check` → 0 errors. Both `RenderState.sport` callers updated to provide
a required value. `WorkoutDetail.isMultiErg` set in both `mapResult` (server)
and `detailFor` (mockData).

### Build

`npm run build` → `three` remains in the lazy chunk. No new static imports of
`three`.

### E2E (WebKit — `tests/e2e/multierg.spec.ts`)

- Navigate to `/replay/1012` in demo mode.
- Assert the page title contains "MultiErg".
- Assert a badge/note with i18n key `replay.multiErg` is visible.
- Seek to a time inside segment 2 (BikeErg):
  - Assert pace gauge unit shows `/1000m`.
  - Assert cadence unit shows `rpm`.
- Seek back to segment 0:
  - Assert pace gauge unit shows `/500m`.
  - Assert cadence unit shows `spm`.
- Seek to the rest after segment 0:
  - Assert the rest overlay (key `replay.restInterval`) is visible.
- Assert "Publish" button is absent (leaderboard fence, Req 10.1).
- Assert canPublish is false (can be tested via absence of publish button).

### E2E regressions

`/replay/1001`, `/replay/1003`, `/replay/1004` — existing single-sport flows
must pass unchanged. The segment map for these is a single-element array; the
pace gauge unit is `/500m` for all three.

---

## 15. File Manifest

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `isMultiErg: boolean` to `WorkoutDetail`; add `isMultiErg?: boolean` to `Workout` (for leaderboard fence) |
| `src/lib/server/concept2.ts` | `mapStrokes(raw, sport, splits?)` — per-segment normalization; `isMultiErg` computed in `getWorkout` |
| `src/lib/replay/engine.ts` | `SegmentInfo`, `buildSegmentMap`, `activeMachineAt`, `activeSegmentIndexAt`, `restProgressAt` |
| `src/lib/replay/renderer.ts` | `RenderState.sport` required; add `segmentIndex?`, `transitionPhase?`, `transitionFrom?`, `transitionTo?` |
| `src/lib/replay/renderer3d.ts` | Pre-build all three avatars; `switchAvatarTo`; ground morph; `WakeTrail.setColor`; dispose all three |
| `src/lib/replay/sports.ts` | Export `SPORT_LANE_COLORS` (shared between 2D/3D) |
| `src/routes/replay/[id]/+page.svelte` | `buildState` with segment map; `activeSport` derived; gauge re-baseline; leaderboard + ghost fences |
| `src/routes/r/[token]/+page.svelte` | `buildState` with segment map; per-frame `sport` |
| `src/components/MetricGauge.svelte` | Optional `axisLabel` prop |
| `src/lib/mockData.ts` | Fixture `1012` with three segments, resets, `isMultiErg: true` |
| `src/lib/locales/*.ts` | Four new keys in all six locales |
| `src/lib/server/concept2.test.ts` | Per-segment normalization unit tests |
| `src/lib/replay/engine.test.ts` | Segment map + helpers unit tests |
| `tests/e2e/multierg.spec.ts` | New WebKit smoke test |

---

## 16. Non-Goals (v1)

- Ghost-racing one MultiErg against another MultiErg.
- Sport+distance leaderboard entries for MultiErg workouts.
- Time-accurate rest intervals on the scrubber timeline (rest time is not on
  the playback clock in v1).
- Bespoke MultiErg summary statistics (average pace across machines is
  meaningless; the existing per-split breakdown is sufficient).
- Animating the athlete physically moving between stations (the idle avatar
  with a rest countdown is sufficient for v1).
