# Workout Type Tagging — Tasks

Implementation plan. Requirement references point at `requirements.md`.

- [x] **1. Pure tag detection** — `src/lib/workoutTag.ts`
  - `WORKOUT_TAGS` constant; `WorkoutTag` type; `TagContext` interface.
  - `autoDetectTag(workout, ctx?): WorkoutTag` — rules in priority order:
    interval → warmup-cooldown → race-piece → time-trial → steady-state →
    unknown. Use `workout.splits` and `workout.isInterval` for structure;
    `ctx.medianPaceSecs` for warmup rule (skip if absent).
  - `resolveTag(workout, ctx?): WorkoutTag` — return `userTag` when it is a
    valid `WorkoutTag` string; otherwise `autoDetectTag`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.3_

- [x] **2. Unit tests** — `src/lib/workoutTag.test.ts`
  - `interval`: workout with ≥ 2 work intervals → `interval`; rest-only
    workout → not `interval`.
  - `race-piece`: 500m piece → `race-piece`; 10k → not `race-piece`.
  - `steady-state`: 60min low-variance → `steady-state`.
  - `unknown`: short, no intervals, high variance → `unknown`.
  - `resolveTag`: valid `userTag` wins; invalid string falls back to auto;
    null falls back to auto.
  - _Requirements: 4.1_

- [x] **3. D1 migration** — `migrations/0007_workout_tag.sql`
  - `ALTER TABLE workouts ADD COLUMN user_tag TEXT;`
  - (Use the next sequential migration number if 0010 is taken.)
  - _Requirements: 2.2_

- [x] **4. DB helper** — `src/lib/server/db.ts`
  - `setWorkoutTag(db, userId, workoutId, tag | null): Promise<void>`
    — `UPDATE workouts SET user_tag = ? WHERE id = ? AND user_id = ?`.
  - Unit test in the DB test file: fake D1, verify SQL and bound params.
  - _Requirements: 2.2, 4.2_

- [x] **5. PATCH API** — `src/routes/api/workouts/[id]/tag/+server.ts`
  - Parse body; validate `tag ∈ WORKOUT_TAGS | null`; call `setWorkoutTag`;
    return `{ tag }`.
  - 401 unauthenticated (live), 400 invalid tag, demo no-op.
  - Unit tests: valid tag, null clear, 401, 400.
  - _Requirements: 2.2, 2.3, 4.2_

- [x] **6. Workout list tag badge + inline editor**
  - In the workout list component: render `badge` with resolved tag label and
    colour variant.
  - On click: show `<select>` with all `WORKOUT_TAGS` plus "auto" option.
  - Optimistic update → `PATCH /api/workout/{id}/tag` → revert + toast on error.
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4_

- [x] **7. Replay page tag badge** — `src/routes/replay/[id]/+page.svelte`
  - Same badge + editor as step 6, in the workout title/meta row.
  - _Requirements: 1.1, 2.1, 2.2_

- [x] **8. Dashboard type filter** — `src/routes/dashboard/+page.svelte`
  - Add "Type" chip group to the filter bar (daisyUI `join`/`btn btn-sm`).
  - Local `$state` for active tag filter; filter workout list client-side.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] **9. i18n keys** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
  - Add all `workout.tag.*` keys to all six locale files.
  - `pnpm run validate:locales` passes.
  - _Requirements: 4.3_

- [x] **10. Quality gate**
  - `pnpm run check` → 0 errors.
  - `pnpm run build` → succeeds.
  - `pnpm run test` → green; count ≥ previous.
  - _Requirements: 4.4, 4.5_
