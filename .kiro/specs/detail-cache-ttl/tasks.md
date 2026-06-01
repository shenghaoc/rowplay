# Implementation tasks: Detail-cache TTL

Spec: `.kiro/specs/detail-cache-ttl/`  
Requirements: Req 1–5 · Design: `detailCache.ts` + `db.ts` + optional env

## Tasks

- [ ] 1. Add cache policy module (`detailCache.ts`)
  - [ ] 1.1 Export `DETAIL_CACHE_TTL_MS` default (7 days)
  - [ ] 1.2 Implement `detailCacheTtlMs(env?)` with optional `DETAIL_CACHE_TTL_DAYS` override
  - [ ] 1.3 Implement `isDetailCacheFresh(cachedAt, nowMs, ttlMs?)`
  - _Requirements: 1.4, 4.1_

- [ ] 2. Unit tests for policy (`detailCache.test.ts`)
  - [ ] 2.1 Boundaries: fresh, exactly at TTL, one ms stale
  - [ ] 2.2 Env override parsing (valid, invalid, absent)
  - _Requirements: 4.2_

- [ ] 3. Apply TTL in `getCachedDetail` (`db.ts`)
  - [ ] 3.1 Select `cached_at` with payload
  - [ ] 3.2 Return null when version matches but TTL expired
  - [ ] 3.3 Pass optional `env` for TTL override from callers that have `RequestEvent` / platform env
  - _Requirements: 1.1–1.3, 2.1–2.2_

- [ ] 4. Wire env type (`app.d.ts`)
  - [ ] 4.1 Add optional `DETAIL_CACHE_TTL_DAYS?: string` to `Platform.env`
  - _Requirements: 1.4_

- [ ] 5. Plumb env into cache reads
  - [ ] 5.1 `loadWorkoutDetail` passes `event.platform?.env` into `getCachedDetail`
  - [ ] 5.2 `share.ts` passes env where it calls `getCachedDetail` (share confirm path only)
  - _Requirements: 1.2_

- [ ] 6. Verify share path unchanged (`getCachedDetailByShareToken`)
  - [ ] 6.1 Confirm no TTL check added (document in code comment if helpful)
  - _Requirements: 3.1–3.2_

- [ ] 7. Housekeeping
  - [ ] 7.1 Remove parking-lot line from `HANDOFF.md`
  - [ ] 7.2 Run `npm run check` and `npm run test`
  - _Requirements: 5.1_
