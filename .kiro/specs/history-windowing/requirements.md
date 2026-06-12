# Windowed History Sync with Lazy Backfill — Requirements

## Introduction

On first connect, rowplay's sync pages the Concept2 results API **backward
through the athlete's entire history** into D1 — `Concept2Client.listWorkoutsPage`
(`src/lib/server/concept2.ts`), driven by `syncWorkouts` in
`src/lib/server/data.ts` and the `/api/sync` endpoint. For a long-time athlete
that is many API calls and a slow first sync, and workouts from many years ago
have little day-to-day analytical value.

This feature makes first connect **fast and bounded**: sync only the most recent
**12 months** so the dashboard and replay are usable almost immediately, then
**lazily backfill** older history in the background / on demand. Backfill is
**resumable** across sessions via a persisted watermark in D1 and **idempotent**
(the existing `(user_id, workout_id)` upsert never duplicates rows). The window
length is a **single named constant**, not hardcoded inline.

The decision is **locked**: window-first, lazy backfill. This spec captures the
behaviour; it does not change the detail cache, the D1 schema beyond a small
watermark addition, or the replay/renderer.

It obeys every project rule in `AGENTS.md`: works in **demo mode** (no
credentials), every user-visible string through **i18n** in all six locales,
server-only logic stays server-side, pure helpers are DOM-free and unit-tested,
and it passes the full quality gate (`check` + `build` + `test` +
`validate:locales` + `test:e2e`).

## Glossary

- **Window** — the recent slice synced eagerly on first connect: workouts on or
  after `today − HISTORY_WINDOW_MONTHS`.
- **Window start** — the `from` date (`YYYY-MM-DD`) bounding the window, derived
  once from the constant and "today" (UTC).
- **Backfill** — the progressive, after-the-fact sync of history **older** than
  the window, down to the athlete's first-ever workout.
- **Watermark / cursor** — the persisted marker of how far **back** sync has
  reached (the oldest date synced so far), plus a "fully backfilled" flag. Lives
  in D1 so backfill resumes across sessions.
- **Chunk** — one bounded backfill unit of work (a small number of 250-result
  pages) processed per request, so no single invocation hammers the API or
  exhausts Worker limits.
- **Incremental sync** — the existing forward catch-up from `last_date` for newly
  logged workouts; unchanged by this spec and orthogonal to backfill.

## Requirements

### Requirement 1 — Fast, bounded first connect

**User story:** As a returning athlete connecting for the first time, I want the
dashboard usable in seconds, so that I'm not waiting on years of history to page
in.

#### Acceptance criteria

1. WHEN a user connects and **no sync state exists** THE first sync SHALL fetch
   only workouts on or after **`today − HISTORY_WINDOW_MONTHS`**, reusing the
   existing `from` parameter on `listWorkoutsPage`, NOT the full history.
2. THE window start SHALL be computed from a **single named constant**
   (`HISTORY_WINDOW_MONTHS`) and "today" in **UTC**, by a **pure, DOM-free**
   helper that is unit-tested (including month/year rollover and end-of-month
   boundaries).
3. THE windowed first sync SHALL complete **without blocking first dashboard
   paint** — the dashboard's existing cold-start path (one live page / mock)
   serves the initial render while the windowed sync runs.
4. WHEN the windowed first sync completes THE forward high-water mark
   (`last_date`) SHALL be set as today, AND a backward **watermark** SHALL be
   recorded marking the window start as the oldest date reached so far, with the
   "fully backfilled" flag **unset** (older history may remain).

### Requirement 2 — Lazy, resumable, idempotent backfill

**User story:** As a long-time athlete, I want my older history to fill in by
itself after the recent stuff lands, so that PBs and lifetime trends become
complete without a slow first sync.

#### Acceptance criteria

1. AFTER the window lands THE app SHALL backfill history **older than the current
   watermark** progressively, advancing the watermark to the oldest workout date
   synced in each chunk.
2. THE backfill SHALL be **resumable across sessions**: state is read from the
   persisted watermark in D1, so a backfill interrupted by leaving the app
   resumes from where it stopped on the next visit — never restarting from the
   window.
3. THE backfill SHALL be **idempotent**: it reuses the existing D1 upsert keyed
   by `(user_id, workout_id)`, so re-running it (overlap, retries, re-connect)
   never duplicates rows.
4. WHEN a backfill chunk returns **no workouts older than the watermark** THE
   "fully backfilled" flag SHALL be set and no further backfill SHALL run until
   forced. (An athlete with under `HISTORY_WINDOW_MONTHS` of history reaches this
   after one empty chunk.)
5. THE watermark SHALL only ever move **outward** (oldest-date strictly older,
   `last_date` strictly newer); a stale or out-of-order chunk SHALL NOT regress
   it. The watermark-merge logic SHALL be a **pure** function and unit-tested.
6. THE backfill SHALL fetch **workout summaries only** (the existing
   `upsertWorkouts` path); per-stroke **detail** stays lazily hydrated and cached
   on replay open, so backfill never pulls stroke data en masse.

### Requirement 3 — Respect the API

**User story:** As a good API citizen, I want sync to stay within Concept2's
limits, so that the athlete is never rate-limited or throttled.

#### Acceptance criteria

1. BOTH the windowed sync and backfill SHALL request **250 results per page**
   (the API maximum already used by `listWorkoutsPage`).
2. THE backfill SHALL be **chunked**: each backfill request processes at most a
   bounded number of pages (a single named constant), persisting the watermark as
   it goes so a long history is drained over several cheap requests rather than
   one unbounded run.
3. WHEN the API returns **429 (rate limited)** THE backfill SHALL back off and
   retry later rather than hammering, reusing the rate-limit handling already
   present for live-mode polling.
4. THE background backfill SHALL pace itself between chunks (a sensible interval),
   and SHALL stop once the "fully backfilled" flag is set.

### Requirement 4 — Sync-status affordance

**User story:** As an athlete, I want to see whether I'm looking at the last 12
months or my whole history, so that I trust my PBs and trends.

#### Acceptance criteria

1. THE app SHALL surface sync status reflecting one of: **window synced**
   (recent only, backfill pending), **backfilling** (with progress, e.g. count
   synced / oldest date reached), or **full history synced**.
2. THE status SHALL be derived from the persisted watermark via the existing
   `syncStatus` loader path (dashboard + settings), not from client guesses.
3. EVERY user-visible status string (window label, backfilling, complete,
   on-demand action) SHALL be added to **all six** locale dictionaries (`en`,
   `zh`, `de`, `es`, `fr`, `ja`) and pass `pnpm run validate:locales`.
4. THE window length shown to the user SHALL be derived from the same
   `HISTORY_WINDOW_MONTHS` constant (passed through the loader), never a separate
   hardcoded "12".

### Requirement 5 — Demo mode

**User story:** As a developer or first-time visitor, I want the feature to work
with no credentials, so that demo, dev, and e2e need no Concept2 token.

#### Acceptance criteria

1. WHERE the session is **demo** THE feature SHALL **skip all real paging and
   backfill** — `mockData.ts` is already bounded (a handful of recent workouts),
   so no window query, watermark, or backfill loop runs.
2. THE sync-status affordance in demo SHALL show a demo indicator (reusing the
   existing demo badge) rather than window/backfill state.
3. THE windowed-sync and backfill **pure helpers** (window start, watermark
   merge, chunk planning) SHALL be testable without any binding (KV/D1) or
   network.

### Requirement 6 — Configurable window + on-demand full backfill

**User story:** As the maintainer, I want the window length in one place and an
escape hatch to force a complete sync, so that the policy is easy to change and
power users can pull everything now.

#### Acceptance criteria

1. THE window length SHALL be defined by exactly **one** constant
   (`HISTORY_WINDOW_MONTHS`); changing it SHALL change first-connect behaviour
   with no other edits.
2. THE design SHALL document how a user **triggers a full backfill on demand**:
   the existing `/api/sync?full=1` path (force complete sync) remains as the
   escape hatch, and an explicit "load full history" affordance drives backfill
   to completion (clearing the "fully backfilled" flag if previously set).
3. THE existing **incremental** forward sync (catch-up from `last_date` for newly
   logged workouts) SHALL keep working unchanged alongside windowing and
   backfill.

### Requirement 7 — Quality and lifecycle

#### Acceptance criteria

1. THE window-start helper, the watermark-merge logic, and the chunk/backfill
   planning SHALL be **pure** and **unit-tested**.
2. THE persisted watermark SHALL live with the existing `sync_state` so it is
   **purged on disconnect/logout** by `purgePrivateCache` and on account delete
   by `deleteUserData` — consistent with the session-scoped cache lifecycle in
   the `concept2-token-privacy` spec (referenced, not re-specified).
3. THE feature SHALL pass the full gate: `pnpm run check` (0 errors),
   `pnpm run build`, `pnpm run test`, `pnpm run validate:locales`, and
   `pnpm run test:e2e` (a smoke spec asserts the sync-status affordance renders in
   demo mode).
