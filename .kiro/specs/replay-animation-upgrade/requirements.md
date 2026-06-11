# Requirements Document: Replay Animation Upgrade

## Introduction

The 2D and 3D replay renderers advanced animation phases per render call, causing
frame-rate-dependent animation speed and inconsistent visual quality across
devices. This upgrade introduces a shared wall-clock motion system, enriches both
renderers with stroke-synchronised effects, and adds adaptive performance
governance so cheap hardware stays safe at high quality settings.

## Glossary

- **Motion_Module**: The new `src/lib/replay/motion.ts` — pure, DOM-free
  animation helpers shared by both renderers.
- **Renderer_2D**: `src/lib/replay/renderer.ts` — the Canvas 2D course renderer.
- **Renderer_3D**: `src/lib/replay/renderer3d.ts` — the Three.js course renderer.
- **Perf_Governor**: `PerfGovernor` class in `motion.ts` — adaptive degradation
  watchdog.
- **Reduced_Motion**: The OS `prefers-reduced-motion: reduce` setting.
- **Sport**: `Sport` union (`'rower' | 'skierg' | 'bike'`).

## Requirements

### Requirement 1: Frame-Rate Independent Motion

**User Story:** As an athlete, I want the replay animation to look the same
whether my display runs at 30 Hz, 60 Hz, or 120 Hz, so that the experience is
consistent across devices.

#### Acceptance Criteria

1. WHEN a frame delta is received THEN Motion_Module SHALL convert it to seconds
   and clamp it to a maximum of 100 ms via `clampDt`.
2. WHEN smoothing a value toward a target THEN Motion_Module SHALL use
   exponential decay (`dampFactor`) so that the same rate converges at the same
   wall-clock speed regardless of frame rate.
3. WHEN advancing stroke phases THEN both renderers SHALL use wall-clock dt, not
   per-frame increments.

### Requirement 2: Stroke-Synchronised Animation

**User Story:** As an athlete, I want the replay avatar's motion to match the
stroke rate of the workout, so that the animation feels like a real rowing/skiing
session.

#### Acceptance Criteria

1. WHEN the workout progresses THEN the stroke phase SHALL advance by distance
   travelled (one animation cycle per `METERS_PER_CYCLE` metres), not by time.
2. WHEN mapping phase to avatar position THEN the renderer SHALL use
   `warpStrokePhase` so the drive is quick and the recovery slow, matching real
   erg rhythm.
3. WHEN computing hull surge THEN the renderer SHALL use `strokeSurge` to offset
   the avatar: checking at the catch, peaking at the finish.

### Requirement 3: 2D Visual Enhancements

**User Story:** As an athlete, I want the 2D replay to show splash, ripples, and
hull movement, so that the scene feels alive.

#### Acceptance Criteria

1. WHEN a catch event occurs in 2D THEN Renderer_2D SHALL spawn splash particles
   via `ParticlePool` (allocation-free, fixed capacity).
2. WHEN the scene is rendering THEN Renderer_2D SHALL draw three parallax ripple
   layers at different speeds and amplitudes.
3. WHEN rendering glows THEN Renderer_2D SHALL use layered strokes instead of
   canvas `shadowBlur` for performance.

### Requirement 4: 3D Visual Enhancements

**User Story:** As an athlete, I want the 3D replay to show realistic rowing/ski
mechanics, water effects, and camera movement, so that the 3D view is immersive.

#### Acceptance Criteria

1. WHEN a rower or skier workout is rendered in 3D THEN Renderer_3D SHALL show
   articulated arms with correct oar/pole sweep directions.
2. WHEN the water surface is rendered THEN Renderer_3D SHALL draw three
   interfering wave trains with sun glint.
3. WHEN the avatar moves forward THEN Renderer_3D SHALL render a dispersing
   V-wake trail with seek/backward guards.
4. WHEN catch spray and buoy lines are rendered THEN Renderer_3D SHALL use
   instanced geometry (one draw call each).
5. WHEN the camera tracks the avatar THEN Renderer_3D SHALL use frame-rate-
   independent damping, three-quarter framing, and speed-aware FOV.

### Requirement 5: Adaptive Performance Governance

**User Story:** As an athlete on a low-end device, I want the replay to
automatically reduce visual fidelity rather than dropping frames, so that
playback stays smooth.

#### Acceptance Criteria

1. WHEN frames consistently exceed the time budget THEN Perf_Governor SHALL step
   down degradation levels: pixel ratio first (2 → 1.5 → 1), then water
   displacement and spray.
2. WHEN calibrating THEN Perf_Governor SHALL measure the device's own steady-
   state refresh interval, so 30 Hz monitors and iOS Low Power Mode rAF
   throttling are not mistaken for GPU overload.
3. WHEN a single slow frame occurs THEN Perf_Governor SHALL NOT trigger
   degradation (grace period).

### Requirement 6: Reduced Motion Compliance

**User Story:** As an athlete with motion sensitivity, I want all decorative
animation suppressed when I enable reduced motion, so that the replay is
accessible.

#### Acceptance Criteria

1. WHEN `prefers-reduced-motion: reduce` is active THEN both renderers SHALL
   suppress splash, spray, surge, ripples, wave displacement, and FOV zoom.
2. WHEN reduced motion is active THEN the scene SHALL remain legible with static
   avatars and course elements.
