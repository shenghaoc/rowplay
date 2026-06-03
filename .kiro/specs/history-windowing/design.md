# Windowed History Sync with Lazy Backfill — Design

## Overview

Split the one big "page everything" first sync into two phases that hang off the
**existing** sync seam (`syncWorkouts` in `src/lib/server/data.ts` →
`Concept2Client.listWorkoutsPage` in `src/lib/server/concept2.ts` → `upsertWorkouts`
in `src/lib/server/db.ts`):

```
First connect (no sync_state)
  ┌─ Phase 1: WINDOW (eager, fast) ────────────────────────────────┐
  │  from = historyWindowStart(now)   // today − HISTORY_WINDOW_MONTHS
  │  page 1..totalPages of listWorkoutsPage(page, from)             │
  │  upsert summaries; set last_date = newest, oldest = window start │
  │  backfill_done = 0                                              │
  └─────────────────────────────────────────────────────────────────┘
                 │ dashboard usable now
                 ▼
  ┌─ Phase 2: BACKFILL (lazy, chunked, resumable) ─────────────────┐
  │  while !backfill_done:                                          │
  │    to = overlapDate(oldest)        // older than the watermark   │
  │    fetch ≤ BACKFILL_PAGES_PER_RUN pages (to-bounded, 250/page)  │
  │    upsert; advance oldest ← min(date) ; if empty → done = 1     │
  │  paced between runs; backs off on 429                           │
  └─────────────────────────────────────────────────────────────────┘
```

Subsequent connects keep doing the **incremental** forward catch-up (unchanged):
`from = overlapDate(last_date)`. Backfill is orthogonal and resumes from the
persisted watermark whenever it isn't `done`.

The detail cache (`workout_detail`, `DETAIL_PAYLOAD_VERSION`) and per-stroke
hydration are **untouched** — backfill only pulls summaries.

## The constant + pure helpers

### `src/lib/server/historyWindow.ts` (new, pure, server-only)

```ts
/** Eager first-connect window length. The single source of truth. */
export const HISTORY_WINDOW_MONTHS = 12;

/** Max 250-result pages drained per backfill request (API politeness). */
export const BACKFILL_PAGES_PER_RUN = 4;

/** `YYYY-MM-DD` window start: today − HISTORY_WINDOW_MONTHS, in UTC. */
export function historyWindowStart(now?: Temporal.PlainDate): string;

/** Pure decision: what the next sync run should do, given persisted state. */
export type SyncPlan =
  | { kind: 'window'; from: string }                 // first connect
  | { kind: 'incremental'; from: string | undefined } // forward catch-up
  | { kind: 'backfill'; to: string }                 // older than watermark
  | { kind: 'done' };                                // fully backfilled
export function planSync(state: SyncState | null, now: Temporal.PlainDate, mode: SyncMode): SyncPlan;

/** Fold a fetched chunk into the watermark; only ever moves outward. */
export function mergeWatermark(
  prev: { lastDate: string | null; oldestDate: string | null; backfillDone: boolean },
  chunkDates: string[],
  reachedEnd: boolean
): { lastDate: string | null; oldestDate: string | null; backfillDone: boolean };
```

- `historyWindowStart` uses `Temporal.Now.plainDateISO('UTC')` (matching
  `todayKeyUtc` in `datetime.ts`) and `.subtract({ months: HISTORY_WINDOW_MONTHS })`,
  so it is SSR/client-agnostic and rolls over months/years/leap days correctly.
  Unit-tested with a frozen `now`.
- `overlapDate(oldest)` (existing, `datetime.ts:40`) gives the day **before** the
  watermark for the backfill `to` bound — reused, not re-implemented.
- `mergeWatermark` is the only place the cursor advances: `lastDate = max`,
  `oldestDate = min`, `backfillDone` latches true when a chunk reached the end
  (no results older than `to`). Stale/out-of-order chunks can't regress it (Req
  2.5). Pure, fully unit-tested.

**Day-boundary precision (accepted limitation).** The `to` bound is the calendar
day *before* the oldest workout seen (`overlapDate`), so the cursor always moves
strictly backward and is guaranteed to terminate. The trade-off: if a single
calendar day holds more workouts than one backfill run can drain
(`BACKFILL_PAGES_PER_RUN × 250` = 1000), the un-fetched remainder of that day is
skipped once the cursor steps past it. This is accepted — 1000 logged pieces in
one calendar day is not a real athlete profile. An *inclusive* same-day bound
(`to = oldest.slice(0,10)`) is deliberately **not** used: because each run
re-pages newest-first from page 1, an inclusive bound would re-fetch the same
newest pages every run and never advance `oldest_date` for any athlete with more
than 1000 total workouts — a far worse failure than the boundary skip it would
close.

Server-only module so the constant never leaks the token-bearing path to the
client; the window length reaches the UI through the `syncStatus` loader (Req
4.4).

## D1 watermark — `migrations/0006_history_window.sql` (new)

Extend the existing `sync_state` table (per-user PK from `0002_workouts.sql`)
rather than add a table — keeps it in the lifecycle that `purgePrivateCache` /
`deleteUserData` already clear (Req 7.2):

```sql
ALTER TABLE sync_state ADD COLUMN oldest_date TEXT;            -- backward watermark
ALTER TABLE sync_state ADD COLUMN backfill_done INTEGER NOT NULL DEFAULT 0;  -- 0/1
```

- `oldest_date` — oldest workout date synced so far. NULL = window not yet
  synced (treat as first connect). After Phase 1 it equals the window start;
  backfill drives it older.
- `backfill_done` — latches to 1 when no history older than the watermark
  remains. The existing `last_date` / `total` columns are unchanged.
- No data migration needed: existing rows get `oldest_date = NULL`,
  `backfill_done = 0`. `planSync` resolves that state to `done`, and
  `backfillWorkouts` then **latches `backfill_done = 1` on that first no-op
  pass** (persisting the watermark even though no chunk was fetched) so the
  client stops re-triggering the backfill loop on every page mount.

### `db.ts` changes

- `SyncState` interface gains `oldestDate: string | null` and
  `backfillDone: boolean`; `getSyncState` selects the new columns.
- `setSyncState` (or a focused `setBackfillState`) persists `oldest_date` /
  `backfill_done` alongside `last_date` / `total`. `purgePrivateCache` and
  `deleteUserData` already `DELETE FROM sync_state` — no change needed there.

## Client (Concept2) — one small addition

`listWorkoutsPage(page, from?, number=250)` already supports `from` (the window
bound). Backfill needs the symmetric **upper** bound, so add an optional `to`:

```ts
listWorkoutsPage(page, from?, to?, number = 250)
// → qs.set('to', to) when present; same { workouts, totalPages } shape
```

**Confirmed against the official API docs** (`Concept2 Logbook API.html`,
`GET /api/users/{user}/results`):

- `from` — "results where the workout date is **on or after** this", `YYYY-MM-DD`.
- `to` — "results where the workout date is **on or before** this", `YYYY-MM-DD`.
  `from` and `to` combine, e.g. `?from=2015-05-01&to=2015-05-31`.
- Pagination `meta.pagination.total_pages` (and `total`, `count`, `per_page`,
  `current_page`) — exactly the shape `listWorkoutsPage` already reads; pages are
  **1-based**; **250** is the documented max per page.

So `to` is the minimal mirror of `from`; everything else (250 cap,
`total_pages`, `mapResult`) is reused unchanged.

## Sync orchestration — `src/lib/server/data.ts`

`syncWorkouts(event, full)` becomes plan-driven via `planSync`:

- **No state** → `window`: `from = historyWindowStart(now)`, page through, then
  `mergeWatermark` sets `last_date = newest`, `oldest_date = window start`,
  `backfill_done = 0`.
- **State, not done, forward run** → `incremental` (today's behaviour:
  `from = overlapDate(last_date)`).
- **`full = 1`** → force complete: clears `backfill_done`, pages everything
  (existing escape hatch, Req 6.2).

New `backfillWorkouts(event)` (called by the backfill endpoint):

- Reads `oldest_date`; computes `to = overlapDate(oldest_date)`.
- Pages `to`-bounded results, **≤ `BACKFILL_PAGES_PER_RUN`** pages per call,
  upserting summaries and advancing `oldest_date` after each page (so it resumes
  mid-chunk).
- On an empty older slice → `mergeWatermark(..., reachedEnd: true)` sets
  `backfill_done = 1`.
- Returns `{ added, oldestDate, done }` for the client to drive progress / decide
  whether to request another chunk.

Both paths reuse `upsertWorkouts` (idempotent) and `countWorkouts` for `total`.

## Endpoints — `src/routes/api/`

- **`/api/sync`** (existing) — first call with no state runs the **windowed**
  sync; later calls run incremental. `?full=1` forces complete backfill.
  Demo still 400s (`Sync is unavailable in demo mode`).
- **`/api/sync/backfill`** (new, POST) — runs one `backfillWorkouts` chunk;
  returns `{ added, oldestDate, done }`. Demo returns `{ added: 0, done: true }`
  (no-op), mirroring `/api/live/poll`'s demo short-circuit.
- Both: `isHttpError` passthrough, `no such table` → 503, `cache-control:
  private, no-store` — matching the existing handlers.

## Background driver + on-demand — UI

- After the windowed sync completes (and on any later visit where
  `backfill_done` is 0), a small client loop POSTs `/api/sync/backfill`
  repeatedly until `done`, **paced** between calls and backing off on 429 —
  modeled on the existing live-mode poll loop in `dashboard/+page.svelte`. It
  resumes naturally next session because the cursor is in D1 (Req 2.2).
- **Note:** the docs state the API is *not currently* rate limited ("This may
  change in the future. Abuse of the API will result in either rate limits or
  removal of access."), so the chunking + pacing + 429 backoff are **good
  citizenship / future-proofing**, not a workaround for a present hard limit —
  which is exactly the "avoid hammering it" intent.
- **On demand**: a "load full history" affordance (settings, beside the existing
  Incremental / Full buttons) drives the same loop to completion; the existing
  **Full sync** button (`/api/sync?full=1`) remains the one-shot escape hatch
  (Req 6.2).

### Sync-status affordance

`syncStatus()` returns the extended `SyncState` plus `HISTORY_WINDOW_MONTHS`. A
small status line (dashboard summary + settings sync panel, reusing
`settings.lastSync` / dashboard `recentNote` styling) shows:

- **window** (`backfill_done = 0`, no backfill running): "Showing the last
  {months} months — loading older history…"
- **backfilling**: progress from `total` / `oldest_date` (e.g. "{total} workouts
  · history back to {date}").
- **complete** (`backfill_done = 1`): "Full history synced".
- **demo**: existing `settings.syncDemo` badge (Req 5.2).

All strings via `i18n.t()`; the months value comes from the constant, not a
literal (Req 4.4).

## Demo mode

`event.locals.demo` short-circuits before any planning: `/api/sync` and
`/api/sync/backfill` no-op, no watermark is written, `mockData.ts` (already a
bounded recent set) serves the dashboard. The status affordance shows the demo
badge. Pure helpers (`historyWindowStart`, `mergeWatermark`, `planSync`) need no
bindings, so unit tests and the e2e smoke run credential-free (Req 5.1, 5.3).

## i18n

New keys in the `sync` (and/or `dashboard`/`settings`) blocks across all six
locales: window label (with `{months}` / `{date}` params), "loading older
history", backfilling progress, "full history synced", and the "load full
history" action. Run `npm run validate:locales`. Dates formatted via existing
`fmtDate` / `fmtDateFromEpochMillis`.

## Testing

- **Unit (`historyWindow.test.ts`)**: `historyWindowStart` with a frozen `now`
  (month/year rollover, end-of-month, leap Feb); `mergeWatermark` (advance,
  no-regress on stale chunk, latch `done` on empty); `planSync` for each state
  (no-state→window, state→incremental, not-done→backfill, done→done, full→reset).
- **Unit (`data`/`db`)**: windowed first sync uses the window `from`; backfill
  caps at `BACKFILL_PAGES_PER_RUN`; upsert idempotency (re-run adds 0).
- **E2E (`tests/e2e/history-windowing.spec.ts`)**: demo mode — the sync-status
  affordance renders (demo badge), and the dashboard paints without waiting on a
  real sync.

## Out of scope / references

- **No detail-cache or schema rework** beyond the two `sync_state` columns;
  `workout_detail` / `DETAIL_PAYLOAD_VERSION` are referenced, not changed.
- **Cache lifecycle / token privacy** — the watermark is purged with the rest of
  the session-scoped cache; see `concept2-token-privacy` (referenced).
- **Server-side scheduled backfill** (Cron/Queues without an open tab) — a
  possible later evolution; v1 drives backfill from the client loop + on-demand
  trigger, which is enough to satisfy "background / on demand".
- **`updated_after` for incremental** — the API also exposes `updated_after`
  ("results created **or updated** on or after this", GMT), which is purpose-built
  for forward catch-up and would catch edited-but-not-newer workouts better than
  today's 1-day `overlapDate` window. Out of scope here (incremental sync is
  unchanged), but noted as a follow-up for the incremental path.
