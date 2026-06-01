# 2D replay course — visual upgrade

## Introduction

PR #48 adds an **optional, lazy-loaded 3D replay view** (`CourseRenderer3D`,
Three.js) while the 2D `CourseRenderer` stays the **default**. The 2D renderer is
currently a flat abstraction — a horizontal rule per lane, a thin progress line
with a 1.2px sine wake, and a circular bib. Next to the 3D scene it reads as a
placeholder. This spec upgrades the **default** 2D canvas into a polished,
broadcast-style race strip so the out-of-the-box experience holds its own,
**without adding dependencies** and **without changing the renderer's public
API**.

Scope is purely the Canvas 2D drawing in `src/lib/replay/renderer.ts` (plus the
two call sites passing one new optional `RenderState` field). The replay engine,
server, data model, and controls are untouched.

## Glossary

- **Course strip** — the full-width, ~150px-tall (190px with a ghost) `<canvas>`
  the replay page draws the race onto.
- **Lane** — one horizontal track centred at a y-coordinate; `YOU` (live) always
  present, `GHOST` optional and visually subordinate.
- **Avatar** — the marker at the head of a lane's progress (today a flat circle
  "bib"); upgraded to a glossy sport-aware **pod**.
- **Accent** — the lane colour: `--live` for YOU, `--ghost` for GHOST (mirrored
  in `COLORS_LIGHT/DARK`).
- **Phase** — the per-lane animation accumulator advanced from stroke rate
  (`spm`); already present as `phase`/`ghostPhase`.

## Requirements

### Requirement 1: A materially richer course scene

**User Story:** As an athlete watching the default 2D replay, I want a scene with
depth, water, and a recognisable racer so the replay looks finished, not like a
wireframe.

#### Acceptance Criteria

1. The renderer SHALL paint a depth background (sky→water vertical gradient) on
   the strip instead of a single flat fill.
2. Each lane SHALL render a **water band** centred on its line, with animated
   surface ripples while playing.
3. The progress trail SHALL read as an illuminated wake — an accent stroke with a
   soft outer glow and trailing speed streaks whose length scales with pace —
   rather than a 3px line.
4. The avatar SHALL be a glossy rounded **pod** with a top highlight and a cast
   shadow on the water, carrying a sport silhouette, rather than a flat filled
   circle.
5. A small **bow wave** (foam crescent) SHALL be drawn just ahead of the avatar.
6. Distance ticks SHALL render as styled course markers (buoy caps at the
   waterline) and the finish SHALL render as a checkered **gate**, not a 4px-wide
   bar.
7. The pace/percent label and the lane name tab (`YOU`/`GHOST`) SHALL be
   restyled as rounded, accent-tinted chips consistent with the new scene.

### Requirement 2: Stable public API and both consumers keep working

**User Story:** As the maintainer, I want the upgrade to drop into the existing
call sites with no behavioural change.

#### Acceptance Criteria

1. The `CourseRenderer` constructor, `resize(cssWidth, cssHeight)`, and
   `render(state, playing, themeName)` signatures SHALL be unchanged.
2. `RenderState` and `AvatarState` SHALL remain backward-compatible; any new
   field SHALL be **optional** and the renderer SHALL degrade gracefully when it
   is absent (so `/r/[token]` keeps working unchanged).
3. Both consumers — `src/routes/replay/[id]/+page.svelte` and
   `src/routes/r/[token]/+page.svelte` — SHALL continue to compile and render
   without layout changes (same canvas heights: 150 solo / 190 with ghost).

### Requirement 3: Theme correctness and palette-test integrity

**User Story:** As a user in dark mode, I want the new scene to look native in
both themes.

#### Acceptance Criteria

1. The renderer SHALL select light/dark colours from `COLORS_LIGHT`/`COLORS_DARK`
   exactly as today, including a paused re-render on theme toggle.
2. `COLORS_LIGHT.live/ghost` and `COLORS_DARK.live/ghost` SHALL continue to equal
   `--live`/`--ghost` in `app.css`; `renderer.test.ts` SHALL stay green.
3. Any new colour fields SHALL be added to **both** palettes and chosen to read
   well on each theme; no hard-coded `#fff`/`#000` that breaks in dark mode.

### Requirement 4: Reduced-motion respected

**User Story:** As a user with `prefers-reduced-motion: reduce`, I want the data
legible without decorative animation.

#### Acceptance Criteria

1. WHEN reduced motion is active, THEN surface ripples, avatar bob, speed-streak
   shimmer, and any stroke-pulse effect SHALL be suppressed (static pose).
2. The course, trail, avatar, labels, and finish SHALL remain fully legible in
   the static pose (the replay itself — user-initiated — still advances).
3. Decorative motion SHALL only advance while `playing` is true, as today.

### Requirement 5: Performance and disposal

**User Story:** As a user on a modest device, I want smooth playback and no leaks.

#### Acceptance Criteria

1. The renderer SHALL keep the existing devicePixelRatio cap (≤2) and per-frame
   `clearRect` redraw model.
2. Rendering SHALL avoid unbounded per-frame allocation growth (gradients/paths
   are created from primitives, not retained); no timers, listeners, or
   `requestAnimationFrame` loops SHALL be introduced in the renderer (the engine
   still owns the clock).
3. The new work SHALL be a bounded number of canvas operations per frame
   (O(lanes) + O(ticks)); no image/network/font loading.

### Requirement 6: Sport-aware avatar (graceful)

**User Story:** As an athlete, I want the racer to reflect my machine.

#### Acceptance Criteria

1. The avatar pod SHALL show a sport silhouette — rower, skierg, or bike —
   derived from an **optional** `RenderState.sport`.
2. WHEN `sport` is absent, THEN the renderer SHALL draw a neutral marker (no
   crash, no empty pod).
3. Sport names SHALL NOT be translated or drawn as text; the silhouette is a
   vector glyph only.

### Requirement 7: Ghost parity and hierarchy

**User Story:** As a user racing a ghost, I want both lanes to look first-class
while keeping YOU visually dominant.

#### Acceptance Criteria

1. The ghost lane SHALL receive the same scene treatment (water, wake, pod, bow
   wave) in its accent colour.
2. The ghost SHALL read as subordinate to YOU (e.g. slightly reduced opacity /
   no inner "you" dot), preserving today's hierarchy.
3. Ghost geometry SHALL keep using `ghost.distFrac`, `ghost.spm`, and
   `ghost.label` exactly as today.

## Non-functional requirements

- **No new dependencies.** Pure Canvas 2D; no Three.js, no images, no fonts
  beyond the existing `Source Code Pro` / `ui-monospace` stack.
- **No engine/server/data changes.** Everything derives from the existing
  `RenderState`.
- The known `state_referenced_locally` check warnings remain acceptable.

## Non-goals

- No 3D, no WebGL (that is PR #48's separate, opt-in renderer).
- No translation of on-canvas `YOU`/`GHOST` labels (unchanged from today).
- No new renderer UI/toggle (the page already owns controls).
- No change to ghost selection, scrubbing, speed, or HR overlay logic.

## Relationship to PR #48

Independent and complementary. This spec targets `CourseRenderer` on `main`'s
public API and does **not** depend on PR #48's `ReplayRenderer` interface
extraction. When #48 merges, the 2D renderer it wraps is simply the upgraded one.
