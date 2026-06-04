# Comparability Guard — Design

## Overview

This spec closes a correctness gap: the ghost picker and `/compare` page will
happily race a 2k fixed-distance RowErg piece against a 30-minute fixed-time
piece that merely covered ≈ 2k, or against a BikeErg effort. The leaderboard
already enforces `(sport, distance)` scope as a first-class invariant. The
comparability guard extends that invariant to every remaining comparison surface
with a **hard block** — not a warning.

The core is a single pure predicate `areComparable(a, b)` backed by two helpers
(`classifyAxis` and `durationBand`). No UI is rendered, no chart drawn, for an
incomparable pairing.

```
Workout A ──┐
            ├──> areComparable(a, b) ──> true/false
Workout B ──┘         │
                      │  false → hard block:
                      │    ghostPick.ts  → candidate excluded from pool
                      │    /compare      → error card, no charts
                      │
                      │  true → existing flow unchanged
```

## The equivalence key

Two pieces are **comparable** when all three conditions hold:

1. **Same sport** (`a.sport === b.sport`) — RowErg vs RowErg, etc.
2. **Same axis** — both pieces target the same dimension:
   - `DistanceAxis`: fixed-distance pieces (the default; unlabelled workouts
     also fall here because the Concept2 default is a distance piece).
   - `TimeAxis`: fixed-time pieces (JustRow/JustSki/JustBike, FixedTimePace,
     and any other `workout_type` with fixed-time semantics).
3. **Same axis-band** — for `DistanceAxis`, the two `distanceBand()` keys
   must match. For `TimeAxis`, the two `durationBand()` keys must match.

Distance and time are **orthogonal axes**: a fixed-distance 2k is never
comparable to a fixed-time piece that covered ≈ 2k. The athlete choosing a
timed piece is optimising for sustained effort over a time window; the
athlete choosing a distance piece is optimising to finish a target distance as
fast as possible. These are different sports within the same machine.

This principle is already embodied by the leaderboard (`leaderboard.ts`), which
only ranks results on the same `(sport, standardDistance)` board and refuses to
accept a timed piece at all — the missing piece is formalising it for ghost /
compare.

## New module: `src/lib/replay/comparabilityGuard.ts`

Pure, DOM-free, no Svelte imports. Importable on server or client.

### `classifyAxis`

```ts
export type ComparabilityAxis = 'distance' | 'time';

/**
 * Map a Concept2 workout_type string to its comparability axis.
 * Time-axis types are the explicitly timed workouts; everything else —
 * including undefined / unknown strings — is distance-axis.
 */
export function classifyAxis(workoutType: string | undefined): ComparabilityAxis;
```

The known Concept2 `workout_type` values that indicate a fixed-time target are:

| workout_type | Axis |
|---|---|
| `"JustRow"` | time |
| `"JustSki"` | time |
| `"JustBike"` | time |
| `"FixedTimePace"` | time |
| any string containing `"JustRow"`, `"JustSki"`, `"JustBike"`, or `"FixedTime"` | time |
| `undefined`, `""`, or any other string | distance |

**Rationale for substring match:** the Concept2 API is loosely typed; observed
values in the wild include variant casing and suffixes. A substring check is
more resilient than a strict equality set while remaining conservative (time-
axis strings are unambiguously timer-initiated).

### `durationBand`

```ts
export interface DurationBand {
  /** Stable key, e.g. "1800". */
  key: string;
  label: string;
  /** Nominal duration in seconds (for sorting). */
  nominal: number;
}

/**
 * Bucket a workout duration into a like-for-like band so 30min-vs-30min
 * compares correctly and a 20min piece is not raced against a 60min piece.
 * Mirrors the shape of distanceBand() in analytics.ts.
 */
export function durationBand(seconds: number): DurationBand;
```

Defined in **`src/lib/analytics.ts`** (alongside `distanceBand`) to keep the
analytics layer as the single source of bucketing logic.

Standard targets and their ±10% snap windows:

| Target | Key | Window |
|---|---|---|
| 60 s (1 min) | `"60"` | 54 – 66 s |
| 240 s (4 min) | `"240"` | 216 – 264 s |
| 1200 s (20 min) | `"1200"` | 1080 – 1320 s |
| 1800 s (30 min) | `"1800"` | 1620 – 1980 s |
| 3600 s (60 min) | `"3600"` | 3240 – 3960 s |

Coarse fallback ranges for non-standard durations (analogous to
`distanceBand`'s coarse ranges):

| Range | Key |
|---|---|
| 0 – 90 s | `"r0"` |
| 90 – 360 s | `"r90"` |
| 360 – 900 s | `"r360"` |
| 900 – 2400 s | `"r900"` |
| 2400 – 4800 s | `"r2400"` |
| 4800 s + | `"r4800"` |

### `areComparable`

```ts
export interface ComparableContext {
  sport: Sport;
  /** Total distance in metres. */
  distance: number;
  /** Total elapsed time in seconds. */
  time: number;
  /** Concept2 workout_type string (may be absent). */
  workoutType?: string;
}

/**
 * Hard-block predicate. Returns true only when a and b are genuinely
 * like-for-like: same sport, same axis (distance vs time), same axis-band.
 */
export function areComparable(a: ComparableContext, b: ComparableContext): boolean;
```

Implementation:

```ts
export function areComparable(a: ComparableContext, b: ComparableContext): boolean {
  if (a.sport !== b.sport) return false;
  const axisA = classifyAxis(a.workoutType);
  const axisB = classifyAxis(b.workoutType);
  if (axisA !== axisB) return false;
  if (axisA === 'distance') {
    return distanceBand(a.distance).key === distanceBand(b.distance).key;
  }
  return durationBand(a.time).key === durationBand(b.time).key;
}
```

The `ComparableContext` interface is a subset of both `Workout` and
`WorkoutDetail`, so callers can pass either without an adapter.

## Changes to `src/lib/replay/ghostPick.ts`

The `GhostPickContext` already carries `{ id, distance, sport }`. Extend it to
include `time` and `workoutType` (both optional on the input side, defaulting to
`0` / `undefined`), so `areComparable` can be called:

```ts
export interface GhostPickContext {
  id: number;
  distance: number;
  sport: Sport;
  time?: number;           // total elapsed seconds
  workoutType?: string;    // Concept2 workout_type
}
```

`pickDefaultGhostCandidate` changes one line: the initial pool filter adds
`areComparable(current, c)`:

```ts
const pool = candidates.filter(
  (c) => c.id !== current.id && areComparable(current, c)
);
```

The distance-band ranking that follows is unchanged — it still prefers the
closest band match within the already-comparable pool. Because `areComparable`
now enforces same distance-band for distance-axis pieces, the `inBand` fallback
path is still logical (it becomes a no-op for well-filtered pools, but causes
no harm).

## Changes to `src/routes/replay/[id]/+page.svelte`

### Ghost picker dropdown

The `{#each data.candidates as w}` that populates the ghost `<select>` today
lists every candidate (already filtered to same-sport by the server). After this
change, it filters to `areComparable(detail, w)` on the client:

```svelte
{#each candidates.filter(c => areComparable(detail, c)) as w (w.id)}
  <option value={String(w.id)}>{workoutLabel(w)}</option>
{/each}
```

When this produces zero options the `<select>` naturally shows only the
placeholder, and the mode UI can show a `comparability.noComparableCandidates`
hint.

### Auto-pick on mode change

`onModeChange` already calls `pickDefaultGhostCandidate(candidates, ctx)`. The
`ctx` object gains `time` and `workoutType` from `detail`:

```ts
const pick = pickDefaultGhostCandidate(candidates, {
  id: detail.id,
  distance: detail.distance,
  sport: detail.sport,
  time: detail.time,
  workoutType: detail.workoutType
});
```

## Changes to `src/routes/compare/+page.svelte`

### Incomparability detection

After both details are loaded, a `$derived` value detects the reason:

```ts
type IncomparableReason = 'crossSport' | 'crossAxis' | 'crossBand' | null;

const incomparableReason = $derived<IncomparableReason>(() => {
  if (!detailA || !detailB) return null;
  if (detailA.sport !== detailB.sport) return 'crossSport';
  const axA = classifyAxis(detailA.workoutType);
  const axB = classifyAxis(detailB.workoutType);
  if (axA !== axB) return 'crossAxis';
  const bandOk = axA === 'distance'
    ? distanceBand(detailA.distance).key === distanceBand(detailB.distance).key
    : durationBand(detailA.time).key === durationBand(detailB.time).key;
  return bandOk ? null : 'crossBand';
});
```

### Hard block rendering

```svelte
{#if incomparableReason}
  <div class="card bg-base-100 border border-error shadow-md p-5 incomparable-block">
    <strong>{t('comparability.blockedTitle')}</strong>
    <p>{t(`comparability.reason.${incomparableReason}`)}</p>
    <p class="muted">{t('comparability.guidance')}</p>
  </div>
{:else if detailA && detailB}
  <!-- existing comparison rendering -->
{/if}
```

The existing `crossSport` warning card is **removed** and replaced by this
unified block (cross-sport is now a hard block, not a soft warning).

### Dropdown grouping

The workout picker `<select>` lists workouts in two `<optgroup>` blocks:
comparable (relative to whichever other slot is already set) and incomparable.
Incomparable entries are in a greyed-out group, not fully disabled — the user
can still select them, but the incomparability card will then fire. This
prevents the picker from appearing to "miss" workouts the user can see in the
dashboard.

## Reuse of the leaderboard principle

`leaderboard.ts` scopes each board to `(sport, standardDistance)`. The
comparability guard expresses the same invariant at a finer granularity and with
explicit axis separation:

| Layer | Invariant |
|---|---|
| Leaderboard | same `(sport, STANDARD_DISTANCES[i])` |
| Comparability guard | same `(sport, axis, axis-band)` |

The leaderboard already refuses timed pieces entirely (they have no
`matchStandardDistance`). The guard generalises this to the ghost/compare
surfaces that do accept timed pieces — but only when racing like-for-like.

## Dependency on PR #61 (full-fidelity-data)

`workout_type` is already stored in D1 and propagated through `concept2.ts →
db.ts → types.ts → Workout.workoutType`. That path exists today. PR #61 does
not change this field; it is listed as a dependency because the spec text says
so and because we want implementation to happen after #61 merges to avoid
merge conflicts on `concept2.ts`.

If `workoutType` is absent (pre-#61 rows or workouts from the list API that
omit it), `classifyAxis(undefined)` returns `'distance'`, which is the safe
fallback: the guard will bucket by distance and most user sessions are
fixed-distance. No migration is required.

## Mock data

`src/lib/mockData.ts` gains one fixed-time workout in the WORKOUT_SPECS table
(e.g. id `1012`, 30-minute piece, `workoutType: 'JustRow'`). This is sufficient
to demonstrate the block in demo mode:
- Ghost picker on replay/1001 (2k): excludes 1012 (JustRow).
- `/compare?a=1001&b=1012`: shows the incomparability card.

## i18n

New `comparability` block in all six locale files:

```ts
comparability: {
  blockedTitle: string;         // "Incomparable workouts"
  guidance: string;             // "Choose two workouts of the same type and distance."
  noComparableCandidates: string; // "No comparable sessions found."
  reason: {
    crossSport: string;         // "These workouts are on different machines."
    crossAxis: string;          // "One is a fixed-distance piece; the other is a fixed-time piece."
    crossBand: string;          // "These workouts are in different distance/duration bands."
  }
}
```

## Testing

### Unit tests — `src/lib/comparabilityGuard.test.ts`

Five mandatory cases (Req 7.1):

| Case | Expected |
|---|---|
| 2k rower vs 500m rower (same axis, different band) | `false` |
| 2k rower vs 2k rower (same axis, same band) | `true` |
| 30min rower vs 30min rower (time axis, same band) | `true` |
| 2k rower vs 30min rower (distance vs time axis) | `false` |
| 2k rower vs 2k skierg (different sport) | `false` |

Additional `durationBand` and `classifyAxis` cases (Req 7.2, 7.3).

### Quality gate

`npm run check` + `npm run build` + `npm run test` + `npm run validate:locales`
(Req 9). E2E is not required for this spec: the guard is pure logic tested at
the unit level; the UI integration is visible in demo mode via manual smoke.
