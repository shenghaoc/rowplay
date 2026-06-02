# Stroke-accurate Rival Ghost — Design

## Overview

Leaderboard "Race" links pass `ghostToken` + redundant `ghostPace` / `ghostName`.
The replay page fetches `/api/ghost/<token>` (public, token-gated), arms the rival's
real `Stroke[]` via existing `setGhost` + second lane. Pace ghost is shown
optimistically while the fetch runs when both params are present.

```
/leaderboard  raceLink()  →  /replay/<yourId>?ghostToken&ghostPace&ghostName
                                    │
                                    ├─ (sync) arm pace ghost if ghostPace present
                                    └─ (async) GET /api/ghost/<token>
                                           → loadSharedWorkout (D1 / demo map / KV)
                                           → toRivalGhostTrace → setGhost(strokes)
```

## API — `GET /api/ghost/[token]`

- **Handler:** `src/routes/api/ghost/[token]/+server.ts`
- **Logic:** `src/lib/server/rivalGhost.ts` → `loadSharedWorkout` → `toRivalGhostTrace`
- **Response:** `{ sport, distance, time, pace, date, workoutType?, strokes }` — no user id/email
- **Cache-Control:** `public, max-age=3600` (`GHOST_TRACE_CACHE`)
- **Errors:** 404 for bad/missing token; replay falls back to pace ghost when `ghostPace` present

## Pure module — `src/lib/replay/rivalGhost.ts`

- `isShareToken`, `toRivalGhostTrace`, `buildRaceDeepLink`
- Unit tests: `rivalGhost.test.ts`

## Demo mode

- `DEMO_RIVAL_OTTER_TOKEN` on rower 2k rival "Otter" in `mockLeaderboard.ts`
- `resolveDemoBoardShare(token)` checked in `loadSharedWorkout` before D1/KV (no KV writes on read)
- Maps token → mock workout `1007` (2000m steady with full stroke trace)

## Replay page changes

- `GhostRival.kind` adds `'rival'`; verdict copy reuses file win/lose strings with rival name
- `armGhostFromUrl()` async: optimistic pace → fetch → `setGhost` or pace-only fallback

## Leaderboard

- `raceLink()` uses `buildRaceDeepLink()`; includes `ghostToken` when `shareToken` set

## Out of scope

- Changing engine/renderer
- Storing rival strokes outside existing share + D1 cache
