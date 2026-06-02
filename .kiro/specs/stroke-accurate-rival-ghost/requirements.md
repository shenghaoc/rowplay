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

## Glossary

- **Rival ghost** — the second avatar/lane in the replay, driven by a rival
  athlete's data rather than your own.
- **Stroke-accurate** — the ghost is driven by the rival's real `Stroke[]`
  trace (variable pace over the piece), not a single flat pace.
- **Share token** — the unguessable capability segment already minted by
  `createWorkoutShare`; `/r/<token>` resolves it to a public `WorkoutDetail`.
- **Pace-only fallback** — the existing `constantPaceGhost`, used when no real
  trace is available (demo rivals, missing/expired token, fetch failure).

## Requirements

### Requirement 1 — Race a rival's real strokes from the board

**User story:** As an athlete, I want a leaderboard "Race" to replay my rival's
actual recorded effort, so that the head-to-head feels like the real race
instead of a flat pacer.

#### Acceptance criteria

1. WHERE a board entry exposes a public `shareToken` THE "Race" action SHALL
   deep-link the replay so the rival ghost is driven by that rival's **real
   stroke trace**, not a constant pace.
2. WHEN the replay arms a stroke-accurate rival ghost THEN the second lane SHALL
   reflect the rival's variable pace over the piece (lead changes are visible)
   using the existing engine `sampleAt` + renderer second-lane — **no new
   rendering path**.
3. THE rival ghost SHALL be labelled with the rival's display name (never an
   email, user id, or other PII).
4. WHERE a board entry has **no** `shareToken` (e.g. a synthetic demo rival or
   an unshared result) THE "Race" action SHALL fall back to the existing
   constant-pace ghost so racing always works.

### Requirement 2 — Public, read-only access to a shared trace

**User story:** As an athlete, I want to fetch a rival's shared strokes without
logging in, so that racing a public board entry needs no extra permission.

#### Acceptance criteria

1. THE system SHALL expose the rival's strokes through a **public, read-only**
   path gated solely by the share token (the same capability model as
   `/r/<token>`), requiring no session.
2. WHERE the token is unknown, malformed, or no longer shared THE system SHALL
   respond with a not-found result and the replay SHALL fall back to the
   pace-only ghost (or solo) **without throwing**.
3. THE response SHALL contain only what the ghost lane needs (strokes +
   public display fields) and SHALL NOT leak the owner's user id or email.
4. THE endpoint SHALL set `cache-control` consistent with the existing shared
   replay (a public capability resource), not `private, no-store`.

### Requirement 3 — Deep-link contract and backward compatibility

**User story:** As the maintainer, I want existing links and the pace ghost to
keep working, so that nothing regresses while the richer ghost lands.

#### Acceptance criteria

1. THE replay page SHALL accept a new `ghostToken` query parameter (rival share
   token) alongside the existing `ghostName`.
2. WHERE both `ghostToken` and `ghostPace` are present THE system SHALL prefer
   the stroke-accurate `ghostToken`, using `ghostPace` only if the token fetch
   fails.
3. WHERE only `ghostPace` is present (old links, demo rivals) THE system SHALL
   behave exactly as today (constant-pace ghost).
4. THE arming SHALL run from the existing `armGhostFromUrl()` path on mount; an
   invalid or absent parameter set SHALL leave the solo replay untouched.

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
   `npm run build`, `npm run test`, and `npm run test:e2e` (a smoke spec races a
   demo rival via the board and asserts the ghost lane is armed).
