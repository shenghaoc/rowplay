# Leaderboards / Multiplayer Race — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

- [x] **1. Pure ranking core** — `src/lib/leaderboard.ts`
  - Types: `LeaderboardEntry`, `RankedEntry`, `Board`.
  - `STANDARD_DISTANCES`, `boardKey`, `matchStandardDistance` (snap + tolerance).
  - `rankEntries` (time-asc, ties share rank, gap-to-leader),
    `buildBoards` (group + rank, stable order).
  - _Requirements: 2.1, 2.2, 2.3, 4.2, 5.1_

- [x] **2. Unit tests for the core** — `src/lib/leaderboard.test.ts`
  - Snap/reject, rank order, tie handling, gap maths, board grouping/order.
  - _Requirements: 5.1_

- [x] **3. Deterministic demo seed** — `src/lib/mockLeaderboard.ts`
  - Demo athlete's standard-distance results (from `mockWorkouts`, `isYou`).
  - Fixed synthetic-rival roster filling every standard board; no PII; no
    KV/D1 writes.
  - _Requirements: 1.4, 4.4_

- [x] **4. D1 migration + DB helpers**
  - `migrations/0005_leaderboard.sql` (`leaderboard_entry`, board index, PK
    one-per-athlete).
  - `db.ts`: `upsertLeaderboardEntry` (keep MIN time), `getLeaderboardEntries`.
  - _Requirements: 4.1, 4.3, 5.2_

- [x] **5. Server layer** — `src/lib/server/leaderboard.ts`
  - `loadBoards` (demo seed vs D1), `publishWorkout` (share + upsert, distance
    reject, auth guard).
  - _Requirements: 1.1, 4.1, 4.2, 4.3, 4.4, 4.5, 5.2_

- [x] **6. Publish API** — `src/routes/api/leaderboard/publish/+server.ts`
  - POST `{ workoutId }`; 401 / 422 / 400 handling; no-store.
  - _Requirements: 4.1, 4.2, 4.5_

- [x] **7. Leaderboard page** — `src/routes/leaderboard/`
  - `+page.server.ts` (`loadBoards`), `+page.svelte` (sport + distance
    selector reflected in URL, ranked table, you-badge, empty state,
    Open + Race actions).
  - _Requirements: 1.1, 1.2, 1.3, 2.3, 2.4, 2.5, 3.1, 3.2_

- [x] **8. Navigation + i18n**
  - `/leaderboard` tab in `+layout.svelte`.
  - `leaderboard` + `nav.leaderboard` keys in BOTH `en` and `zh`.
  - _Requirements: 1.5, 2.5, 5.3_

- [x] **9. Replay race deep-link** — `replay/[id]/+page.svelte`
  - `onMount` reads `?ghostPace`/`?ghostName`, pre-arms the existing
    constant-pace ghost; invalid → solo, no throw.
  - _Requirements: 3.2, 3.3, 3.4_

- [x] **10. E2E smoke + full gate** — `tests/e2e/leaderboard.spec.ts`
  - Demo board renders ranked, distance switch updates board + URL, entry
    action resolves into a replay. Then `check` + `build` + `test` + `test:e2e`.
  - Update `HANDOFF.md` (remove the parking-lot item).
  - _Requirements: 1.1, 1.2, 3.1, 5.4_
