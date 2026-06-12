# Implementation Plan: Live/Near-Live Mode

- [x] 1. Core live mode utilities and preferences
  - Create `src/lib/liveMode.ts` with prefs types, persistence, backoff, and interval helpers
  - Add unit tests in `src/lib/liveMode.test.ts`
  - _Requirements: 2.2, 2.4, 8.1, 8.6, 9.3_

- [x] 2. Extend sync engine to return new workouts
  - Add `workouts` array to `SyncResult` in `src/lib/server/data.ts`
  - Collect upserted summaries during incremental sync
  - _Requirements: 1.2, 1.3, 7.3_

- [x] 3. Poll API endpoint
  - Add `POST /api/live/poll` wrapping incremental sync
  - Return structured poll result for the client
  - _Requirements: 1.1, 1.3, 7.6_

- [x] 4. Demo mock workout generator
  - Add `generateMockWorkout()` to `src/lib/mockData.ts`
  - Produce realistic summaries with unique IDs
  - _Requirements: 4.1, 4.2_

- [x] 5. LiveMode reactive polling service
  - Create `src/lib/liveMode.svelte.ts` with timer, visibility, backoff, and abort logic
  - Wire demo mock poller and auth poll API behind a common interface
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 4.3, 7.1, 7.2, 7.4, 8.1, 8.2, 8.5, 9.1, 9.2, 9.6_

- [x] 6. ErgData webhook stub
  - Add `POST /api/webhooks/ergdata` with signature validation scaffold
  - Document future integration path in handler comments
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 7. Internationalization
  - Add `liveMode.*` keys to en/zh dictionaries in `src/lib/i18n.ts`
  - _Requirements: 3.6, 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 8. Dashboard live mode panel
  - Create `src/components/LiveModePanel.svelte` with toggle, interval selector, status display
  - Show polling spinner, last/next poll times, failure warning icon
  - _Requirements: 2.1, 2.3, 2.5, 2.6, 2.7, 9.4_

- [x] 9. Dashboard integration — notifications and optimistic updates
  - Integrate LiveMode into dashboard: merge new workouts, animate entries, PB badges
  - Toast notifications with View action; debounce multi-workout batches
  - Optional sound effect preference
  - Reset poll timer on manual sync
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.2, 9.5_

- [x] 10. Verification
  - Run `pnpm run check` and `pnpm run test`
  - Update PR test plan checklist
  - _Requirements: all_
