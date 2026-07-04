# Design: State re-seed and dead-code cleanup

## Scope

This is a narrow bugfix/code-quality PR. It does not redesign replay,
settings, sync, or workout moment cards.

## Sync endpoint

`src/routes/api/sync/+server.ts` already rejects demo-mode requests before
calling `syncWorkouts`. The post-sync status load can therefore call
`syncStatus(event)` directly and keep the existing `catch(() => null)` fallback
for optional status failures.

## Replay published state

`src/routes/replay/[id]/+page.svelte` uses writable `$derived` for
`published`. The derived value follows `data.published` when SvelteKit replaces
page data on navigation, while publish/withdraw handlers can still assign a
temporary UI value after the network request succeeds.

This replaces the `$state(data.published)` initializer plus `$effect` re-seed,
which left a `state_referenced_locally` warning.

## Settings timezone state

`src/routes/settings/+page.svelte` separates persisted timezone state from an
in-flight pending selection:

- `persistedTz` derives from `data.homeTimezone` for authenticated users.
- `demoHomeTimezone` is loaded from localStorage on mount for demo mode.
- `pendingTz` holds the select value while `saveTimezone` is in flight.
- `selectedTz` derives from `pendingTz ?? persistedTz`.

The change handles empty-string UTC/default selections, avoids non-reactive
dirty flags, and keeps the selected option stable while a save and
`invalidateAll()` complete.

## Workout moment helper

`src/lib/workoutMoments.ts` keeps the existing pre-sized fill loop but uses
`Array.from({ length })`, matching the repo's existing lint-friendly allocation
pattern without changing the analysis algorithm.

## Validation

Use the repo's standard gate:

- `./node_modules/.bin/vp run typecheck`
- `./node_modules/.bin/vp test run src/lib/workoutMoments.test.ts src/routes/api/sync/server.test.ts`
- `./node_modules/.bin/vp run check`
