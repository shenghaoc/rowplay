# Windowed History Sync with Lazy Backfill — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

- [x] **1. Window constant + pure helpers** — `src/lib/server/historyWindow.ts`
  - `HISTORY_WINDOW_MONTHS`, `BACKFILL_PAGES_PER_RUN`; `historyWindowStart(now)`
    (today − months, UTC), `planSync(state, now, mode)`, `mergeWatermark(...)`
    (advance outward only, latch `done`). All pure, DOM-free.
  - _Requirements: 1.2, 2.5, 6.1, 7.1_

- [x] **2. Unit tests for the pure core** — `historyWindow.test.ts`
  - `historyWindowStart` (month/year rollover, end-of-month, leap Feb, frozen
    `now`); `mergeWatermark` (advance, no-regress on stale chunk, latch on
    empty); `planSync` (no-state→window, state→incremental, not-done→backfill,
    done→done, full→reset).
  - _Requirements: 1.2, 2.5, 5.3, 7.1_

- [x] **3. D1 watermark** — `migrations/0006_history_window.sql` + `db.ts`
  - `ALTER TABLE sync_state ADD oldest_date TEXT`, `ADD backfill_done INTEGER
    NOT NULL DEFAULT 0`. Extend `SyncState`, `getSyncState`, and
    `setSyncState`/`setBackfillState`. Verify `purgePrivateCache` /
    `deleteUserData` still clear it (no change expected).
  - _Requirements: 1.4, 2.2, 7.2_

- [x] **4. `to` bound on the client** — `src/lib/server/concept2.ts`
  - `listWorkoutsPage(page, from?, to?, number=250)` adds the optional `to`
    query param (mirror of `from`); same return shape.
  - _Requirements: 2.1, 3.1_

- [x] **5. Windowed first sync** — `src/lib/server/data.ts`
  - `syncWorkouts` becomes plan-driven via `planSync`: no state → window
    (`from = historyWindowStart`), state → incremental, `full=1` → reset + full.
    Persist watermark via `mergeWatermark`/`setBackfillState`.
  - _Requirements: 1.1, 1.3, 1.4, 6.3_

- [x] **6. Backfill run + endpoint** — `data.ts` + `src/routes/api/sync/backfill/+server.ts`
  - `backfillWorkouts(event)`: `to = overlapDate(oldest_date)`, page
    `to`-bounded ≤ `BACKFILL_PAGES_PER_RUN` (250/page), upsert summaries, advance
    watermark, latch `done` on empty. New POST endpoint returns
    `{ added, oldestDate, done }`; demo no-ops; 429 backoff; 503 on missing table.
  - _Requirements: 2.1, 2.3, 2.4, 2.6, 3.2, 3.3, 5.1_

- [x] **7. Background driver + on-demand trigger** — dashboard/settings
  - Client loop POSTs `/api/sync/backfill` until `done`, paced + 429 backoff
    (modeled on the live-mode poll loop); resumes across sessions from D1.
    "Load full history" affordance in settings drives it to completion; existing
    `?full=1` button kept as escape hatch.
  - _Requirements: 2.2, 3.4, 6.2_

- [x] **8. Sync-status affordance** — dashboard + settings + `syncStatus`
  - `syncStatus()` returns extended `SyncState` + `HISTORY_WINDOW_MONTHS`. Status
    line shows window / backfilling (progress) / complete / demo states; months
    value from the constant, not a literal.
  - _Requirements: 4.1, 4.2, 4.4, 5.2_

- [x] **9. i18n** — all six locales
  - Window label (`{months}`/`{date}`), "loading older history", backfilling
    progress, "full history synced", "load full history" action across `en`,
    `zh`, `de`, `es`, `fr`, `ja`. `pnpm run validate:locales`.
  - _Requirements: 4.3, 5.2_

- [x] **10. E2E + full gate** — `tests/e2e/history-windowing.spec.ts`
  - Demo: sync-status affordance renders (demo badge); dashboard paints without
    a real sync. Then `check` + `build` + `test` + `validate:locales` +
    `test:e2e`.
  - _Requirements: 5.1, 7.3_
