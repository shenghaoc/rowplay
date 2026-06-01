# Detail-cache TTL and re-hydration

## Introduction

PR #18 added `payload_version` on `workout_detail` so a bumped `DETAIL_PAYLOAD_VERSION` invalidates stale JSON after schema changes. Cached rows can still be arbitrarily old while the version matches. This spec adds a time-based TTL and a clear re-hydration path when the cache is stale.

## Glossary

- **Detail cache** — D1 `workout_detail` row holding fully hydrated `WorkoutDetail` JSON.
- **Cache hit** — Row exists, `payload_version` matches, and `cached_at` is within TTL.
- **Re-hydration** — Fetch fresh detail from the Concept2 API and upsert D1.

## Requirements

### Requirement 1: Time-based cache expiry

**User Story:** As a rowplay operator, I want cached workout detail to expire after a bounded age so users eventually see data refreshed from Concept2 without manual cache clears.

#### Acceptance Criteria

1. WHEN an authenticated user loads workout detail AND a D1 row exists with matching `payload_version` AND `cached_at` is older than the configured TTL, THEN the system SHALL treat the row as a cache miss.
2. WHEN a cache miss occurs for authenticated detail load, THEN the system SHALL fetch from Concept2 and upsert D1 with a new `cached_at`.
3. WHEN `cached_at` is within TTL and `payload_version` matches, THEN the system SHALL return the cached payload without calling Concept2.
4. The default TTL SHALL be seven days unless overridden by configuration.

### Requirement 2: Preserve schema-version invalidation

**User Story:** As a developer changing `WorkoutDetail`, I want version bumps to keep invalidating cache independently of TTL.

#### Acceptance Criteria

1. WHEN `payload_version` on a row does not equal `DETAIL_PAYLOAD_VERSION`, THEN the system SHALL treat the row as a cache miss (existing PR #18 behaviour).
2. WHEN both version mismatch and TTL expiry apply, THEN re-hydration SHALL occur once on the next authenticated load.

### Requirement 3: Public share reads

**User Story:** As someone opening a shared replay link without logging in, I want the link to keep working even when the owner's cache entry is TTL-stale.

#### Acceptance Criteria

1. WHEN detail is resolved by `share_token` (unauthenticated), THEN the system SHALL NOT apply TTL expiry (no OAuth to re-hydrate).
2. WHEN the owner opens replay after TTL expiry, THEN re-hydration SHALL refresh the shared payload in D1 for subsequent token lookups.
3. WHEN the cached row's `payload_version` does not equal `DETAIL_PAYLOAD_VERSION`, THEN share-token reads SHALL still serve the cached payload (NOT treat it as a miss): an anonymous reader cannot re-hydrate, so a version filter would 404 the link after a deliberate schema bump until the owner re-opens the workout. Consuming pages SHALL tolerate older payload shapes; the owner re-opening refreshes the shared payload.

### Requirement 4: Testable policy helpers

**User Story:** As a maintainer, I want pure functions for freshness checks so policy is unit-tested without D1.

#### Acceptance Criteria

1. The system SHALL expose a pure function to decide whether `cached_at` is fresh given `now` and TTL.
2. Unit tests SHALL cover boundary cases (exactly at TTL, one ms past, version-only path unchanged).

### Requirement 5: Documentation

**User Story:** As the next agent picking up the backlog, I want HANDOFF to reflect completed work.

#### Acceptance Criteria

1. WHEN implementation is complete, THEN the parking-lot item "Detail-cache TTL / re-hydration" SHALL be removed from `HANDOFF.md`.

## Non-functional requirements

- Cache remains best-effort: D1 errors continue to be swallowed; misses fall through to Concept2 or demo mocks.
- No new D1 migration required (`cached_at` already exists).
- Demo mode behaviour unchanged (no D1 cache).
