# Requirements: State re-seed and dead-code cleanup

## Overview

Fix small code-quality regressions found during the PR #161 audit: unreachable
sync-endpoint branching, Svelte state that captured page data once, timezone
clearing behavior, and a local lint suppression in workout moment analysis.

## Requirements

### Requirement 1: Sync endpoint

- `POST /api/sync` MUST continue to reject demo-mode requests before starting a
  sync.
- After a successful authenticated sync, the endpoint MUST return the refreshed
  sync-status payload when available.
- The endpoint MUST NOT keep unreachable demo-mode branches after the demo guard.

### Requirement 2: Replay publish state

- The replay page MUST show the correct leaderboard published state after
  client-side navigation between workouts.
- Publish and withdraw actions MUST still update the UI immediately after their
  requests complete.
- The implementation MUST avoid `state_referenced_locally` warnings for page
  data-driven state.

### Requirement 3: Settings timezone state

- The settings page MUST render the server-provided home timezone for
  authenticated users and the locally persisted demo timezone for demo mode.
- Clearing the home timezone MUST update the select back to the UTC/default
  option after save and page-data invalidation.
- Background invalidations during a timezone save MUST NOT clobber the in-flight
  selection.
- The implementation MUST avoid non-reactive dirty flags inside `$effect`.

### Requirement 4: Code quality

- Svelte diagnostics MUST report zero `state_referenced_locally` warnings in the
  changed pages.
- Pure helper cleanup MUST remove avoidable lint suppressions when the existing
  repo pattern has an equally clear alternative.
- Existing user-visible copy and locale keys MUST remain unchanged.
