# Implementation tasks: Detail-cache TTL

Spec: `.kiro/specs/detail-cache-ttl/`  
Requirements: Req 1–5 · Design: `detailCache.ts` + `db.ts` + optional env

## Tasks

- [x] 1. Add cache policy module (`detailCache.ts`)
  - [x] 1.1 Export `DETAIL_CACHE_TTL_MS` default (7 days)
  - [x] 1.2 Implement `detailCacheTtlMs(env?)` with optional `DETAIL_CACHE_TTL_DAYS` override
  - [x] 1.3 Implement `isDetailCacheFresh(cachedAt, nowMs, ttlMs?)`
  - _Requirements: 1.4, 4.1_

- [x] 2. Unit tests for policy (`detailCache.test.ts`)
  - [x] 2.1 Boundaries: fresh, exactly at TTL, one ms stale
  - [x] 2.2 Env override parsing (valid, invalid, absent)
  - _Requirements: 4.2_

- [x] 3. Apply TTL in `getCachedDetail` (`db.ts`)
  - [x] 3.1 Select `cached_at` with payload
  - [x] 3.2 Return null when version matches but TTL expired
  - [x] 3.3 Pass optional `env` for TTL override from callers that have `RequestEvent` / platform env
  - _Requirements: 1.1–1.3, 2.1–2.2_

- [x] 4. Wire env type (`app.d.ts`)
  - [x] 4.1 Add optional `DETAIL_CACHE_TTL_DAYS?: string` to `Platform.env`
  - _Requirements: 1.4_

- [x] 5. Plumb env into cache reads
  - [x] 5.1 `loadWorkoutDetail` passes `event.platform?.env` into `getCachedDetail`
  - [x] 5.2 `share.ts` passes env where it calls `getCachedDetail` (share confirm path only)
  - _Requirements: 1.2_

- [x] 6. Verify share path unchanged (`getCachedDetailByShareToken`)
  - [x] 6.1 Confirm no TTL check added (document in code comment if helpful)
  - _Requirements: 3.1–3.2_

- [x] 7. Housekeeping
  - [x] 7.1 Remove parking-lot line from `HANDOFF.md`
  - [x] 7.2 Run `pnpm run check` and `pnpm run test`
  - _Requirements: 5.1_
