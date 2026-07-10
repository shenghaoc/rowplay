# Stateless Cloudflare Storage Removal — Requirements

## Context

rowplay previously used Cloudflare KV for sessions and D1 for workout caches,
details, and product features built on persistence. The source of truth is the
Concept2 Logbook API, so this refactor removes both Worker storage products and
keeps only user flows that can work correctly with encrypted cookies or live
API reads.

## Requirements

### 1. No Worker-managed persistent data

1. `wrangler.jsonc` and Worker environment types SHALL not declare KV or D1
   bindings.
2. The application SHALL not import a D1/KV data layer or ship D1 migrations.
3. Authenticated workout summaries and details SHALL be read from the Concept2
   API; demo mode SHALL continue to use deterministic mock data.

### 2. Secure cookie sessions

1. Session identity, optional OAuth tokens, and the home timezone SHALL be
   AES-GCM sealed in the httpOnly `rp_session` cookie using `SESSION_SECRET`.
2. A personal Concept2 token SHALL remain in its own AES-GCM sealed httpOnly
   `rp_tok` cookie and SHALL never be written to a server-side store.
3. Logout SHALL clear both auth cookies.
4. A refreshed OAuth token SHALL be written back to `rp_session` so later
   requests do not refresh it again unnecessarily.

### 3. Correct and efficient live reads

1. Dashboard aggregates, filters, personal bests, and exports SHALL use the
   complete paginated Concept2 result history.
2. Concurrent loaders in one request SHALL share the same live history read.
3. Near-live polling SHALL request only the newest result page; it SHALL not
   page through the full history at each poll interval.

### 4. Retained preferences and user controls

1. Annual goals SHALL be stored in an httpOnly cookie and scoped to the signed
   in athlete so they do not follow a logout/login transition.
2. Invalid goal years, targets, and home timezones SHALL be rejected.
3. `/settings` SHALL retain CSV/JSON/TCX export and the authenticated home
   timezone control.

### 5. Removed persistence-dependent features

1. Leaderboards, public shares, coaching annotations, server-persisted heart
   rate imports, manual workout tags, sync/backfill, comparison, and
   server-side account-data deletion SHALL not be presented as available.
2. Removed API endpoints SHALL return a clear retired response and removed
   pages SHALL redirect to an available route where appropriate.
3. User documentation and every locale guide SHALL describe the live,
   stateless data model accurately.

## Verification

- Unit coverage for paged vs recent-only Concept2 reads, cookie goals, and
  retained settings controls.
- `vp run check`, locale validation, and the Chromium smoke suite.
- PR CI must pass before merge.
