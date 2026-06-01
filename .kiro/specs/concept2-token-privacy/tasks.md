# Concept2 Token Privacy — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.
**Nothing here is started until the maintainer signs off on the spec.**

- [ ] **1. Token-crypto core** — `src/lib/server/tokenCrypto.ts`
  - `sealToken` / `openToken` (AES-GCM, key derived from `SESSION_SECRET`,
    base64url `iv||ct`); `openToken` returns `null` on any failure, never throws,
    never logs secret material.
  - _Requirements: 1.2, 5.1_

- [ ] **2. Unit tests for the core** — `src/lib/server/tokenCrypto.test.ts`
  - Round-trip; tampered blob → null; wrong key → null; garbage → null.
  - _Requirements: 5.1, 5.2_

- [ ] **3. Session/cookie plumbing** — `session.ts`, `hooks.server.ts`, `app.d.ts`
  - Add `TOKEN_COOKIE = 'rp_tok'`; make `SessionData.tokens.accessToken` optional.
  - `hooks.server.ts`: set `event.locals.personal` from `session.personal`.
  - `app.d.ts`: add `locals.personal: boolean`.
  - _Requirements: 1.4_

- [ ] **4. Connect seals into the cookie** — `auth/token/+page.server.ts`
  - After `fetchMe`: require `SESSION_SECRET` (else i18n'd 500), `sealToken`,
    set `rp_tok` (httpOnly), write KV session with an **empty** access token.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] **5. Open the cookie on demand** — `data.ts > client()`
  - Personal session: read `rp_tok`, `openToken`; `null` → return `null`
    (callers → 401 → reconnect). Inject opened token into the in-memory session;
    `Concept2Client` unchanged.
  - _Requirements: 1.1, 1.6_

- [ ] **6. Logout / disconnect clears the cookie** — `auth/logout`, `clearUserCachedData`
  - Delete `rp_tok` alongside `rp_session`; `destroySession`.
  - _Requirements: 1.5, 1.6, 4.4_

- [ ] **7. Live reads, no D1 mirror** — `src/lib/server/data.ts`
  - `liveNoMirror(event)` helper + per-request memoized full live fetch on
    `locals`. Branch `loadWorkouts`, `loadWorkoutList`, `loadDashboardAggregates`,
    `loadWorkoutDetail` so personal sessions read live and write nothing to D1.
  - Compute dashboard aggregates in JS via `analytics.ts` for personal sessions.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] **8. Disable the eager mirror for BYOT** — `/api/sync`, dashboard page
  - `/api/sync`: reject for `locals.personal` with a clean status + i18n message.
  - Dashboard `load`: skip `syncStatus()` and plumb `personal` to the page;
    `+page.svelte`: hide the sync UI for personal sessions.
  - _Requirements: 2.5_

- [ ] **9. Data-layer unit tests** — `src/lib/server/*.test.ts`
  - Mocked client + `locals.personal`: live reads happen, D1 upsert/cache spies
    are never called; detail bypasses the D1 cache. Update/replace any test that
    asserted a token in KV.
  - _Requirements: 2.1, 2.3, 5.2_

- [ ] **10. Withdraw (reversible opt-out)** — db, server, API
  - `db.ts`: `deleteLeaderboardEntry`, `deleteAllLeaderboardEntries`; confirm
    `deleteUserData` removes the user's `leaderboard_entry` rows (extend if not).
  - `server/leaderboard.ts`: `withdrawWorkout` (demo no-op, 401 unauth).
  - `api/leaderboard/publish/+server.ts`: add `DELETE` handler.
  - `clearUserCachedData`: also clear leaderboard entries + their share tokens.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] **11. UI + privacy copy** — leaderboard, replay publish control, settings
  - Withdraw action on `isYou` rows / after publish; publish + withdraw copy
    clarifying public-vs-Concept2 (Req 3.3, 4.5); settings privacy statement.
  - _Requirements: 3.1, 3.3, 4.1, 4.5_

- [ ] **12. i18n** — all locale files
  - New keys (server-misconfig error, sync-disabled, publish/withdraw copy,
    privacy statement) in `en, zh, de, es, fr, ja`; `npm run validate:locales`.
  - _Requirements: 5.3_

- [ ] **13. Gate + manual verification**
  - `npm run check` (0 errors) + `npm run build` + `npm run test` + `npm run test:e2e`.
  - On `npm run preview`: connect → `rp_tok` is HttpOnly + KV has no token →
    dashboard from live reads → publish appears → withdraw removes → logout clears
    both cookies. Record the run in the PR notes.
  - Add this spec to the AGENTS.md "Completed" list.
  - _Requirements: 2.6, 5.2, 5.3, 5.4_
