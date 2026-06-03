# Requirements Document: MultiErg Sport-Switching Replay

## Introduction

The Concept2 **MultiErg** workout type spans multiple intervals, each on a
different machine: an athlete might row 1000 m, then ski 500 m, then bike
2000 m within a single logged result. The Concept2 logbook records a `machine`
field on each interval/split, and a `rest_time` between them while the athlete
physically moves between ergs.

rowplay currently assumes a workout has **one** sport for its lifetime. This
breaks MultiErg in several ways:

1. **Data corruption:** `mapStrokes` applies one `paceDiv` to the whole stroke
   array, but bike pace is per-1000 m vs per-500 m for row/ski — so bike
   segments inside a MultiErg are normalized with the wrong divisor.
2. **Wrong avatar:** both the 2D and 3D renderers pick a single sport at
   construction time. A MultiErg replay shows the wrong machine for every
   interval except the first.
3. **Wrong environment:** the 2D lane and 3D ground are static for the whole
   piece. A rower transitioning to a BikeErg should cross from water to
   asphalt.
4. **Wrong gauges:** `MetricGauge` for pace uses a fixed axis and label. During
   a bike segment the pace is natively per-1000 m; showing it on a per-500 m
   scale pins the needle at the floor.
5. **No rest visualization:** `rest_time` intervals are structurally invisible
   — the scrubber jumps across them with no indication the athlete was idle.
6. **Incorrect leaderboard eligibility:** MultiErg pieces have no single sport
   or distance and should not appear on any sport+distance board.

This spec makes MultiErg a **first-class replay experience**, correcting all
six defects while leaving single-sport replays completely unchanged.

### Dependencies

- **#61 (full-fidelity-data):** per-interval `machine` field on `Split` and
  per-result `rest_time`/`rest_distance` on `WorkoutDetail`. This data is
  already captured in `mapSplits` (`Split.machine`) and `mapResult`
  (`Workout.restTime`). MultiErg requires that every work-interval split carries
  a non-null `machine`. The spec guards defensively if `machine` is absent.
- **#63 (stroke reset boundaries / rawT/rawD):** `mapStrokes` detects interval
  resets and stores `Stroke.rawT` / `Stroke.rawD` (the per-interval wire values
  before cumulative offset). Stroke-to-interval bucketing in this feature relies
  on those reset boundaries.

---

## Glossary

- **MultiErg**: A Concept2 workout whose `splits[]` contain at least two
  distinct non-null `machine` values (e.g. `rower` then `bike`). Detected
  server-side and at the data layer; exposed via `WorkoutDetail.isMultiErg`.
- **Segment**: One work interval inside a MultiErg, characterized by its
  `machine`, cumulative distance range `[segStart, segEnd)`, cumulative time
  range, and `restTime` before the next segment.
- **Segment map**: A precomputed array of `SegmentInfo` objects that maps stroke
  indices to segment, exposes the active `machine` at any distance/time, and
  carries rest-interval boundaries.
- **Active segment**: The segment whose distance range contains `frame.d` at a
  given replay frame; determines the current machine, avatar, environment, and
  gauge scale.
- **Rest interval**: The period between two work segments (duration =
  `split.restTime`). Represented as a synthetic pause on the replay timeline
  with a distinct visual state.
- **Per-segment normalization**: Applying `paceDiv = sport === 'bike' ? 2 : 1`
  individually to each stroke based on its bucketed segment's `machine`, not
  to the whole array with one sport.
- **Time-varying sport**: The active `Sport` computed from `frame.d` at render
  time, not fixed at construction. Replaces `RenderState.sport?: Sport` with
  `RenderState.sport: Sport` derived per-frame.
- **World morph**: The visual transition of the environment (water to snow to
  asphalt in 2D and 3D) at segment boundaries.
- **Transition animation**: A brief animated sequence during rest intervals that
  shows the avatar in an idle/moving state, with the clock running.
- **Gauge re-baseline**: Updating `MetricGauge` `min/max` and the pace axis
  label (`/500m` vs `/1000m`) when the active segment's machine changes.
- **Replay_Page**: `src/routes/replay/[id]/+page.svelte`.
- **Renderer_2D**: `CourseRenderer` (`src/lib/replay/renderer.ts`).
- **Renderer_3D**: `CourseRenderer3D` (`src/lib/replay/renderer3d.ts`).
- **Engine**: `ReplayEngine` (`src/lib/replay/engine.ts`).
- **Frame**: The interpolated `Frame` emitted by the engine each rAF tick.
- **RenderState**: The `RenderState` interface in `renderer.ts`, passed to both
  renderers each frame.

---

## Requirements

### Requirement 1 — Per-Segment Stroke Normalization (Foundation)

**User Story:** As the data pipeline, I want each stroke's pace to be
normalized using its own interval's machine, so that bike segments inside a
MultiErg do not silently produce a pace that is 2x too slow.

This is a **data correctness** requirement. It is a prerequisite for all
rendering requirements and must be implemented first (see tasks.md).

#### Acceptance Criteria

1. WHEN `mapStrokes` processes a stroke array for a workout whose `splits[]`
   contain a non-null `machine` field THEN each stroke SHALL be assigned the
   `machine` of the split that contains it, determined by matching the stroke's
   cumulative position to the split's cumulative distance range.
2. THE assignment SHALL use the same reset-boundary detection already in
   `mapStrokes` (`rawT < prevT` / `rawD < prevD`): a reset at stroke index `k`
   marks the start of segment `k+1`; `splits[k+1].machine` (when present) is
   the machine for strokes from `k+1` onward until the next reset.
3. WHEN a stroke falls within a bike segment THEN its `pace` SHALL be divided by
   `2` (converting per-1000 m to per-500 m) regardless of the workout-level
   `sport`; row/ski segments SHALL use `paceDiv = 1` as today.
4. WHEN `splits[k].machine` is absent or undefined for any segment THEN
   `mapStrokes` SHALL fall back to the workout-level `sport` for that segment,
   so existing non-MultiErg workouts are unaffected.
5. THE updated `mapStrokes` SHALL accept an optional second argument
   `splits: Split[] | undefined` (defaulting to `undefined`) so the calling
   signature in `Concept2Client.getWorkout` can pass `splits` after they are
   mapped, with no change to single-sport callers.
6. Normalization correctness SHALL be covered by Vitest unit tests, including:
   - A three-segment MultiErg fixture (rower then skierg then bike) with known raw
     `p` values and an expected per-segment pace output.
   - A single-sport workout whose output is identical with and without `splits`.
   - The bike-segment boundary: strokes on either side of a reset get the
     correct `paceDiv`.

---

### Requirement 2 — MultiErg Detection and Segment Model

**User Story:** As the data model, I need a structured description of each
segment (machine, distance range, rest duration) so that any consumer can look
up the active sport at any distance or time without reimplementing the
boundary logic.

#### Acceptance Criteria

1. `WorkoutDetail` SHALL gain a boolean field `isMultiErg: boolean`, `true`
   when `splits[]` contains at least two distinct non-null `machine` values.
2. A pure function `buildSegmentMap(splits: Split[]): SegmentInfo[]` SHALL be
   exported from `src/lib/replay/engine.ts` and return an array where each
   element describes one work segment:

   ```ts
   interface SegmentInfo {
     index: number;          // 0-based work-interval index
     machine: Sport;         // machine for this segment
     startD: number;         // cumulative metres at segment start
     endD: number;           // cumulative metres at segment end (exclusive)
     startT: number;         // cumulative seconds at segment start (after rests)
     endT: number;           // cumulative seconds at segment end
     restBefore: number;     // seconds of rest before this segment (0 for first)
   }
   ```

3. A pure function `activeMachineAt(segMap: SegmentInfo[], d: number): Sport`
   SHALL return the machine of the segment whose `[startD, endD)` contains `d`,
   clamping to the last segment for `d >= totalDistance`.
4. A pure function `activeSegmentIndexAt(segMap: SegmentInfo[], d: number): number`
   SHALL return the 0-based index of the active segment at distance `d`.
5. Both pure functions SHALL be unit-tested with the same three-segment fixture
   used in Req 1.6, including boundary cases (exactly at `startD`, exactly at
   `endD`, beyond `totalDistance`).
6. WHEN `splits` are absent or `isMultiErg` is false THEN `buildSegmentMap`
   SHALL return a single-element array covering the full distance with the
   workout's overall `sport`, and `activeMachineAt` SHALL always return that
   sport — single-sport replay is unaffected.

---

### Requirement 3 — Time-Varying Sport in RenderState

**User Story:** As the rendering layer, I want the active machine to be
communicated per-frame so that both 2D and 3D renderers can react to sport
changes without querying the data model themselves.

#### Acceptance Criteria

1. `RenderState.sport` SHALL change from `sport?: Sport` (optional) to
   `sport: Sport` (required), derived per-frame by
   `activeMachineAt(segMap, frame.d)`.
2. `buildState(f: Frame): RenderState` on the Replay_Page SHALL compute
   `sport` from the precomputed segment map on every call, not once at page
   load.
3. The 2D shared view `src/routes/r/[token]/+page.svelte` SHALL also derive
   `sport` per-frame from the segment map; the existing `sport: detail.sport`
   shortcut becomes `activeMachineAt(segMap, frame.d)`.
4. No renderer SHALL be required to change its constructor signature to support
   time-varying sport — the sport is delivered frame-by-frame through
   `RenderState.sport`. The `CourseRenderer3D` constructor still accepts a
   static `sport` used only to initialize the initially-visible avatar geometry
   (see Req 5); the dynamic sport from `RenderState.sport` drives the per-frame
   morph.
5. `buildState` SHALL also carry a `segmentIndex: number` field (the current
   segment index), consumed by the gauge re-baseline logic (Req 6) and the
   transition animation (Req 7).
6. The existing `renderer.test.ts` palette contract SHALL continue to pass
   unchanged since `RenderState` remains backward-compatible at callers that
   previously passed `sport?: Sport` — the new required field is provided by
   `buildState`, not by tests directly asserting on palette values.

---

### Requirement 4 — 2D World Morph

**User Story:** As an athlete watching the 2D replay, I want the lane
environment to switch from water to snow to asphalt as I cross interval
boundaries, so the course strip reflects what I was physically doing.

#### Acceptance Criteria

1. `CourseRenderer.render()` SHALL read `state.sport` each frame and select the
   per-sport lane style (water-tinted band for `rower`, snow-white for
   `skierg`, asphalt-grey for `bike`).
2. THE water band gradient opacity, ripple amplitude, and wake sine wave SHALL
   apply only when `state.sport === 'rower'`; snow and asphalt lanes SHALL
   render with flat fills (no wave displacement) matching the 2D upgrade spec
   (`.kiro/specs/2d-replay-upgrade/`).
3. THE avatar glyph SHALL change at segment boundaries: `drawRower` /
   `drawSkier` / `drawCyclist` dispatched from `state.sport` exactly as today,
   with no additional wiring needed (the dispatch is already on `sport`).
4. At segment boundaries where `state.sport` changes, the lane SHALL transition
   immediately (within one `render()` call) — no fade or morph interpolation is
   required in the 2D renderer. Hard cuts are acceptable because the rest
   interval animation (Req 7) provides visual context.
5. WHEN `state.sport` is absent (shared view, old callers) THEN Renderer_2D
   SHALL fall back to the neutral pod exactly as today — no regression.
6. THE ghost lane, when present, SHALL use the same `state.sport` as the live
   lane; ghost-racing a MultiErg is out of scope (Req 10) but the ghost SHALL
   not crash when sport changes.

---

### Requirement 5 — 3D World Morph

**User Story:** As an athlete watching the 3D replay, I want the avatar mesh,
ground surface, and trail to match the current machine at every moment, so the
3D scene is as faithful as the 2D one.

#### Acceptance Criteria

1. `CourseRenderer3D` SHALL pre-build **all three avatars** (rower, skier,
   cyclist) at construction time and store them, regardless of the starting
   sport, so no GPU rebuild occurs at segment boundaries.
2. At each `render()` call, WHEN `state.sport` differs from the previously
   rendered sport THEN the renderer SHALL:
   a. Hide the previous live avatar group and show the new one.
   b. Switch the live wake trail to the new sport's `trailColor` (or disable
      it if `trailColor === null` for the new sport).
   c. Update the ground mesh material to the new sport's `groundColor` and
      `groundOpacity`, and enable/disable wave displacement accordingly.
3. THE ghost lane SHALL simultaneously switch its avatar to match the live
   sport (both athlete and ghost are always on the same machine at a given
   time, since there is only one live lane).
4. THE avatar swap SHALL be instantaneous (one frame) — no GPU rebuild or
   chunk reload. Visibility toggling (`group.visible`) on the pre-built groups
   is the implementation mechanism.
5. ALL existing 3D behaviours — quality tiers, dpr cap, chase camera, label
   sprites, reduced-motion suppression, `applyTheme`, and full GPU disposal on
   `destroy()` — SHALL remain intact for all three avatar sets.
6. THE active `SportProfile` SHALL be resolved from `state.sport` at each
   `render()` call (not cached from construction), so ground/wake/cadence
   parameters always match the current machine.
7. `THREE` geometry and material disposal on `destroy()` SHALL cover all three
   avatar groups and their respective wakes, not just the initially-constructed
   sport's resources.
8. The `CourseRenderer3D` constructor signature SHALL remain
   `(host, quality, sport)` where `sport` is now used only as the **initial**
   visible sport. The renderer will switch dynamically via `RenderState.sport`.

---

### Requirement 6 — Gauge Re-Baseline

**User Story:** As an athlete watching the gauges during a MultiErg, I want the
pace gauge axis and label to switch to per-1000 m when I enter a bike segment,
so the needle is never pinned at the floor by a wrong scale.

**Tenet:** "Never accept wrong, meaningless representations." A gauge that
misrepresents the current machine is worse than no gauge.

#### Acceptance Criteria

1. `MetricGauge` SHALL accept an optional `axisLabel?: string` prop that
   overrides the `unit` suffix in the label line, so callers can switch
   `/500m` to `/1000m` without changing the component's interface.
2. The Replay_Page SHALL compute `activeSport = activeMachineAt(segMap, frame.d)`
   on each frame and pass to the pace `MetricGauge`:
   - `min` / `max` derived from the per-segment pace range (or sport-appropriate
     defaults when the segment has too few strokes).
   - `unit` = `/500m` for rower/skierg, `/1000m` for bike.
   - `display` = the pace formatted for the active sport: for row/ski use
     `fmtPace(frame.pace)` (the normalised sec/500 m value); for bike multiply
     the normalised pace by 2 before formatting to show the native per-1000 m
     time (e.g. normalised 110 s/500 m displayed as `3:40/1000m`).
3. WHEN the active segment changes THEN the pace gauge SHALL update its
   `min`/`max` and label within the same `render()` tick — no lag frame.
4. The cadence gauge SHALL update its `unit` label between `spm` (rower/skierg)
   and `rpm` (bike) via `themeFor(activeSport).cadenceUnit`.
5. ALL gauge changes SHALL be purely reactive (`$derived`) — no imperative
   calls needed.
6. FOR single-sport workouts the gauge behaviour SHALL be identical to today.

---

### Requirement 7 — Rest-Interval Transition Animation

**User Story:** As an athlete, I want to see a visual representation of the
rest period between intervals, including an idle avatar, so the replay does not
abruptly jump from one machine to the next.

#### Acceptance Criteria

1. WHEN `frame.t` falls within the rest interval between segment `k` and
   segment `k+1` (i.e. `segMap[k].endT <= frame.t < segMap[k+1].startT`)
   THEN the Replay_Page SHALL set `RenderState.transitionPhase` to a value in
   `[0, 1]` representing progress through the rest, and `transitionFrom` /
   `transitionTo` to the leaving and arriving `Sport`.
2. `RenderState` SHALL gain two optional fields:
   ```ts
   transitionPhase?: number;  // 0..1; absent during normal playback
   transitionFrom?: Sport;
   transitionTo?: Sport;
   ```
3. WHEN `transitionPhase` is present THEN Renderer_2D SHALL render:
   a. The course strip using the **leaving** sport's lane style from
      `transitionFrom`.
   b. The avatar pod in the neutral idle pose (the reduced-motion static pose
      of the leaving machine).
   c. A rest banner on the HUD pill: the i18n string `replay.restInterval`
      and the remaining rest seconds (`(1 - transitionPhase) * restDuration`).
4. WHEN `transitionPhase` is present THEN Renderer_3D SHALL:
   a. Keep the leaving avatar visible and stationary (animate with frozen phase,
      equivalent to `avatar.animate(0, true)`).
   b. Linearly interpolate the ground colour between the leaving sport's
      `groundColor` and the arriving sport's `groundColor` using
      `transitionPhase`.
   c. Update the live label sprite with the rest countdown.
5. WHEN `transitionPhase` is absent OR `prefersReducedMotion()` is true THEN
   both renderers SHALL fall back to a hard-cut to the arriving sport at
   `segMap[k+1].startT` with no animation.
6. The engine clock SHALL continue to run during the rest interval at the
   user-selected playback speed — seek and scrub SHALL work normally, and
   pausing during a rest SHALL hold the partial transition state.
7. The rest duration displayed SHALL use `fmtTime(remainingRest)` and be i18n'd
   via `replay.restInterval` in all six locales.

---

### Requirement 8 — Demo MultiErg Fixture

**User Story:** As a developer, I want a demo MultiErg workout available at
`/replay/1012` in demo mode, so that the feature can be verified without a
real Concept2 account.

#### Acceptance Criteria

1. `src/lib/mockData.ts` SHALL include a new static spec with `id: 1012`,
   `sport: 'rower'` (overall, matching the first interval), `isMultiErg: true`,
   and `workoutType: 'MultiErg — Row/Ski/Bike'`.
2. THE fixture SHALL have three work intervals:
   - Segment 0: RowErg, 1000 m, pace approx 1:50/500 m, approx 28 spm, rest 60 s.
   - Segment 1: SkiErg, 500 m, pace approx 2:02/500 m, approx 40 spm, rest 60 s.
   - Segment 2: BikeErg, 2000 m, pace approx 1:55/500 m (normalised;
     approx 3:50/1000 m native), approx 75 rpm.
3. THE fixture's `splits[]` SHALL carry `machine` on each work-interval split
   and `isRest: true` with `machine: undefined` on rest splits.
4. THE fixture's `strokes[]` SHALL be synthesised with per-segment reset
   boundaries (`rawT` / `rawD` reset to 0 at each interval) and per-segment
   correct normalization (bike strokes divided by 2).
5. `mockWorkouts()` SHALL include the summary for `1012` in its list.
6. NAVIGATING to `/replay/1012` in demo mode SHALL produce a working replay
   with all three segments, rest intervals, and correct gauge axes.

---

### Requirement 9 — Internationalization

**User Story:** As a non-English user, I want all new UI strings in my
language, so the feature is fully accessible.

#### Acceptance Criteria

1. THE following new i18n keys SHALL be added to all six locale files
   (`src/lib/locales/en.ts`, `zh.ts`, `de.ts`, `es.ts`, `fr.ts`, `ja.ts`):
   - `replay.multiErg` — badge label for MultiErg workouts (e.g. "MultiErg").
   - `replay.restInterval` — rest countdown overlay (e.g. "Rest · {s}s").
   - `replay.segmentMachine` — machine column header in the interval breakdown
     (e.g. "Machine").
   - `replay.multiErgNote` — explanatory note shown when `isMultiErg` is true
     (e.g. "Sport changes per interval — gauges and scene update automatically.").
2. Sport names (RowErg, SkiErg, BikeErg) SHALL remain untranslated.
3. `npm run validate:locales` SHALL pass with 0 missing keys after the
   additions.

---

### Requirement 10 — Scope Fences

**User Story:** As the product owner, I want the boundaries of v1 clearly
defined in the codebase, so out-of-scope work is not accidentally implemented
and in-scope work is not blocked.

#### Acceptance Criteria

1. MultiErg workouts SHALL be **excluded** from sport+distance leaderboards and
   personal bests. `matchStandardDistance` (or its caller) SHALL guard on
   `isMultiErg === true` and return `null`, preventing the "Publish to board"
   button from appearing.
2. Ghost-racing a MultiErg workout against another MultiErg session SHALL be
   blocked in v1. The compare-mode UI SHALL not offer a MultiErg session as a
   ghost candidate when the live workout is also MultiErg.
3. Constant-pace and file-upload ghost modes SHALL remain available for
   MultiErg replays (they produce single-sport stroke arrays valid for
   comparison).
4. The analysis panels (power curve, HR zones, efficiency-by-rate, interval
   breakdown) SHALL continue to operate on the full stroke array unchanged —
   they are sport-agnostic.
5. The interval breakdown table SHALL display the `machine` column for
   MultiErg workouts, sourced from `split.machine`, using the untranslated
   sport name.

---

### Requirement 11 — Quality Gate

**User Story:** As the maintainer, I want all existing tests to continue
passing and new behaviour to be covered, so the feature ships without
regressions.

#### Acceptance Criteria

1. `npm run check` SHALL produce 0 TypeScript errors. Known
   `state_referenced_locally` Svelte warnings remain acceptable.
2. `npm run build` SHALL succeed with `three` remaining in its own lazy chunk.
3. `npm run test` SHALL pass all Vitest suites, including:
   - New unit tests for `mapStrokes` with multi-machine `splits` (Req 1.6).
   - New unit tests for `buildSegmentMap`, `activeMachineAt`,
     `activeSegmentIndexAt` (Req 2.5).
4. `npm run validate:locales` SHALL pass with 0 missing keys.
5. `npm run test:e2e` SHALL pass, including a new WebKit smoke test that:
   - Navigates to `/replay/1012`.
   - Plays to a point inside segment 2 (BikeErg).
   - Asserts the pace gauge label reads `/1000m`.
   - Seeks back to segment 0 (RowErg) and asserts the pace label reads `/500m`.
   - Scrubs into a rest interval and asserts the rest overlay is visible.
6. EXISTING single-sport replay e2e tests (`/replay/1001`, `/replay/1003`,
   `/replay/1004`) SHALL pass unchanged.
