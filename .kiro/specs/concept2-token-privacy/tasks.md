# Concept2 Token Privacy — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

Status: implemented on `claude/concept2-token-privacy-HvbAl`. The automated
gate was green when this spec landed (`check`, `test`, `build`,
`validate:locales`). Historical verification notes below are landing snapshots,
not the current whole-app suite size. The `npm run preview` manual walkthrough
in task 12 still needs the maintainer (it requires a real Concept2 token, which
the agent does not have).

- [x] **1. Token-crypto core** — `src/lib/server/tokenCrypto.ts`
  - `sealToken` / `openToken` (AES-GCM, key derived from `SESSION_SECRET`,
    base64url `iv||ct`); `openToken` returns `null` on any failure, never throws,
    never logs secret material.
  - _Requirements: 1.2, 5.1_

- [x] **2. Unit tests for the core** — `src/lib/server/tokenCrypto.test.ts`
  - Round-trip; tampered blob → null; wrong key → null; garbage → null.
  - _Requirements: 5.1, 5.2_

- [x] **3. Session/cookie plumbing** — `session.ts`, `hooks.server.ts`, `app.d.ts`
  - Add `TOKEN_COOKIE = 'rp_tok'`; make `SessionData.tokens.accessToken` optional.
  - `hooks.server.ts`: set `event.locals.personal` from `session.personal`.
  - `app.d.ts`: add `locals.personal: boolean`.
  - _Requirements: 1.4_

- [x] **4. Connect seals into the cookie** — `auth/token/+page.server.ts`
  - After `fetchMe`: require `SESSION_SECRET` (else i18n'd 500), `sealToken`,
    set `rp_tok` (httpOnly), write KV session with an **empty** access token.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] **5. Open the cookie on demand** — `data.ts > client()`
  - Personal session: read `rp_tok`, `openToken`; `null` → return `null`
    (callers → 401 → reconnect). Inject opened token into the in-memory session;
    `Concept2Client` unchanged.
  - _Requirements: 1.1, 1.6_

- [x] **6. Logout / disconnect clears the cookie + purges the cache** — `auth/logout`, `clearUserCachedData`
  - Delete `rp_tok` alongside `rp_session`; `destroySession`.
  - For a **personal** session, also purge the D1 cache via `deleteUserData`
    (session-scoped cache); non-personal/OAuth logout does not purge.
  - _Requirements: 1.5, 2.3, 4.4_

- [x] **7. Keep the D1 cache (no data-loader churn)** — `src/lib/server/data.ts`
  - Confirm `loadWorkouts`/`loadWorkoutList`/`loadDashboardAggregates`/
    `loadWorkoutDetail`/`syncWorkouts` stay as-is for BYOT (D1 cache, lazy-filled,
    TTL-refreshed). No `liveNoMirror` branch; sync stays enabled for BYOT.
  - _Requirements: 2.1, 2.2_

- [x] **8. Logout/disconnect unit tests** — `src/lib/server/*.test.ts`
  - Personal logout purges the D1 cache (`deleteUserData` spy called) and clears
    both cookies; non-personal logout does not purge. Update/replace any test that
    asserted a token in KV.
  - _Requirements: 2.3, 5.2_

- [x] **9. Withdraw (reversible opt-out)** — db, server, API
  - `db.ts`: `deleteLeaderboardEntry`, `deleteAllLeaderboardEntries`; confirm
    `deleteUserData` removes the user's `leaderboard_entry` rows (extend if not).
  - `server/leaderboard.ts`: `withdrawWorkout` (demo no-op, 401 unauth).
  - `api/leaderboard/publish/+server.ts`: add `DELETE` handler.
  - `clearUserCachedData`: also clear leaderboard entries + their share tokens.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] **10. UI + privacy copy** — leaderboard, replay publish control, settings
  - Withdraw action on `isYou` rows / after publish; publish + withdraw copy
    clarifying public-vs-Concept2 (Req 3.3, 4.5); settings privacy statement.
  - _Requirements: 3.1, 3.3, 4.1, 4.5_

- [x] **11. i18n** — all locale files
  - New keys (server-misconfig error, publish/withdraw copy, privacy statement)
    in `en, zh, de, es, fr, ja`; `npm run validate:locales`.
  - _Requirements: 5.3_

- [x] **12. Historical gate + verification snapshot**
  - ✅ `npm run check` (0 errors), `npm run test` (green at the spec landing
    snapshot), `npm run build` (succeeds), `npm run validate:locales` (green at
    the locale snapshot).
  - ✅ Real Workers runtime (`wrangler dev`) demo smoke via curl: `/`, `/dashboard`,
    `/leaderboard`, `/replay/1001`, `/auth/token`, `/settings` all 200; publish →
    rank, **withdraw `DELETE` → `{ok:true}`**, bad id → 400, account-delete → demo.
  - ⚠️ `npm run test:e2e` could not run in this sandbox — the WebKit browser binary
    can't be downloaded here (only chromium is cached); every spec fails at
    `browserType.launch`, not on app behavior. Demo flows are untouched by this
    change, so the suite is expected to pass on a machine with WebKit installed.
  - ⏳ Maintainer to run on `npm run preview` with a real token + `SESSION_SECRET`
    set in `.dev.vars`: connect → `rp_tok` is HttpOnly + KV has no token →
    dashboard from the D1 cache → publish appears → withdraw removes → logout
    clears both cookies **and** purges the D1 cache.
  - ✅ Added this spec to the AGENTS.md "Completed" list.
  - _Requirements: 2.6, 5.2, 5.3, 5.4_
