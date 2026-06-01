# Requirements Document

## Introduction

The 3D replay view adds an optional three-dimensional rendering of the workout
replay, as an alternative to the existing 2D top-down course strip. It is
inspired by the on-water, real-time loop in Concept2's ErgData app, but applied
to **replay**: the full stroke array is known up front, so the scene can be
precomputed and the existing playback clock drives a smooth, interpolated
camera and avatar.

The 2D `CourseRenderer` remains the default and the canonical experience. The
3D view is strictly opt-in, lazy-loaded, and degrades gracefully to 2D when
WebGL is unavailable or the user prefers reduced motion. No server, data, or
engine changes are required: the 3D renderer consumes the same `RenderState`
emitted by `ReplayEngine`, so the two renderers are interchangeable behind one
seam (`renderer.render(...)` in `src/routes/replay/[id]/+page.svelte`).

## Glossary

- **Replay_Engine**: The existing `ReplayEngine` in `src/lib/replay/engine.ts` — a
  rAF clock that emits an interpolated `Frame` via `onFrame`.
- **Render_State**: The existing `RenderState` interface (`{ frame, distFrac, totalDistance, ghost? }`) passed to a renderer each frame.
- **Renderer_2D**: The existing `CourseRenderer` (2D canvas top-down course strip).
- **Renderer_3D**: The new WebGL renderer to be added (`CourseRenderer3D`), consuming the same `Render_State`.
- **Renderer_Interface**: The shared contract both renderers satisfy (`render`, `resize`, `destroy`).
- **Renderer_Toggle**: The user-facing control on the replay page that switches between 2D and 3D.
- **Renderer_Preference**: The persisted user choice of renderer (default 2D).
- **WebGL_Probe**: A capability check that determines whether a WebGL context can be created.
- **Reduced_Motion**: The OS `prefers-reduced-motion: reduce` setting, already read by `Renderer_2D`.
- **Replay_Page**: The route `src/routes/replay/[id]/+page.svelte`.
- **Demo_Mode**: The default no-session environment serving `mockData.ts`.
- **Scene**: The precomputed 3D world (course geometry, water/track, lane markers, finish line).
- **Avatar_3D**: The 3D object representing the live athlete (and, when present, the ghost).

## Requirements

### Requirement 1: Optional, Opt-In 3D Renderer

**User Story:** As an athlete, I want to switch my replay to a 3D view, so that I get a more immersive, ErgData-like experience while keeping the simple 2D view as the default.

#### Acceptance Criteria

1. THE Replay_Page SHALL default to Renderer_2D for all users.
2. THE Replay_Page SHALL display a Renderer_Toggle allowing the user to select 2D or 3D.
3. WHEN the user selects 3D, THE Replay_Page SHALL replace the active renderer with Renderer_3D without reloading the page.
4. WHEN the user selects 2D, THE Replay_Page SHALL restore Renderer_2D without reloading the page.
5. WHEN the active renderer changes, THE Replay_Page SHALL preserve the current playback time, play/pause state, and selected speed.
6. THE Renderer_3D SHALL be functionally interchangeable with Renderer_2D, consuming the identical Render_State without changes to Replay_Engine.

### Requirement 2: Lazy Loading

**User Story:** As a user who never opens the 3D view, I want the app to stay lightweight, so that pages that don't use 3D are not penalized by the 3D library's bundle size.

#### Acceptance Criteria

1. THE Renderer_3D module and its WebGL dependency SHALL be loaded via a dynamic `import()` only when the user first selects 3D.
2. THE 3D dependency SHALL NOT be included in the initial bundle of the Dashboard or the Replay_Page.
3. WHILE the Renderer_3D module is loading, THE Replay_Page SHALL display a loading indicator and continue rendering the current frame in 2D.
4. IF the dynamic import fails, THEN THE Replay_Page SHALL remain on Renderer_2D and display an error message via i18n.
5. WHEN the Renderer_3D module has loaded once, THE Replay_Page SHALL reuse it for subsequent toggles without re-importing.

### Requirement 3: Graceful Fallback and Accessibility

**User Story:** As a user on a device without WebGL or with reduced-motion enabled, I want the replay to still work, so that I am never left with a blank or distressing view.

#### Acceptance Criteria

1. THE Replay_Page SHALL run a WebGL_Probe before attempting to create Renderer_3D.
2. IF the WebGL_Probe fails, THEN THE Renderer_Toggle SHALL disable the 3D option and the Replay_Page SHALL remain on Renderer_2D.
3. THE Renderer_3D SHALL respect Reduced_Motion by suppressing decorative motion (idle water/wake animation), consistent with Renderer_2D's existing behavior.
4. WHILE Reduced_Motion is active, THE Renderer_3D SHALL still reflect data-driven motion (avatar position advancing with playback) because that is user-initiated.
5. THE Renderer_Toggle SHALL be keyboard operable and labeled for assistive technology.
6. IF Renderer_3D throws during initialization or rendering, THEN THE Replay_Page SHALL fall back to Renderer_2D and surface a non-blocking error.

### Requirement 4: Visual Parity With the 2D View

**User Story:** As an athlete, I want the 3D view to show the same information as the 2D view, so that switching views never loses data.

#### Acceptance Criteria

1. THE Renderer_3D SHALL render the live Avatar_3D advancing along the course according to `Render_State.distFrac`.
2. WHERE `Render_State.ghost` is present, THE Renderer_3D SHALL render a second Avatar_3D for the ghost in its own lane.
3. THE Renderer_3D SHALL display the live pace and, when present, the ghost label, equivalent to the 2D bibs.
4. THE Renderer_3D SHALL convey workout progress and the finish line consistent with `Render_State.totalDistance`.
5. THE Renderer_3D SHALL derive all visible state solely from Render_State and the active theme (light/dark), with no additional data fetch.
6. WHEN the theme changes, THE Renderer_3D SHALL update its palette to match, consistent with Renderer_2D.

### Requirement 5: Performance and Resource Management

**User Story:** As a mobile user, I want the 3D view to stay smooth and not drain my battery, so that the experience is enjoyable rather than janky.

#### Acceptance Criteria

1. THE Renderer_3D SHALL precompute static Scene geometry once per workout, not per frame.
2. THE Renderer_3D SHALL cap the device pixel ratio (consistent with Renderer_2D's `min(dpr, 2)`) to limit fill cost.
3. WHEN the replay is paused, THE Renderer_3D SHALL NOT run a continuous render loop beyond what is needed to reflect state or theme changes.
4. WHEN the user switches back to 2D or navigates away, THE Renderer_3D SHALL dispose of its GPU resources (geometries, materials, textures, context) to prevent leaks.
5. THE Renderer_3D SHALL target 60fps on a recent mid-range mobile device for a single-avatar scene and degrade gracefully (lower detail) rather than stalling.

### Requirement 6: Preference Persistence

**User Story:** As a returning user, I want my renderer choice remembered, so that I don't have to re-select 3D every visit.

#### Acceptance Criteria

1. WHEN the user selects a renderer, THE Replay_Page SHALL persist the Renderer_Preference across sessions.
2. WHEN the Replay_Page loads, THE Replay_Page SHALL apply the persisted Renderer_Preference, subject to the WebGL_Probe and Reduced_Motion fallbacks.
3. THE Renderer_Preference SHALL default to 2D for new users.
4. IF the persisted preference is 3D but the WebGL_Probe fails, THEN THE Replay_Page SHALL load in 2D without error.

### Requirement 7: Demo Mode and Testing Compatibility

**User Story:** As a developer, I want the 3D view to work in demo mode and remain testable, so that I can build and verify it without Concept2 credentials.

#### Acceptance Criteria

1. WHEN Demo_Mode is active, THE Renderer_3D SHALL render mock workouts identically to authenticated workouts.
2. THE Renderer_3D selection seam SHALL be unit-testable without a live WebGL context (e.g. behind the Renderer_Interface).
3. THE existing 2D `renderer.test.ts` and replay e2e flows SHALL continue to pass unchanged, since 2D remains the default.
4. THE WebGL_Probe and fallback paths SHALL be exercised by tests that simulate a missing WebGL context.

### Requirement 8: Internationalization

**User Story:** As a non-English user, I want the 3D view's controls and messages in my language, so that the feature is usable.

#### Acceptance Criteria

1. THE Renderer_Toggle labels, tooltips, loading text, and error messages SHALL use `i18n.t()`.
2. THE new strings SHALL be added to all locale files in `src/lib/locales/` (`en`, `zh`, `de`, `es`, `fr`, `ja`).
3. THE sport names (RowErg, SkiErg, BikeErg) rendered in the Scene SHALL remain untranslated.
4. THE new keys SHALL pass `npm run validate:locales`.
