# Design: EXR source flag

## Overview

This spec adds an **"EXR / algorithmic source" badge** to the workout-detail /
replay view when the workout's `source` field matches the observed EXR value.
The feature is deliberately narrow: read the `source` field captured by PR
#61, run it through a pure detector, and surface a caveated badge. Nothing else
changes — analytics, leaderboard logic, and the replay engine are untouched.

Rationale: "never accept wrong, meaningless representations." EXR synthesises its
own pace and power figures that are not PM-derived. Displaying them without
provenance is a false equivalence. Flagging is the minimum honest intervention.

---

## Where the `source` field lives

`Workout.source?: string` is defined in `src/lib/types.ts`. It is populated by
`mapResult()` in `src/lib/server/concept2.ts` from the raw API field `r.source`,
which PR #61 introduced.

### Concept2 API alignment

The Logbook API exposes `source` as a read-only string on results, but the
reference docs **do not enumerate** allowed values — they only show `"Web"` and
`"ErgData"` as examples. Values such as `"EXR"` (and `"ErgZone"`) are
**observed in the wild, not documented**; treat any new value as unverified until
confirmed against real logbook traffic.

The detector therefore treats `source` as a free string, matches `"EXR"`
case-insensitively, and returns `false` for anything else (including absent
values). That tolerance is intentional: the API enum is unspecified.

### D1 persistence (internal)

The D1 `workouts` summary table has **no `source` column** (`upsertWorkouts` /
`rowToWorkout` do not round-trip it). List/dashboard rows loaded only from D1
summaries will have `source === undefined`. For this spec (replay/detail and
share views), `source` is available on:

- freshly synced API payloads and `workout_detail` JSON cache rows (full detail), and
- demo fixtures in `mockData.ts`.

Persisting `source` on the summary table is **out of scope** here; it is required
only if the badge must appear on list/dashboard items without opening detail.

The `source` field is part of the `Workout` type and therefore present on both
`Workout` and `WorkoutDetail` when populated. It is passed through `redactForPublic()` in
`src/lib/server/share.ts` unchanged (only `serialNumber`, `device`, `deviceOs`,
and `deviceOsVersion` are stripped — `source` is not hardware-identifying).

---

## Pure detector: `src/lib/exrSource.ts`

```ts
import type { Workout } from "./types";

/**
 * True when source matches the observed EXR value (case-insensitive).
 * EXR is not listed in Concept2 API docs; verify against real logbook data.
 */
export function isExrSource(workout?: Pick<Workout, "source"> | null): boolean {
  return workout?.source?.toUpperCase() === "EXR";
}
```

- Pure function — no DOM, no KV, no D1. Safe to import anywhere.
- Takes `Pick<Workout, 'source'>` rather than the full `Workout` so it works with
  both `Workout` and `WorkoutDetail` without widening the parameter type.
- Returns `false` when `source` is `undefined`, `null`, or any non-EXR string.

### Unit test: `src/lib/exrSource.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isExrSource } from "./exrSource";

describe("isExrSource", () => {
  it('returns true for "EXR"', () => expect(isExrSource({ source: "EXR" })).toBe(true));
  it("returns true case-insensitively", () => expect(isExrSource({ source: "exr" })).toBe(true));
  it("returns false for ErgData", () => expect(isExrSource({ source: "ErgData" })).toBe(false));
  it("returns false for Web", () => expect(isExrSource({ source: "Web" })).toBe(false));
  it("returns false when source is absent", () => expect(isExrSource({})).toBe(false));
  it("returns false when workout is null or undefined", () => {
    expect(isExrSource(null)).toBe(false);
    expect(isExrSource(undefined)).toBe(false);
  });
});
```

---

## Badge placement in the replay/detail page

File: `src/routes/replay/[id]/+page.svelte`

The badge is added to the `.summary` row, immediately after the existing
`lowRes` badge:

```svelte
{#if !detail.hasStrokeData}<span class="badge">{t('replay.lowRes')}</span>{/if}
{#if exrFlagged}<span class="badge" title={t('replay.exrBadgeTitle')}>{t('replay.exrBadge')}</span>{/if}
```

The `.badge` class is already used for `lowRes` and provides the correct pill
styling. No new CSS is needed.

`isExrSource` is imported from `$lib/exrSource` at the top of the `<script>`.

A `$derived` reactive variable `exrFlagged = $derived(isExrSource(detail))` is
preferred over calling the function inline in the template, consistent with the
Svelte 5 runes style used in the rest of the file.

---

## `mSource` row in the provenance panel

The "Logging provenance" `<dl>` block (line ~1652 in the current page, inside the
`<details>` "Full metrics" section) currently renders `pmVersion`, `firmware`,
`serialNumber`, `device`, `ergModelType`, and `hrType`. The `source` row is added
at the **top** of this block, before the PM-hardware fields:

```svelte
{#if detail.source}
  <div>
    <dt>{t('replay.mSource')}</dt>
    <dd>
      {detail.source}
      {#if exrFlagged}<span class="badge">{t('replay.exrBadge')}</span>{/if}
    </dd>
  </div>
{/if}
```

This positions the EXR inline badge where a user reading the panel will see it
alongside the source app name, reinforcing the header badge.

---

## Public share view: `src/routes/r/[token]/+page.svelte`

The `/r/[token]` page also renders a workout header. Apply the same badge
pattern as the detail page. `isExrSource` is imported from `$lib/exrSource`.
The `source` field passes through `redactForPublic` unchanged, so no server-side
change is required.

---

## Demo mode: `src/lib/mockData.ts`

The `Spec` interface gains an optional `source?: string` field:

```ts
interface Spec {
  // ... existing fields
  source?: string;
}
```

`detailFor()` sets `detail.source = spec.source` when present (the field is
already on the `Workout` type). The `id: 1004` "8000m BikeErg" entry is updated:

```ts
{ id: 1004, date: '2026-05-19 06:30:00', sport: 'bike', distance: 8000,
  basePace: 95, baseSpm: 85, baseHr: 150, workoutType: '8000m BikeErg',
  source: 'EXR' }
```

Navigating to `/replay/1004` in demo mode will show the badge. The dashboard list
for this workout will also show the badge if the dashboard is updated later (out
of scope for this spec).

---

## i18n keys

All locale files (`en`, `zh`, `de`, `es`, `fr`, `ja`) under `src/lib/locales/`
must gain these three keys under the `replay` namespace, inserted after the
existing `provenanceTitle` / `mDevice` block for locality:

| Key                    | English value                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `replay.mSource`       | `"Logged by"`                                                                                                                    |
| `replay.exrBadge`      | `"EXR source"`                                                                                                                   |
| `replay.exrBadgeTitle` | `"Pace and power were synthesised by EXR, not read from the PM5. Numbers may not be directly comparable to PM-logged workouts."` |

Non-English locales may use a machine-translation placeholder in the initial
implementation; the validator only checks key presence.

---

## What is explicitly NOT changing

| Area                                         | Reason                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/analytics.ts`                       | EXR pieces are analysed identically; FLAG not quarantine     |
| Leaderboard publish logic                    | EXR pieces may be published; no exclusion                    |
| `src/lib/replay/renderer.ts` and `engine.ts` | No EXR-specific rendering                                    |
| `redactForPublic()` in `share.ts`            | `source` already passes through                              |
| D1 `workouts` summary table                  | No `source` column; badge scope uses detail cache / API only |
| Race card PNG download                       | No EXR annotation on the card (out of scope)                 |

---

## Testing strategy

| Layer         | Coverage                                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| Unit          | `exrSource.test.ts` — true/false/absent/case-insensitive paths                 |
| Type          | `pnpm run check` — `isExrSource` call sites type-check; `Spec.source` optional |
| Build         | `pnpm run build` — no SSR access to DOM; `isExrSource` is pure                 |
| Manual (demo) | `/replay/1004` → EXR badge visible; `/replay/1001` → no badge                  |
| Locale        | `pnpm run validate:locales` — zero missing-key errors                          |

---

## Dependency on PR #61

The `source` field on `Workout` is populated by `mapResult()` in `concept2.ts`,
which was introduced in PR #61 ("Full-fidelity Concept2 data capture + deep
analysis"). Implementation of this spec **must not begin** until #61 is merged to
`main`. The spec itself is safe to write and review in parallel.

In demo mode, `source` is synthesised directly in `mockData.ts` without touching
`mapResult`, so the demo badge can be validated before any real API traffic.
