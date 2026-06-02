# Stroke-accurate Rival Ghost — Requirements

## Introduction

Today, racing a rival **from the leaderboard** degrades the experience that
makes rowplay worth using. The board's "Race" action deep-links to
`/replay/<id>?ghostPace=<sec>&ghostName=<name>`, which arms a **constant-pace
ghost** (`constantPaceGhost` in `src/lib/replay/sources.ts`): a metronome that
holds one flat split for the whole piece. You never feel a rival surge off the
start, fade on the third 500, or sprint the last 250 — the three moments that
make a head-to-head feel real and make you pull harder.

Meanwhile, racing your **own** past session already replays the rival's *real*
stroke-by-stroke trace (`loadSessionGhost` → `/api/workouts/<id>` →
`WorkoutDetail.strokes`). Cross-athlete racing is the only ghost path still
faked, even though every published board entry already carries a public
`share_token` (see `leaderboards/design.md`, table `leaderboard_entry`) whose
`/r/<token>` replay holds the rival's full stroke array.

This feature closes that gap: a leaderboard "Race" link arms the rival's
**actual recorded strokes** via their existing public share token. It is the
explicit follow-up flagged in `leaderboards/design.md` → *"Out of scope: storing
rivals' full stroke data for a true stroke-accurate cross-user ghost … A later
iteration can race the rival's actual shared strokes via `loadSharedWorkout`."*

It obeys every project rule in `AGENTS.md`: it works in **demo mode** (falling
back to the pace ghost where no real strokes exist), every string goes through
**i18n** in all six locales, it reuses the existing **share** capability-token
infrastructure (no new identity or auth surface), and it passes the full quality
gate (`check` + `build` + `test` + `test:e2e`).

## Dependencies and parking

This spec was sequenced **after** the
`full-fidelity-data` spec (#61) lands, but that is a **product ordering** choice,
not a stroke-schema blocker:

- **`full-fidelity-data` does not widen strokes.** Per that spec, stroke-level
  fields (`t`, `d`, `p`, `spm`, `hr`) are already complete in
  `WorkoutDetail.strokes`; no new stroke shape is required here.
- **What this feature actually needs (all exist today):** `share_token` on
  published board rows, `loadSharedWorkout` / demo KV share pointers, the replay
  engine's `sampleAt` + second lane, and `setGhost` on the replay page.
- **Unpark trigger:** `full-fidelity-data` merged and prioritised, or an
  explicit decision to implement this spec sooner — not a D1 payload migration.

## Glossary

- **Rival ghost** — the second avatar/lane in the replay, driven by a rival
  athlete's data rather than your own.
- **Stroke-accurate** — the ghost is driven by the rival's real `Stroke[]`
  trace (variable pace over the piece), not a single flat pace.
- **Share token** — the unguessable capability segment already minted by
  `createWorkoutShare`; `/r/<token>` resolves it to a public `WorkoutDetail`.
- **Pace-only fallback** — the existing `constantPaceGhost`, used when no real
  trace is available (demo rivals without a token, missing/expired token, fetch
  failure).

## Requirements

### Requirement 1 — Race a rival's real strokes from the board

**User story:** As an athlete, I want a leaderboard "Race" to replay my rival's
actual recorded effort, so that the head-to-head feels like the real race
instead of a flat pacer.

#### Acceptance criteria

1. WHERE a board entry exposes a public `shareToken` THE "Race" action SHALL
   deep-link the replay with **both** `ghostToken` (rival share token) **and**
   `ghostPace` (rival pace in sec/500m) plus `ghostName`, so a token fetch
   failure can still arm the pace ghost (Req 3.2).
2. WHEN the replay arms a stroke-accurate rival ghost THEN the second lane SHALL
   reflect the rival's variable pace over the piece (lead changes are visible)
   using the existing engine `sampleAt` + renderer second-lane — **no new
   rendering path**.
3. THE rival ghost SHALL be labelled with the rival's display name (never an
   email, user id, or other PII).
4. WHERE a board entry has **no** `shareToken` (e.g. a synthetic demo rival or
   an unshared result) THE "Race" action SHALL deep-link with `ghostPace` and
   `ghostName` only and SHALL fall back to the existing constant-pace ghost so
   racing always works.

### Requirement 2 — Public, read-only access to a shared trace

**User story:** As an athlete, I want to fetch a rival's shared strokes without
logging in, so that racing a public board entry needs no extra permission.

#### Acceptance criteria

1. THE system SHALL expose the rival's strokes through a **public, read-only**
   path gated solely by the share token (the same capability model as
   `/r/<token>`), requiring no session. **Route shape is deferred to
   `design.md`** (e.g. a dedicated JSON endpoint such as `/api/ghost/<token>`
   vs. reusing `/r/<token>` with a strokes-only response); requirements only
   mandate token-gated, session-free access.
2. WHERE the token is unknown, malformed, or no longer shared THE system SHALL
   respond with a not-found result and the replay SHALL fall back per Req 3.2
   **without throwing**.
3. THE response SHALL contain only what the ghost lane needs (strokes +
   public display fields) and SHALL NOT leak the owner's user id or email.
4. THE endpoint SHALL set `cache-control` consistent with the existing shared
   replay (a public capability resource), not `private, no-store`. **Design**
   SHALL decide whether this reuses the full `/r/<token>` payload or a smaller,
   more cacheable strokes-only response.
5. THE cache lifetime SHALL be **bounded** so that revoking a share token stops
   the trace from being served within a reasonable window — i.e. a short
   `max-age` (and/or `must-revalidate` / `stale-while-revalidate`), never an
   effectively-immortal public cache. The chosen TTL SHALL match the existing
   shared-replay policy so revocation semantics stay consistent across both
   public surfaces.

### Requirement 3 — Deep-link contract and backward compatibility

**User story:** As the maintainer, I want existing links and the pace ghost to
keep working, so that nothing regresses while the richer ghost lands.

#### Acceptance criteria

1. THE replay page SHALL accept a new `ghostToken` query parameter (rival share
   token) alongside the existing `ghostName` and `ghostPace`.
2. WHERE both `ghostToken` and `ghostPace` are present THE system SHALL prefer
   the stroke-accurate `ghostToken`; on fetch failure it SHALL fall back to the
   constant-pace ghost from `ghostPace` (never silent solo when pace is present).
3. WHERE only `ghostPace` is present (old links, demo rivals without a token)
   THE system SHALL behave exactly as today (constant-pace ghost).
4. WHERE only `ghostToken` is present (no `ghostPace`) AND the fetch fails THE
   replay SHALL remain solo — an edge case; leaderboard links SHALL always
   include redundant `ghostPace` (Req 1.1).
5. THE arming SHALL run from the existing `armGhostFromUrl()` entry point on
   mount (see Req 5 for async behaviour); an invalid or absent parameter set
   SHALL leave the solo replay untouched.

### Requirement 4 — Quality, privacy, and i18n

**User story:** As the maintainer, I want the feature to meet rowplay's bar, so
that it ships without regressions.

#### Acceptance criteria

1. ANY new pure logic (token→ghost resolution helper) SHALL live in a DOM-free
   module and SHALL be covered by Vitest unit tests.
2. THE public trace path SHALL expose only display name + result metrics +
   strokes — never PII (Req 2.3).
3. EVERY new user-visible string SHALL be added to **all six** i18n
   dictionaries (en, zh, de, es, fr, ja); sport names stay untranslated.
4. THE feature SHALL pass the full gate: `npm run check` (0 errors),
   `npm run build`, `npm run test`, and `npm run test:e2e` (see Req 6.3).

### Requirement 5 — Async rival-ghost arming

**User story:** As an athlete opening a "Race" link, I want the ghost to appear
promptly and upgrade to the real trace when ready, so the replay never feels
broken while data loads.

**Context:** `armGhostFromUrl()` today is synchronous and only handles
`ghostPace`. Stroke-accurate arming requires a network fetch (same pattern as
`loadSessionGhost`, which already uses `loadingGhost` + `setGhost` after
mount).

#### Acceptance criteria

1. WHEN `ghostToken` is present `armGhostFromUrl()` (or its delegate) SHALL
   fetch the rival trace **asynchronously** on mount without blocking first
   paint of the primary workout.
2. WHERE both `ghostToken` and `ghostPace` are present WHILE the token fetch is
   in flight THE replay SHALL arm the **pace-only ghost immediately** from
   `ghostPace` and `ghostName`; WHEN the fetch succeeds THE system SHALL
   **replace** it with the stroke-accurate ghost via `setGhost` (the engine
   already tolerates ghost swaps after mount).
3. WHERE only `ghostToken` is present (no `ghostPace`) WHILE the fetch is in
   flight THE replay SHALL stay solo; WHEN the fetch succeeds THE system SHALL
   arm the stroke ghost; on failure it SHALL remain solo.
4. DURING any in-flight rival-ghost fetch THE replay UI SHALL show the existing
   `loadingGhost` / `common.loading` affordance (same as session/file ghost
   pickers) — no new loading chrome required unless copy differs.
5. IF the fetch fails (404, network error) THE system SHALL apply Req 3.2
   (pace fallback when `ghostPace` present) and SHALL NOT leave a stale
   stroke ghost armed.
6. WHEN a stroke-accurate fetch fails AND the system falls back to the
   constant-pace ghost THE replay SHALL surface a **non-blocking** notification
   (a toast, reusing the existing `toast` affordance and an i18n'd string such
   as "Couldn't load your rival's strokes — racing their average pace instead")
   so the athlete knows they are racing a pace approximation, not the real
   trace. A silent solo fallback (no `ghostPace`) needs no toast.

### Requirement 6 — Demo mode and e2e

**User story:** As a maintainer, I want demo mode and e2e to exercise the full
stroke-accurate path without Concept2 credentials.

#### Acceptance criteria

1. Demo rivals **without** a `shareToken` SHALL continue to race via pace-only
   deep links (unchanged behaviour; `mockLeaderboard.ts` synthetic rivals).
2. Demo mode SHALL include **at least one** board entry with a `shareToken` that
   resolves to real stroke data via the demo share store (KV `share:<token>` →
   `mockWorkoutDetail`, same as `/r/<token>`), so the stroke-accurate path is
   explorable without auth.
3. E2E (`test:e2e`) SHALL include a smoke case: from `/leaderboard` in demo
   mode, follow a **Race** link for a token-backed rival and assert the ghost
   lane is armed (stroke-accurate when fetch completes, or pace ghost during
   optimistic phase per Req 5.2).
