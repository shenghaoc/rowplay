# Workout Type Tagging — Design

## Overview

**Auto-tagging** detects the structural type of every workout (steady-state,
interval, race-piece, time-trial, etc.) from its split data alone, with no ML
required. The auto-detected tag is the default; the athlete can **override** it
with a manual label that is persisted to D1. Tags are displayed as daisyUI
badges in the workout list and replay header, and are used as a filter in the
dashboard workout list.

## Tag taxonomy

```ts
export const WORKOUT_TAGS = [
  'steady-state',
  'interval',
  'race-piece',
  'time-trial',
  'warmup-cooldown',
  'unknown',
] as const;
export type WorkoutTag = typeof WORKOUT_TAGS[number];
```

## Auto-detection logic (pure, deterministic)

Detection rules applied in priority order:

| Tag | Conditions |
|-----|-----------|
| `interval` | ≥ 2 work intervals with distinct rest periods in the split list (rest detected by `interval.type === 'rest'` or a pace gap > 30 s/500m between consecutive splits). |
| `warmup-cooldown` | Single piece; duration < 8 min AND average pace > athlete median pace × 1.25. |
| `race-piece` | Single piece; duration < 12 min OR distance ≤ 2 000 m; average pace ≤ athlete median pace × 1.25 (excludes easy-paced warmups). |
| `time-trial` | Single piece; 12 min ≤ duration ≤ 35 min; pace variance (stddev) < 3 s/500m across splits. |
| `steady-state` | Single piece; duration > 35 min; pace variance < 6 s/500m. |
| `unknown` | None of the above matched. |

The athlete median pace is passed in as a parameter (already available from
dashboard data); if unavailable, rules that reference it are skipped.

## Pure module — `src/lib/workoutTag.ts`

```ts
export { WORKOUT_TAGS, WorkoutTag };

export interface TagContext {
  medianPaceSecs?: number;   // athlete's median pace sec/500m; undefined OK
}

/**
 * Auto-detect the workout type from its split / interval structure.
 * No network, no DOM.
 */
export function autoDetectTag(workout: Workout, ctx?: TagContext): WorkoutTag;

/**
 * Resolve the effective tag: user override (from userTag field) when set and
 * valid; otherwise auto-detected.
 */
export function resolveTag(
  workout: Workout & { userTag?: string | null },
  ctx?: TagContext,
): WorkoutTag;
```

## Data model change

Add a nullable `user_tag` TEXT column to `workouts`. This column stores
only the athlete's override (or NULL when using auto-detect). Storing the
override on `workouts` (not `workout_detail`) ensures it is visible in list
queries (`queryWorkouts`/`getAllWorkouts`) without a join, and works even
when the detail cache has not been created:

```sql
-- migrations/0010_workout_tag.sql  (or next sequential number)
ALTER TABLE workouts ADD COLUMN user_tag TEXT;
```

No index needed (looked up per workout, not queried in bulk).

## Server helpers

In `src/lib/server/db.ts`:

```ts
/** Write or clear the user tag for one workout. Returns the updated row count. */
export async function setWorkoutTag(
  db: D1Database,
  userId: number,
  workoutId: number,
  tag: WorkoutTag | null,
): Promise<void>;
```

Uses `UPDATE workouts SET user_tag = ? WHERE id = ? AND user_id = ?`
to enforce ownership. In demo mode the endpoint returns success without touching D1.

## API endpoint

`src/routes/api/workout/[id]/tag/+server.ts` — `PATCH`:

- Body: `{ tag: WorkoutTag | null }`.
- Validate `tag` is in `WORKOUT_TAGS` or null.
- Call `setWorkoutTag(db, userId, workoutId, tag)`.
- Return `{ tag }` (the written value) with `cache-control: private, no-store`.
- 401 if unauthenticated in live mode.
- 400 if `tag` is an unrecognised string.
- Demo mode: return `{ tag }` immediately (no D1 write).

## UI — workout list badge + inline editor

In the workout list (`src/routes/dashboard/+page.svelte` or the workout list
component), each row shows a small `badge badge-ghost` with the resolved tag
label. Clicking the badge opens an inline `<select>` (or a daisyUI `dropdown`)
with the 6 tag options plus a "— Auto-detect —" option (sets `userTag = null`).

- On selection: optimistic UI — update local state immediately; `PATCH
  /api/workout/{id}/tag` in the background; revert on error + toast.
- The badge style reflects the effective tag:
  - `badge-ghost` for `unknown` / auto-detected
  - `badge-info` for `steady-state`
  - `badge-success` for `race-piece` / `time-trial`
  - `badge-warning` for `interval`
  - `badge-neutral` for `warmup-cooldown`

## UI — replay page header

The replay workout header (workout name + date row in `replay/[id]/+page.svelte`)
gains the same tag badge with the same inline editor, so athletes can tag a
workout while watching it.

## UI — dashboard workout-type filter

The existing filter bar on the dashboard gains a "Type" filter chip group (using
the same daisyUI `join`/`btn` pattern as sport filters), listing all 6 tag
values plus "All". Filtering is client-side (no new server call).

## i18n keys

New keys under `workout.tag` (all 6 locale files):

| Key | EN value |
|-----|----------|
| `workout.tag.label` | Type |
| `workout.tag.auto` | Auto-detect |
| `workout.tag.steady-state` | Steady state |
| `workout.tag.interval` | Interval |
| `workout.tag.race-piece` | Race piece |
| `workout.tag.time-trial` | Time trial |
| `workout.tag.warmup-cooldown` | Warm-up / cool-down |
| `workout.tag.unknown` | Other |
| `workout.tag.filter.all` | All types |
| `workout.tag.saveError` | Couldn't save tag — please try again |

## Demo mode

`autoDetectTag` runs on mock workouts. The PATCH endpoint returns success
immediately without a D1 write. The inline editor is fully functional (optimistic
state update) so the feature is explorable in demo mode.

## Out of scope

- Free-text workout notes / journal entries (a separate "annotation" feature).
- Tags shared between athletes.
- Tag-based analytics (e.g. training load per tag type) — follow-up.
