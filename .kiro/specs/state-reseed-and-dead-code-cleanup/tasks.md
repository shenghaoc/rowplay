# Implementation tasks: State re-seed and dead-code cleanup

Spec: `.kiro/specs/state-reseed-and-dead-code-cleanup/`

## Tasks

- [x] 1. Remove unreachable sync endpoint branch
  - Simplify post-sync `syncStatus` loading after the demo-mode guard
  - Preserve the existing nullable fallback when status loading fails
  - _Requirements: 1_

- [x] 2. Re-seed replay publish state with modern Svelte syntax
  - Replace `$state(data.published)` plus `$effect` with writable `$derived`
  - Keep publish and withdraw handler assignments
  - _Requirements: 2, 4_

- [x] 3. Fix settings timezone review comments
  - Remove the non-reactive `tzDirty` flag
  - Allow clearing `homeTimezone` back to the UTC/default option
  - Keep in-flight selections stable with reactive pending state
  - _Requirements: 3, 4_

- [x] 4. Remove avoidable lint suppression in workout moments
  - Replace the local `new Array(...)` allocation with `Array.from({ length })`
  - Keep the existing single-pass fill and median calculation
  - _Requirements: 4_

- [x] 5. Verify and publish
  - Run focused typecheck and tests
  - Run full `./node_modules/.bin/vp run check`
  - Refresh PR review threads after push
  - Update PR metadata to match the final scope
