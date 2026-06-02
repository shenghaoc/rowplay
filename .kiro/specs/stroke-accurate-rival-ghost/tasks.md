# Stroke-accurate Rival Ghost — Tasks

- [x] 1. `src/lib/replay/rivalGhost.ts` + unit tests (`isShareToken`, `toRivalGhostTrace`, `buildRaceDeepLink`)
- [x] 2. `GET /api/ghost/[token]` + `src/lib/server/rivalGhost.ts`
- [x] 3. Demo board share: `DEMO_RIVAL_OTTER_TOKEN`, `resolveDemoBoardShare` in `loadSharedWorkout`
- [x] 4. Leaderboard `raceLink` → `buildRaceDeepLink` with `ghostToken` when shared
- [x] 5. Replay `armGhostFromUrl` async (optimistic pace, stroke swap, fallbacks)
- [x] 6. E2E: Otter 2k Race smoke (`tests/e2e/leaderboard.spec.ts`)
- [x] 7. Quality gate: `check`, `build`, `test`, `test:e2e`
