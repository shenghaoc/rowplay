# Test Coverage — Tasks

Implementation plan. All tasks completed on `claude/test-coverage-analysis-geB4s`.
Historical final-gate snapshot when this spec landed: `npm run test` was green
with the suite size at that point and 0 unhandled errors. Use current
`npm run test` output for the live project count.

---

## Commit 1 — Core library and server layer

- [x] **1. Coverage reporter** — `vitest.config.ts`, `package.json`
  - Install `@vitest/coverage-v8`; add `coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**/*.ts'], exclude: [...test files, *.svelte.ts, types] }`.
  - _Requirements: 1.1, 1.2_

- [x] **2. Datetime helpers** — `src/lib/datetime.test.ts`
  - `parseLogbookDateTime`, `logbookEpochMillis`, `overlapDate`, `fmtDate`, `fmtDateFromEpochMillis`, `todayKeyUtc`, `dayKeyEpochMillis`.
  - _Requirements: —_

- [x] **3. Goals helpers** — `src/lib/goals.test.ts`
  - `defaultAnnualGoal`, `parseGoalsCookie`, `serializeGoalsCookie`.
  - _Requirements: —_

- [x] **4. Workout query** — `src/lib/workoutQuery.test.ts`
  - `parseWorkoutListQuery`, `serializeWorkoutListQuery`, `filterAndSortWorkouts`, `pbWorkoutIds`, `avgPowerWatts`, `toggleDistanceChip`, `toggleDurationChip`, `durationChipActive`, `listQueryIsFiltered`.
  - _Requirements: —_

- [x] **5. i18n helpers** — `src/lib/i18n.test.ts`
  - `isLanguage`, `interpolate`, `getStoredLanguage` (stubbed `window`/`localStorage`), `persistLanguage`.
  - _Requirements: —_

- [x] **6. Locale completeness** — `src/lib/locales/locales.test.ts`
  - All non-English locale files have exactly the same key set as `en`.
  - _Requirements: —_

- [x] **7. i18n plural** — `src/lib/i18nPlural.test.ts`
  - `pluralKey` — English one/other, non-English languages always return base key.
  - _Requirements: —_

- [x] **8. Export helpers** — `src/lib/server/export.test.ts`
  - `workoutsToCsv` (RFC 4180 escaping, formula injection guard), `workoutsToJson`, `workoutDetailToTcx`, `exportFilename`, `workoutExportFilename`.
  - _Requirements: —_

- [x] **9. Session** — `src/lib/server/session.test.ts`
  - `newSessionId`, `readSession`, `writeSession`, `destroySession` with fake KV.
  - _Requirements: 2.3_

- [x] **10. Concept2 helpers** — `src/lib/server/concept2-strokes.test.ts`
  - `mapStrokes` (unit conversions, interval resets), `redirectUri`, `buildAuthorizeUrl`.
  - _Requirements: —_

- [x] **11. D1 DB layer** — `src/lib/server/db.test.ts`
  - All CRUD: `getCachedDetail`, `putCachedDetail`, `getAllWorkouts`, `countWorkouts`, `getSyncState`, `setSyncState`, `purgePrivateCache`, `deleteUserData`, `isWorkoutPublished`, `setShareToken`, `getShareToken`, `getCachedDetailByShareToken`, `getUserAnnualGoal`, `setUserAnnualGoal`, `getAnnotations`, `putAnnotation`, `deleteAnnotation`, `upsertLeaderboardEntry`, `deleteLeaderboardEntry`, `getLeaderboardEntries`.
  - _Requirements: 2.1_

- [x] **12. Replay sources** — `src/lib/replay/sources.test.ts`
  - `parsePaceInput`, `constantPaceGhost`, `parseWorkoutFile` (CSV via File API, FIT binary).
  - _Requirements: —_

- [x] **13. Server data layer** — `src/lib/server/data.test.ts`
  - `loadWorkouts`, `loadWorkoutDetail`, `loadDashboardAggregates`, `loadAnnualGoal`, `saveAnnualGoal`, `syncStatus`, `loadAnnotations`, `saveAnnotation`, `removeAnnotation` — all in demo mode + auth guards.
  - _Requirements: 2.2_

- [x] **14. Replay sports** — `src/lib/replay/sports.test.ts`
  - `SPORT_THEME`, `themeFor`, `MACHINE_COLOR`, `MACHINE_HEX`.
  - _Requirements: —_

- [x] **15. Share helpers** — `src/lib/server/share-extended.test.ts`
  - `generateShareToken`, `shareMeta`.
  - _Requirements: —_

- [x] **16. Config** — `src/lib/server/config.test.ts`
  - `getConfig` — env fallbacks, request origin fallback.
  - _Requirements: —_

- [x] **17. Mock data** — `src/lib/mockData.test.ts`
  - `mockWorkouts`, `mockWorkoutDetail`, `mockAnnotations`.
  - _Requirements: —_

- [x] **18. Analytics — new PBs** — `src/lib/analytics-newpbs.test.ts`
  - `detectNewPBs`, `distancePBs` — tolerance matching, sport keying, time ordering.
  - _Requirements: —_

- [x] **19. Leaderboard server** — `src/lib/server/leaderboard-publish.test.ts`
  - `loadBoards` (demo), `publishWorkout` (demo + auth guard), `withdrawWorkout` auth guard.
  - _Requirements: 2.1_

- [x] **20. Rival ghost** — `src/lib/server/rivalGhost.test.ts`
  - `GHOST_TRACE_CACHE` format, `loadRivalGhostTrace` (returns trace / throws 404).
  - _Requirements: —_

- [x] **21. HR import server** — `src/lib/server/hrImport.test.ts`
  - `saveHrImport`, `clearHrImport` — auth guards (400 demo, 401 unauthed, 409 duplicate HR).
  - _Requirements: —_

---

## Commit 2 — Route handlers

- [x] **22. account/delete** — `src/routes/api/account/delete/server.test.ts`
  - Demo → `{demo:true}`, 401 no auth, 400 no confirm, 400 bad JSON, success + cookie deletion.
  - _Requirements: 3.1_

- [x] **23. api/sync** — `src/routes/api/sync/server.test.ts`
  - Demo → 400, full=1 param forwarded, D1 missing → 503, generic error → 502, success.
  - _Requirements: 3.1_

- [x] **24. api/export** — `src/routes/api/export/server.test.ts`
  - Empty → 404, csv format, json format (default), unsupported format → 400.
  - _Requirements: 3.1_

- [x] **25. api/export/[id]** — `src/routes/api/export/[id]/server.test.ts`
  - Bad id → 400, unsupported format → 400, tcx success, default format.
  - _Requirements: 3.1_

- [x] **26. api/goals** — `src/routes/api/goals/server.test.ts`
  - GET year param parsing; PUT invalid kind → 400, invalid target → 400, success, year override.
  - _Requirements: 3.1_

- [x] **27. api/live/mock** — `src/routes/api/live/mock/server.test.ts`
  - Non-demo → 400, demo returns generated workout.
  - _Requirements: 3.1_

- [x] **28. api/live/poll** — `src/routes/api/live/poll/server.test.ts`
  - Demo → empty result (no sync call), D1 error → 503, generic error → 502, success.
  - _Requirements: 3.1_

- [x] **29. api/workouts** — `src/routes/api/workouts/server.test.ts`
  - Returns workouts, demo flag, query, filtered status.
  - _Requirements: 3.1_

- [x] **30. api/workouts/[id]** — `src/routes/api/workouts/[id]/server.test.ts`
  - Bad id → 400, success returns detail.
  - _Requirements: 3.1_

- [x] **31. api/workouts/[id]/annotations** — `src/routes/api/workouts/[id]/annotations/server.test.ts`
  - GET bad id → 400, success; POST bad id/timestamp/text/length/array-body → 400, success; DELETE bad id/missing/zero annotationId → 400, success.
  - _Requirements: 3.1_

- [x] **32. api/workouts/[id]/hr-import** — `src/routes/api/workouts/[id]/hr-import/server.test.ts`
  - POST bad id → 400, missing samples → 400, invalid sample fields → 400, offset clamped to ±600, success; DELETE bad id → 400, success.
  - _Requirements: 3.1_

- [x] **33. api/workouts/[id]/share** — `src/routes/api/workouts/[id]/share/server.test.ts`
  - Bad id → 400, success returns share info.
  - _Requirements: 3.1_

- [x] **34. api/leaderboard/publish** — `src/routes/api/leaderboard/publish/server.test.ts`
  - POST bad JSON → 400, missing workoutId → 400, invalid id → 400, null body → 400, success; DELETE same guards + success.
  - _Requirements: 3.1_

- [x] **35. api/ghost/[token]** — `src/routes/api/ghost/[token]/server.test.ts`
  - Short/non-hex token → 404, valid 48-char hex token → delegates to rivalGhostJson.
  - _Requirements: 3.1_

- [x] **36. api/webhooks/ergdata** — `src/routes/api/webhooks/ergdata/server.test.ts`
  - No secret → 501, missing sig → 401, invalid sig → 401, wrong-length hex → 401, invalid JSON → 400, missing workoutId → 400, valid HMAC → ok.
  - _Requirements: 3.1_

- [x] **37. auth/login** — `src/routes/auth/login/server.test.ts`
  - No clientId → 303 to `/dashboard`, clientId set → 302 to OAuth URL.
  - _Requirements: 3.1_

- [x] **38. auth/callback** — `src/routes/auth/callback/server.test.ts`
  - `error` param → 400, unknown error code sanitised to `unknown_error`, missing code/state → 400, state mismatch → 400, success → 303 to `/dashboard`.
  - _Requirements: 3.1_

- [x] **39. auth/token (page server)** — `src/routes/auth/token/page.server.test.ts`
  - `load` redirects if already authed; `actions.default` empty token → 400, no SESSION_SECRET → 500, bad token → 400, success → 303.
  - _Requirements: 3.1, 3.2_

- [x] **40. dashboard** — `src/routes/dashboard/page.server.test.ts`
  - Unauthed → 303, demo returns data + null sync, authed returns data.
  - _Requirements: 3.2_

- [x] **41. leaderboard** — `src/routes/leaderboard/page.server.test.ts`
  - Returns boards array and demo flag for both demo and authed.
  - _Requirements: 3.2_

- [x] **42. r/[token]** — `src/routes/r/[token]/page.server.test.ts`
  - 404 from loadSharedWorkout → rethrown as 404, non-404 error rethrown, success returns detail + meta + annotations + publicView.
  - _Requirements: 3.2_

- [x] **43. replay/[id]** — `src/routes/replay/[id]/page.server.test.ts`
  - Unauthed → 303, demo returns detail, candidates filtered to same sport (excluding self), published=false in demo.
  - _Requirements: 3.2_

- [x] **44. settings** — `src/routes/settings/page.server.test.ts`
  - Unauthed → 303, demo returns workoutCount + null sync + tcxWorkouts (hasStrokeData only).
  - _Requirements: 3.2_

- [x] **45. compare** — `src/routes/compare/page.server.test.ts`
  - Unauthed → 303, no ids → null details, both ids loaded, loadWorkoutDetail throws → detail set to null, invalid ids → loadWorkoutDetail not called.
  - _Requirements: 3.2_

---

## Commit 3 — Svelte reactive classes and 3D renderer

- [x] **46. I18n class** — `src/lib/i18n.svelte.test.ts`
  - Constructor, `t()` (translation, interpolation, fallback), `setLanguage()` (updates state + calls persistLanguage), `cycle()` (advances and wraps).
  - _Requirements: 4.1, 4.2_

- [x] **47. Theme class** — `src/lib/theme.svelte.test.ts`
  - `daisyThemeName()`, constructor defaults, `isDark`, `set()`, `toggle()` (both directions), `document.dataset.theme` updated.
  - _Requirements: 4.1, 4.2_

- [x] **48. LiveMode class** — `src/lib/liveMode.svelte.test.ts`
  - Constructor reads `loadLivePrefs`, initial state fields, `hasWarning`, `setEnabled/setInterval/setSound` mutations + `saveLivePrefs` called, `stop()` sets status + clears timer, `resetTimer()` no-throw when disabled.
  - _Requirements: 4.1, 4.2_

- [x] **49. CourseRenderer3D** — `src/lib/replay/renderer3d.test.ts`
  - Constructs for all 3 sports × 3 quality levels; appends canvas to host; `LOOP_METERS` constant; `resize()` no-throw; `render()` early return (w=0) + post-resize, ghost state, dark theme, playing animation; `destroy()` no-throw.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] **50. renderer3dLoader fix** — `src/lib/replay/renderer3dLoader.test.ts`
  - Await the in-flight dynamic import in the cache-identity test to prevent `EnvironmentTeardownError` when running alongside the new renderer3d mock.
  - _Requirements: 6.1_
