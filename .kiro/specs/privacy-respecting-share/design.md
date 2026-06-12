# Privacy-respecting share — design

## Predicate — `src/lib/privacy.ts`

```ts
export function isPubliclyShareable(privacy?: string | null): boolean {
	return privacy?.trim().toLowerCase() === 'everyone';
}
```

Pure and fail-closed: only `everyone` is public; everything else (including
`undefined` / `null` / unknown values) is non-public. Unit-tested in
`privacy.test.ts`. Lives alongside the other DOM-free helpers (`analytics.ts`,
`workoutQuery.ts`).

## Enforcement — `src/lib/server/share.ts`

`createWorkoutShare` resolves the workout detail (demo: `mockWorkoutDetail`;
live: `loadWorkoutDetail`) and, **before** minting or returning any token,
throws `error(403, …)` when `!isPubliclyShareable(detail.privacy)`. In the live
path the detail is loaded up front (and reused for `putCachedDetail`) so even an
already-shared workout that has since gone non-public stops handing out its
link — fail closed.

Because `publishWorkout` and the `/api/workouts/[id]/share` endpoint both go
through `createWorkoutShare`, they inherit the block with no extra code (R2).

The `privacy` field is already captured from the Concept2 result in
`concept2.ts` (`mapResult`) onto `Workout` / `WorkoutDetail`, so no schema,
migration, or capture work is needed.

## Client — `src/routes/replay/[id]/+page.svelte`

`shareReplay()` special-cases a `403` from the share endpoint and shows
`toast.error(t('share.privacyBlocked'))` instead of the generic failure toast.

## i18n

`share.privacyBlocked` added to `en, zh, de, es, fr, ja`.

## Demo data — `src/lib/mockData.ts`

`detailFor` defaults demo workouts to `privacy: 'everyone'` (so the existing demo
and e2e share flows keep working) and the spec for workout `1002` is marked
`private` to exercise the block path in demo mode.
