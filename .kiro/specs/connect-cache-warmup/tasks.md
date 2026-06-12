# Implementation tasks: Snappy BYOT connect & dashboard loads

Spec: `.kiro/specs/connect-cache-warmup/`
Requirements: Req 1–5 · Design: `auth/token` + `server/data.ts` + `app.d.ts`

Status: implemented on `claude/clever-rubin-wJ2kc` (PR #75). The automated gate
was green when this spec landed (`check`, `test`, `build`, `validate:locales`).
Historical verification notes in this file are landing snapshots, not the
current whole-app suite size.
Spec written retroactively after the code landed. The `pnpm run preview` manual
walkthrough (Workers runtime + real token) is left to the maintainer.

## Tasks

- [x] **1. Connect submit feedback** — `auth/token/+page.svelte`, locales
  - [x] 1.1 `submitting` rune via inline `use:enhance`; disable + `aria-busy` + spinner
  - [x] 1.2 Re-enable on `fail`, persist through redirect on success
  - [x] 1.3 Add `token.connecting` to `en, zh, de, es, fr, ja`
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] **2. Warm the cache on connect** — `data.ts`, `auth/token/+page.server.ts`, `app.d.ts`
  - [x] 2.1 Extract `runSync(db, userId, client, full)` from `syncWorkouts`
  - [x] 2.2 `scheduleConnectSync(event, sid, user, token)`: build client from the token,
    `ctx.waitUntil(runSync(…, /* full */ true))`; no-op without `waitUntil`/D1
  - [x] 2.3 Call it from the connect action after cookies, before redirect
  - [x] 2.4 `app.d.ts`: add `Platform.context: ExecutionContext`
  - [x] 2.5 Confirm KV still stores an empty access token (no token leak)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] **3. Honest reads — gate D1 on completed sync** — `data.ts`
  - [x] 3.1 Add per-request `syncStateFor(event)` memo (WeakMap)
  - [x] 3.2 Gate `loadWorkouts` D1 read; cold path serves a live page, **not persisted**
  - [x] 3.3 Gate `loadWorkoutList` D1 branch
  - [x] 3.4 `loadDashboardAggregates` returns `null` until sync completes
  - [x] 3.5 Route `syncStatus` through `syncStateFor` (dedup)
  - [x] 3.6 Remove the interim lazy-fill upsert (Codex P1, PR #75)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] **4. De-dup the cold load** — `data.ts`
  - [x] 4.1 Memoise `loadWorkouts` per request (`workoutsByEvent` WeakMap → `loadWorkoutsFresh`)
  - [x] 4.2 Confirm shared array is safe (`filterAndSortWorkouts` is pure)
  - _Requirements: 4.1, 4.2, 4.3_

- [x] **5. Gate + docs**
  - [x] 5.1 `pnpm run check` (0 errors) · `pnpm run test` green at the spec landing snapshot · `pnpm run build` · `validate:locales`
  - [x] 5.2 Resolve the PR #75 P1 review thread (reply + mark resolved)
  - [x] 5.3 Add this spec to the `AGENTS.md` completed list
  - [ ] 5.4 Maintainer: `pnpm run preview` walkthrough with a real token + `SESSION_SECRET`
  - _Requirements: 5.1, 5.2_

## Follow-ups (not in this spec)

- Single-page fast-path: when `totalPages === 1`, persist **and** set sync state in the
  cold path so small logbooks are instant without waiting for the background backfill.
- A testable harness for the `data.ts` loaders (sync-state gate, memo, `waitUntil`).
