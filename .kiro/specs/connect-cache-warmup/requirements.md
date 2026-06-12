# Snappy BYOT connect & dashboard loads

## Introduction

Two issues surfaced after the token-privacy work (see `concept2-token-privacy`).
First, submitting a personal token at `/auth/token` gave no UI feedback while the
server validated it against the Concept2 API, so the connect button felt dead for
several seconds. Second, every Dashboard / workout-list navigation paid a ~1s live
Concept2 round-trip: the privacy spec's _purge-on-disconnect_ empties the D1 cache
on reconnect, and the cold-start data path re-fetched (and discarded) a live page
on every load instead of reading a cache.

This spec covers four changes that make the post-connect experience fast — and,
critically, keep cache reads **honest** so a partially-filled cache is never shown
as the athlete's complete history.

## Glossary

- **Cold start** — An authenticated session whose D1 workout cache has not yet been
  filled by a completed sync (e.g. right after connect, or after a disconnect-purge).
- **Sync state** — The `sync_state` row written by `runSync` only at the _end_ of a
  full page-through; its presence means "a sync has completed, D1 is authoritative."
- **Warm cache** — D1 holds the athlete's full history and sync state exists, so
  reads are served locally with no live API call.
- **Lazy-fill** — Persisting a live API page into D1 on a cache miss. (Tried, then
  removed — see Requirement 3.)

## Requirements

### Requirement 1: Connect submit feedback

**User Story:** As an athlete pasting my token, I want the connect button to show it
is working, so a slow server-side validation doesn't look like a broken click.

#### Acceptance Criteria

1. WHEN the token form is submitted, THEN the system SHALL immediately disable the
   submit button and show a pending indicator (spinner + "Connecting…" label) until
   the request resolves.
2. WHEN the action fails (e.g. rejected token), THEN the system SHALL re-enable the
   button so the athlete can retry, and SHALL surface the error.
3. WHEN the action succeeds, THEN the pending state SHALL persist through the
   redirect to the dashboard (the form is navigating away).
4. The "Connecting…" string SHALL be defined in all six locales.

### Requirement 2: Warm the cache on connect

**User Story:** As an athlete who just connected, I want my dashboard to become fast
on its own, so I don't have to find and press a Sync button first.

#### Acceptance Criteria

1. WHEN a token connect succeeds on the Workers runtime, THEN the system SHALL start
   a full history backfill into D1 in the background (via `waitUntil`), without
   blocking the redirect.
2. The background sync SHALL build its Concept2 client directly from the
   just-validated token (no KV read), so it is not subject to KV read-after-write lag
   and never touches the post-response request event.
3. The background sync SHALL force a _full_ backfill, so a reconnect after a
   disconnect-purge re-pages the whole history rather than trusting stale sync state.
4. WHEN the Workers runtime is unavailable (e.g. `vite dev`, no `waitUntil`/D1), THEN
   `scheduleConnectSync` SHALL be a no-op (no error).
5. The raw token SHALL NOT be written to KV by this path (privacy model from
   `concept2-token-privacy` is preserved — it lives only in the cookie and the
   transient in-memory client).

### Requirement 3: Never serve a partial cache as the full history

**User Story:** As an athlete, I want my PBs, aggregates, and exports to reflect my
_entire_ logbook, so a cache that is still filling never silently omits older
workouts.

#### Acceptance Criteria

1. WHEN no sync has completed for the user (no sync-state row), THEN `loadWorkouts`,
   `loadWorkoutList`, and `loadDashboardAggregates` SHALL NOT treat D1 rows as the
   full history.
2. WHEN sync state is absent, THEN the cold path SHALL serve a single live API page
   for display and SHALL NOT persist it (a partial page must not become an
   authoritative cache).
3. WHEN sync state exists, THEN reads SHALL be served from D1 (the fast, complete
   path), as before.
4. The sync-state check SHALL be memoised per request so a single dashboard load
   incurs at most one `getSyncState` read across all loaders.
5. The gate SHALL also cover the window _during_ an initial backfill (rows present,
   sync state not yet written) and a _failed/partial_ backfill (rows present, sync
   state never written).

### Requirement 4: One live fetch per request

**User Story:** As an operator, I want a cold dashboard load to make a single live
API call, so connect-time load doesn't fan out into duplicate Concept2 requests.

#### Acceptance Criteria

1. WHEN `loadWorkouts` is called more than once within a single request (directly and
   via `loadWorkoutList`'s cold fallback), THEN the underlying work SHALL run once and
   the result SHALL be shared.
2. The shared result SHALL be safe to share (consumers, e.g. `filterAndSortWorkouts`,
   must not mutate it in place).
3. The memo SHALL be scoped to one request (keyed by the request event) and not leak
   across requests.

### Requirement 5: Quality gate & documentation

**User Story:** As a maintainer, I want the change verified and the spec recorded, so
the work is traceable.

#### Acceptance Criteria

1. `pnpm run check` SHALL report 0 errors; `pnpm run test` SHALL pass; `pnpm run build`
   SHALL succeed; `pnpm run validate:locales` SHALL pass.
2. WHEN the spec is complete, THEN it SHALL be listed in `AGENTS.md`.

## Non-functional requirements

- Demo mode is unchanged (no auth, no D1, deterministic mocks).
- Items in Requirements 2–4 take effect only on the Workers runtime
  (`pnpm run preview` / production) with D1 migrations applied; they are inert under
  plain `vite dev`.
- No new D1 migration (`sync_state` already exists).
- Cache writes remain best-effort: D1 errors are swallowed and fall through to a live
  page rather than failing the request.
