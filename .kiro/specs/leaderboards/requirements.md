# Leaderboards / Multiplayer Race — Requirements

## Introduction

rowplay's moat is the post-workout **replay / re-watch** experience: an avatar
racing a course with synchronized telemetry, plus **ghost racing** your past
self, a constant pace, or an uploaded file. Today that race is always solo —
the only rivals available are *your own* sessions, a synthetic pace boat, or a
file you upload.

This feature opens the race up to **other rowplay athletes**. Athletes publish a
shared result onto a public **leaderboard** scoped to a sport + standard
distance (500m, 1k, 2k, 5k, 6k, 10k, half-marathon). From any board an athlete
can open a rival's public replay and **race that rival's ghost** in the replay
view. It is the natural extension of two pieces of infrastructure that already
exist: **shareable replays** (`/r/<token>`, capability tokens on D1) and
**ghost racing** (the replay engine's second-avatar lane).

This is a parking-lot item promoted from `HANDOFF.md`
("Leaderboards / multiplayer race: race ghosts of *other* rowplay users on the
same workout — extends the share infra"). It must obey every project rule in
`AGENTS.md`: it works in **demo mode**, every string goes through **i18n**
(en + zh), it uses the existing **RACE BOARD** design tokens, and it passes the
full quality gate (`check` + `build` + `test` + `test:e2e`).

## Glossary

- **Board** — a ranked list scoped to one `(sport, distance)` pair, e.g.
  "RowErg · 2000m".
- **Standard distance** — one of the canonical race distances the board groups
  by: 500, 1000, 2000, 5000, 6000, 10000, 21097 (half-marathon). Mirrors
  `STANDARD_PB_DISTANCES` already used in `db.ts`.
- **Entry** — one athlete's published result on a board: display name, time,
  pace, date, an optional public replay share token, and a flag for whether the
  result belongs to the viewing athlete ("you").
- **Publish** — the action of putting one of your shared results onto its board.

## Requirements

### Requirement 1 — Browse boards

**User story:** As an athlete, I want to browse leaderboards by sport and
standard distance, so that I can see how other rowplay athletes' efforts on the
same piece compare.

#### Acceptance criteria

1. WHEN the athlete opens `/leaderboard` THEN the system SHALL display a board
   for a default sport + standard distance with entries ranked fastest-first.
2. WHEN the athlete selects a different sport or distance THEN the system SHALL
   show the board for that `(sport, distance)` pair.
3. WHEN a board has no entries THEN the system SHALL show an empty state rather
   than a broken or blank table.
4. WHERE the app is in demo mode THE system SHALL populate every board with
   deterministic entries (the demo athlete plus synthetic rivals) so the page is
   fully explorable with zero configuration.
5. THE system SHALL be reachable from the primary navigation on every page.

### Requirement 2 — Rank and read an entry

**User story:** As an athlete, I want each entry ranked and annotated with the
gap to the leader, so that I can read the standings at a glance.

#### Acceptance criteria

1. THE system SHALL order entries on a board by elapsed time ascending (fastest
   first) and assign each a 1-based rank.
2. WHEN two entries share the same time THEN the system SHALL assign them the
   same rank (dense/standard competition ranking, no rank skipped within a tie
   pair beyond the tie count).
3. THE system SHALL display, per entry, its rank, athlete display name, finish
   time, average pace (per 500m), and the gap in seconds behind the leader.
4. WHERE an entry belongs to the viewing athlete THE system SHALL visually mark
   it as "you".
5. THE system SHALL format time, pace, and distance through the existing
   `format.ts` helpers (no ad-hoc formatting) and all labels through i18n.

### Requirement 3 — Open and race a rival

**User story:** As an athlete, I want to race a rival from the leaderboard, so
that the standings translate into the head-to-head replay experience.

#### Acceptance criteria

1. WHERE an entry exposes a public replay share token THE system SHALL link to
   that rival's public replay at `/r/<token>`.
2. WHEN the athlete chooses to race a rival THEN the system SHALL open the
   replay view pre-armed with that rival as a ghost so the second avatar races
   immediately, without further configuration.
3. THE rival ghost SHALL be driven by the existing replay engine + renderer
   second-lane (no new rendering path) and SHALL reuse the existing
   constant-pace ghost source when only the rival's pace is known.
4. WHERE the rival's pace cannot be parsed THE system SHALL fall back to the
   normal solo replay without throwing.

### Requirement 4 — Publish a result

**User story:** As an athlete, I want to publish one of my results to its board,
so that other athletes can see and race me.

#### Acceptance criteria

1. WHEN the athlete publishes a workout THEN the system SHALL ensure the workout
   has a public share token (reusing the existing share infrastructure, not a
   parallel one) and record an entry on the `(sport, distance)` board matching
   that workout's standard distance.
2. WHERE a workout's distance does not match a standard distance within
   tolerance THE system SHALL reject the publish with a clear, i18n'd message
   rather than create an off-board entry.
3. WHERE the athlete already has an entry on that board THE system SHALL keep
   only their best (fastest) result, not duplicate rows.
4. WHERE the app is in demo mode THE publish action SHALL succeed and the demo
   athlete's result SHALL already be present on its board.
5. THE publish endpoint SHALL reject unauthenticated callers in live mode.

### Requirement 5 — Quality, privacy, and i18n

**User story:** As the maintainer, I want the feature to meet rowplay's bar, so
that it ships without regressions.

#### Acceptance criteria

1. THE leaderboard ranking, grouping, and board-matching logic SHALL live in a
   pure, DOM-free module and SHALL be covered by Vitest unit tests.
2. THE public board SHALL expose only a display name and result metrics — never
   an email, raw user id, or other PII.
3. EVERY user-visible string SHALL be added to BOTH the `en` and `zh` i18n
   dictionaries; sport names (RowErg/SkiErg/BikeErg) stay untranslated.
4. THE feature SHALL pass the full gate: `pnpm run check` (0 errors),
   `pnpm run build`, `pnpm run test`, and `pnpm run test:e2e` (a smoke spec covers
   the board rendering and an entry's replay link in demo mode).
