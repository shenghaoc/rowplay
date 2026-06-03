# Implementation Plan: MultiErg Sport-Switching Replay

Spec: `.kiro/specs/multierg-replay/`
Requirements: Req 1–11
Depends on: #61 (per-interval `machine` on `Split`), #63 (`rawT`/`rawD` reset
boundaries on `Stroke`).

Tasks are ordered so each is independently committable. The foundation tasks
(1–3) must land before any rendering work; rendering is split between 2D and 3D
so they can proceed in parallel after the foundation.

---

- [ ] **1. Per-segment stroke normalization** — `src/lib/server/concept2.ts`
  - Update `mapStrokes(raw, sport, splits?)` with optional third arg.
  - Track `segmentIndex` alongside the existing `tOffset`/`dOffset` loop.
    Increment on each reset boundary; look up `splits[segmentIndex]?.machine`
    to compute per-stroke `paceDiv`.
  - Fall back to `sport` when `splits` is absent, empty, or the indexed split
    has no `machine`.
  - Update `Concept2Client.getWorkout` to pass `splits` after `mapSplits`.
  - Add unit tests in `src/lib/server/concept2.test.ts`:
    - Three-segment MultiErg fixture: verify row `paceDiv=1`, bike `paceDiv=2`.
    - Single-sport workout: output identical with and without `splits`.
    - Reset boundary: strokes straddle a segment boundary correctly.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] **2. `isMultiErg` flag and type additions** — `src/lib/types.ts`,
  `src/lib/server/concept2.ts`
  - Add `isMultiErg: boolean` to `WorkoutDetail`.
  - Add `isMultiErg?: boolean` to `Workout` (for leaderboard + ghost fencing).
  - Compute `isMultiErg` in `Concept2Client.getWorkout` after `mapSplits`.
  - Set `isMultiErg: false` in `synthStrokes` path (split-only fallback).
  - _Requirements: 2.1, 10.1, 10.2_

- [ ] **3. Segment map and helpers** — `src/lib/replay/engine.ts`
  - Define and export `SegmentInfo` interface.
  - Implement and export `buildSegmentMap(splits: Split[]): SegmentInfo[]`.
    Handle empty splits (single-element fallback). Handle rest splits (skip
    for distance/time counters; use `restTime` to set `restBefore`).
  - Implement and export `activeMachineAt(segMap, d): Sport`.
  - Implement and export `activeSegmentIndexAt(segMap, d): number`.
  - Implement and export `restProgressAt(segMap, t): RestProgress | null`
    where `RestProgress = { phase: number; from: Sport; to: Sport; remaining: number }`.
  - Add unit tests in `src/lib/replay/engine.test.ts`:
    - `buildSegmentMap` with three-segment fixture (row/ski/bike + two rests).
    - `activeMachineAt` exact boundary, mid-segment, beyond total.
    - `restProgressAt` inside rest, outside rest, at exact boundary.
    - Empty splits fallback (single element covering full distance).
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] **4. Demo MultiErg fixture (1012)** — `src/lib/mockData.ts`
  - Add `isMultiErg?: true` to `Spec` type.
  - Add spec `1012`: `sport: 'rower'`, `isMultiErg: true`,
    `workoutType: 'MultiErg — Row/Ski/Bike'`.
  - Implement `buildMultiErgDetail(spec)` producing:
    - Splits: 3 work intervals (`machine: 'rower'`/`'skierg'`/`'bike'`) + 2 rest
      splits (`isRest: true`, `restTime: 60`).
    - Strokes: three segments synthesised with per-segment `paceProfile`,
      `rawT`/`rawD` reset to 0 at each interval boundary, BikeErg raw `p` in
      per-1000 m units before normalization.
    - `isMultiErg: true`, `isInterval: true`.
  - Add `1012` to `mockWorkouts()` output.
  - Verify `/replay/1012` loads in demo mode (manual check in `npm run dev`).
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] **5. `RenderState` extensions and `buildState` wiring** —
  `src/lib/replay/renderer.ts`, `src/routes/replay/[id]/+page.svelte`,
  `src/routes/r/[token]/+page.svelte`
  - Make `RenderState.sport: Sport` required (was optional).
  - Add `segmentIndex?: number`, `transitionPhase?: number`,
    `transitionFrom?: Sport`, `transitionTo?: Sport` to `RenderState`.
  - On Replay_Page:
    - `const segMap = $derived(buildSegmentMap(detail.splits))`.
    - `const activeSport = $derived(activeMachineAt(segMap, frame.d))`.
    - Update `buildState` to set `sport`, `segmentIndex`, and the transition
      fields from `restProgressAt`.
  - On `r/[token]` page: mirror the same `segMap` + `activeMachineAt` wiring.
  - Confirm `npm run check` passes (0 errors, `sport` now required).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] **6. 2D world morph** — `src/lib/replay/renderer.ts`,
  `src/lib/replay/sports.ts`
  - Export `SPORT_LANE_COLORS: Record<Sport, { light: string; dark: string }>`
    from `sports.ts` with values matching the existing `SPORT_PROFILES` in
    `renderer3d.ts` (snow/asphalt/water colours).
  - In `CourseRenderer.drawLane`, gate the water band gradient opacity, ripple
    sine, and wake sine on `sport === 'rower'`; use `SPORT_LANE_COLORS` for
    the flat fill colour for skierg/bike lanes.
  - In `CourseRenderer.render`, pass `state.sport` through to `drawLane` and
    `drawAvatar`.
  - In `drawAvatar`, when `state.transitionPhase != null`, pass `s = 0`
    (frozen pose) and render the rest countdown pill.
  - Confirm single-sport replays (`/replay/1001`) render identically (no
    visual regression).
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] **7. 3D three-avatar model** — `src/lib/replay/renderer3d.ts`
  - Change `liveAvatar: Avatar` and `ghostAvatar: Avatar` to
    `liveAvatars: Record<Sport, Avatar>` and `ghostAvatars: Record<Sport, Avatar>`.
  - In the constructor, iterate `['rower', 'skierg', 'bike']` and call
    `SPORT_PROFILES[s].make(...)` for each; add all groups to the scene;
    set `visible = false` except the initial sport.
  - Add `lastRenderedSport: Sport` field.
  - Implement `switchAvatarTo(sport)`: toggle visibility of all six groups;
    call `liveWake.reset()` and `ghostWake.reset()`.
  - Add `WakeTrail.setColor(c: number | null)`: update all segment material
    colours; hide all segments when `c === null`.
  - Implement `switchGroundTo(sport, theme)`: update `groundMesh` material
    to `SPORT_PROFILES[sport].groundColor(theme)` and `opacity`.
  - In `render()`, call `switchAvatarTo` and `switchGroundTo` when
    `state.sport !== lastRenderedSport`.
  - In `render()`, when `state.transitionPhase != null`: animate the active
    avatar with frozen phase; interpolate ground colour between `transitionFrom`
    and `transitionTo` profiles; update label sprite with rest countdown.
  - In `applyTheme()`: call `recolorAccent` for all three live and three ghost
    avatar groups.
  - Update `destroy()` to dispose all six avatar groups.
  - Confirm `npm run build` keeps `three` in its lazy chunk.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [ ] **8. Gauge re-baseline** — `src/components/MetricGauge.svelte`,
  `src/routes/replay/[id]/+page.svelte`
  - Add `axisLabel?: string` prop to `MetricGauge`; render
    `{label}{axisLabel ?? (unit ? ` · ${unit}` : '')}`.
  - On Replay_Page:
    - Replace `sportTheme = $derived(themeFor(detail.sport))` with
      `sportTheme = $derived(themeFor(activeSport))`.
    - Add `paceGaugeUnit = $derived(activeSport === 'bike' ? '/1000m' : '/500m')`.
    - Add `paceGaugeDisplay`: for bike, format `frame.pace * 2` as pace, strip
      `/500m`; for row/ski, use `fmtPace(frame.pace)` stripped.
    - Add `paceGaugeRange = $derived(paceRangeForSegment(segMap, activeSegIdx, strokes))`
      where `paceRangeForSegment` returns sport-appropriate `{ min, max }`.
    - Pass `unit={paceGaugeUnit}` and `display={paceGaugeDisplay}` and
      `min/max` from `paceGaugeRange` to the pace `MetricGauge`.
  - Confirm the cadence gauge already re-labels via `sportTheme.cadenceUnit`
    (no additional change needed if step above updates `sportTheme`).
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] **9. Rest-interval transition (Replay_Page)** —
  `src/routes/replay/[id]/+page.svelte`
  - Detect when the engine reaches `segMap[k].endT` (work-interval end) and
    the next segment has `restBefore > 0`.
  - Drive a `restOffset` counter using a `requestAnimationFrame` loop (separate
    from the engine) that advances at wall-clock rate (not scaled by `speed`).
  - Set `transitionPhase = restOffset / segMap[k+1].restBefore` and pass to
    `buildState`.
  - When `restOffset >= restBefore`, stop the rest loop and signal the engine
    to resume; `transitionPhase` becomes absent.
  - On seek/scrub past a segment boundary: skip the rest animation (hard cut,
    per Req 7.5).
  - Under `prefers-reduced-motion`: skip the rest rAF loop entirely; hard-cut
    immediately.
  - _Requirements: 7.1, 7.2, 7.5, 7.6_

- [ ] **10. i18n** — `src/lib/locales/*.ts` (all six)
  - Add to all six locale files:
    - `replay.multiErg`
    - `replay.restInterval`
    - `replay.segmentMachine`
    - `replay.multiErgNote`
  - Run `npm run validate:locales` → 0 missing keys.
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] **11. Leaderboard and ghost scope fences** —
  `src/routes/replay/[id]/+page.svelte`, `src/lib/leaderboard.ts` (or caller)
  - Add `!detail.isMultiErg` guard to the `canPublish` derived value.
  - In `filteredCandidates`, filter out sessions where `c.isMultiErg === true`
    when `detail.isMultiErg` is true.
  - Add `machine` column to the interval breakdown table for MultiErg workouts
    (conditional on `detail.isMultiErg`, sourced from `split.machine`).
  - Add `replay.multiErgNote` info banner to the replay page when `isMultiErg`.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] **12. E2E smoke test** — `tests/e2e/multierg.spec.ts`
  - Navigate to `/replay/1012` in demo mode.
  - Assert `replay.multiErg` badge visible.
  - Seek to BikeErg segment: assert pace unit reads `/1000m`, cadence reads `rpm`.
  - Seek to RowErg segment: assert pace unit reads `/500m`, cadence reads `spm`.
  - Scrub to rest after segment 0: assert rest overlay (`replay.restInterval`)
    visible.
  - Assert "Publish" button absent.
  - _Requirements: 8.6, 11.5_

- [ ] **13. Full quality gate** — all files
  - `npm run check` → 0 errors.
  - `npm run build` → succeeds; `three` stays in its lazy chunk.
  - `npm run test` → all green including new unit tests (tasks 1, 3).
  - `npm run validate:locales` → 0 missing keys.
  - `npm run test:e2e` → all green including task 12; existing
    `/replay/1001`, `/replay/1003`, `/replay/1004` pass unchanged.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
