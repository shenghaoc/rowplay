# Leaderboards / Multiplayer Race — Design

## Overview

The feature adds a public **leaderboard** layer on top of two existing systems:

- **Shareable replays** — `createWorkoutShare` / `loadSharedWorkout` in
  `src/lib/server/share.ts`, capability tokens stored on `workout_detail`
  (`share_token`, migration `0004_share_token.sql`) in live mode and a KV
  pointer (`share:<token>`) in demo mode; public route `/r/[token]`.
- **Ghost racing** — the replay engine's pure `sampleAt` + the renderer's second
  avatar lane, plus three ghost sources in `src/lib/replay/sources.ts`
  (`constantPaceGhost`, `parseWorkoutFile`) and `pickDefaultGhostCandidate`.

Nothing in the rendering or replay engine changes. We add: a pure ranking
module, one D1 table + DB helpers, a server-side board loader/publisher, a
`/leaderboard` page, a publish API endpoint, a nav entry, i18n, and a small
query-param hook so a board "Race" link pre-arms the replay's existing
constant-pace ghost.

```
/leaderboard page  ──loads──>  server/leaderboard.ts  ──>  db.ts (D1)        [live]
       │                              │                └──>  mockLeaderboard  [demo]
       │                              └── reuses ──>  leaderboard.ts (pure rank/group)
       │
  entry row ──"Open"──> /r/<token>            (existing public replay)
  entry row ──"Race"──> /replay/<id>?ghostPace=<sec>&ghostName=<name>
                                              (existing constant-pace ghost, pre-armed)
```

## Data model

### D1 — `migrations/0005_leaderboard.sql`

```sql
CREATE TABLE IF NOT EXISTS leaderboard_entry (
    sport        TEXT    NOT NULL,            -- rower | skierg | bike
    distance     INTEGER NOT NULL,            -- standard board distance, metres
    user_id      INTEGER NOT NULL,            -- logbook user id (never exposed)
    workout_id   INTEGER NOT NULL,
    display_name TEXT    NOT NULL,            -- public; the only identity shown
    time         REAL    NOT NULL,            -- elapsed seconds (rank key)
    pace         REAL    NOT NULL,            -- sec / 500m
    date         TEXT    NOT NULL,            -- workout date
    share_token  TEXT,                        -- public replay token, when shared
    published_at INTEGER NOT NULL,            -- epoch ms
    PRIMARY KEY (sport, distance, user_id)    -- one (best) entry per athlete/board
);

-- Board read: fastest-first within a (sport, distance).
CREATE INDEX IF NOT EXISTS idx_leaderboard_board
    ON leaderboard_entry (sport, distance, time ASC);
```

The `PRIMARY KEY (sport, distance, user_id)` enforces **one entry per athlete
per board** (Req 4.3); publish is an UPSERT that keeps the faster `time`. The
`user_id` is a key only — it is never returned to the client (Req 5.2).

### Standard distances

Reuse the canonical set already in `db.ts` (`STANDARD_PB_DISTANCES`):
`[500, 1000, 2000, 5000, 6000, 10000, 21097]`. A workout snaps to a board only
when its distance is within tolerance (±2% or ±10 m, whichever is larger) of a
standard distance.

## Pure core — `src/lib/leaderboard.ts` (DOM-free, unit-tested)

Types and functions, no server/DOM imports (mirrors `analytics.ts` /
`workoutQuery.ts` conventions):

```ts
export const STANDARD_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097];

export interface LeaderboardEntry {
    sport: Sport;
    distance: number;
    displayName: string;
    time: number;
    pace: number;
    date: string;
    workoutId: number;
    shareToken?: string;
    isYou?: boolean;
}

export interface RankedEntry extends LeaderboardEntry {
    rank: number;          // 1-based; ties share a rank
    gapSeconds: number;    // time - leaderTime (0 for the leader)
}

export interface Board {
    sport: Sport;
    distance: number;
    entries: RankedEntry[];
}

export function boardKey(sport: Sport, distance: number): string;
export function matchStandardDistance(distance: number): number | null;
export function rankEntries(entries: LeaderboardEntry[]): RankedEntry[];
export function buildBoards(entries: LeaderboardEntry[]): Board[];
```

- `rankEntries` — stable sort by `time` asc (tie-break by `date` desc so the
  newer effort lists first within a tie), assign 1-based rank where equal times
  share a rank, compute `gapSeconds` against the leader.
- `buildBoards` — group entries by `boardKey`, rank each group, return boards in
  a stable `(sport order, distance asc)` order.
- `matchStandardDistance` — snap to the nearest standard distance within
  tolerance, else `null` (drives Req 4.2 rejection).

This module is the unit-test surface for Req 5.1.

## Demo data — `src/lib/mockLeaderboard.ts` (pure)

Deterministic so demo mode is fully populated (Req 1.4, 4.4) with **no KV/D1
writes on read**:

- The demo athlete ("You") contributes their standard-distance results derived
  from `mockWorkouts()` (e.g. the 2k @ id 1001, 500m @ 1006, SkiErg 1k @ 1003).
  Those entries carry `isYou: true` and `workoutId` so the replay link works.
- A fixed roster of synthetic rivals (deterministic names + plausible
  times/paces seeded per board) fills every standard board so no board is empty.
  Rivals expose a `ghostPace` via the entry's `pace`, so a board "Race" link can
  pre-arm a constant-pace ghost even though we don't store rival stroke data in
  demo mode.

Names are neutral handles (no PII), e.g. `Otter`, `Heron`, `Marlin`, ...,
defined as a constant list and paired with deterministic per-board offsets.

## Server layer — `src/lib/server/leaderboard.ts`

```ts
loadBoards(event): Promise<Board[]>
publishWorkout(event, workoutId): Promise<{ board: {sport, distance}, rank: number }>
```

- `loadBoards`
  - **demo**: `buildBoards(mockLeaderboard())`, marking the demo athlete `isYou`.
  - **live**: read all `leaderboard_entry` rows via a new
    `getLeaderboardEntries(db)` DB helper, map to `LeaderboardEntry[]` (drop
    `user_id`, set `isYou` by comparing to `event.locals.user.id`), then
    `buildBoards`.
- `publishWorkout`
  - resolve the workout summary (`loadWorkouts` / mock), `matchStandardDistance`
    its distance → reject (HTTP 422) if no match (Req 4.2).
  - **live**: `createWorkoutShare(event, workoutId)` to guarantee a token
    (reuses existing infra, Req 4.1), then `upsertLeaderboardEntry(db, …)`
    keeping the faster time (Req 4.3); 401 if unauthenticated (Req 4.5).
  - **demo**: return success; the demo board already contains the athlete
    (Req 4.4) — no mutation needed.

### DB helpers added to `src/lib/server/db.ts`

```ts
upsertLeaderboardEntry(db, entry): Promise<void>   // ON CONFLICT keep MIN(time)
getLeaderboardEntries(db): Promise<LeaderboardRow[]>
```

Both wrapped in the file's existing best-effort try/catch style.

## API — `POST /api/leaderboard/publish`

`src/routes/api/leaderboard/publish/+server.ts`:
- body `{ workoutId: number }`.
- calls `publishWorkout(event, workoutId)`, returns the board + rank as JSON,
  `cache-control: private, no-store`.
- 401 unauthenticated (live), 422 non-standard distance, 400 bad id.

## Page — `src/routes/leaderboard/`

- `+page.server.ts` — `load` returns `{ boards, demo }` from `loadBoards`. No
  auth redirect: boards are public (like `/r/<token>`), but `loadBoards` still
  marks the viewer's own rows when a session exists.
- `+page.svelte` — RACE BOARD styled:
  - **Board selector**: sport segmented control (RowErg/SkiErg/BikeErg, names
    untranslated) + standard-distance chips (reusing the chip styling already in
    `WorkoutListFilters`/`workoutQuery`). Selection is reflected in the URL
    querystring (`?sport=&distance=`) so a board is shareable/bookmarkable.
  - **Standings table**: rank · name (with a "you" badge) · time · pace · gap.
    Empty state when the selected board has no entries (Req 1.3).
  - Each row: an **Open** link → `/r/<shareToken>` when present; a **Race**
    link → `/replay/<workoutId>?ghostPace=<round(pace)>&ghostName=<name>`.
  - All labels via `i18n.t('leaderboard.*')`; numbers via `format.ts`.

## Replay deep-link (race pre-arm)

The replay page (`src/routes/replay/[id]/+page.svelte`) already arms a
constant-pace ghost in `applyPace()` via `constantPaceGhost(secs, total)`. Add a
small `onMount` hook: if `page.url.searchParams` has `ghostPace`, parse it; on a
valid number switch `compareMode = 'pace'`, set the label from `ghostName`, and
call the existing ghost-arming path. Invalid/absent → no-op solo replay
(Req 3.4). No engine/renderer changes; reuses the existing second-lane.

## i18n

New `leaderboard` block in BOTH `en` and `zh` in `src/lib/i18n.ts`: page title,
intro, sport/distance selector labels, table headers (rank/athlete/time/
pace/gap), the "you" badge, empty state, Open/Race actions, publish success +
the non-standard-distance error. `nav.leaderboard` added to the existing `nav`
block.

## Navigation

Add a `/leaderboard` tab to `src/routes/+layout.svelte`'s `mast-tabs`, between
Dashboard and Data, with `class:active` on `pathname.startsWith('/leaderboard')`.

## Testing

- **Unit (`src/lib/leaderboard.test.ts`)**: `matchStandardDistance` (snap +
  tolerance reject), `rankEntries` (order, ties share rank, gap maths),
  `buildBoards` (grouping, per-board ranking, stable order), and that
  `mockLeaderboard()` yields non-empty boards including a `isYou` entry.
- **E2E (`tests/e2e/leaderboard.spec.ts`)**: in demo mode, `/leaderboard`
  renders a ranked board, switching distance updates it and the URL, and an
  entry's **Open** link resolves to a public `/r/<token>` replay (or **Race**
  link resolves to a replay with a ghost). Reuses the `share.spec.ts` patterns.

## Out of scope (follow-ups)

- Storing rivals' full stroke data for a true stroke-accurate cross-user ghost
  (demo uses a pace ghost; live uses the rival's own public replay). A later
  iteration can race the rival's *actual* shared strokes via `loadSharedWorkout`.
- Anti-cheat / verification of published times.
- Pagination for very large boards (current scope: top-N per board).
