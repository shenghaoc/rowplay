# Design Document: Replay Animation Upgrade

## Overview

Both the 2D (`renderer.ts`) and 3D (`renderer3d.ts`) replay renderers previously
advanced animation phases per render call, which made everything animate roughly
2× too fast on 120 Hz displays and caused the 3D camera's damping stiffness to
vary with refresh rate. This upgrade introduces a shared, wall-clock-based motion
system and substantially enriches both renderers' visual effects while improving
performance on weak hardware.

## Shared foundation — `motion.ts`

A new module `src/lib/replay/motion.ts` provides pure, DOM-free helpers shared by
both renderers:

- **`clampDt(ms)`** — converts raw frame deltas to clamped seconds (max 100 ms),
  preventing phase teleport on background-tab return.
- **`dampFactor(rate, dt)`** — frame-rate independent exponential smoothing:
  `1 - e^(-rate·dt)`, so the same `rate` converges at the same wall-clock speed
  at 30, 60, or 120 fps.
- **`warpStrokePhase(phase, driveFrac)`** — remaps a continuous stroke phase so
  the drive is quick and the recovery slow, matching real erg rhythm. The drive
  occupies the first `driveFrac` (default 0.4) of each cycle but is remapped
  onto the first half of the output, so `cos(warped)` swings catch→finish fast
  and eases back through recovery.
- **`strokeSurge(phase)`** — hull surge offset for a warped phase: checks at the
  catch, peaks at the finish, returns −1..1.
- **`catchEvents(prev, next)`** — counts cycle-boundary crossings between two
  phases, with seek-suppression for large jumps.
- **`METERS_PER_CYCLE`** — distance per full stroke/pedal animation cycle per
  sport (rower: 11 m, skierg: 8 m, bike: 5 m). Stroke cycles are now driven by
  distance travelled rather than time.
- **`ParticlePool`** — allocation-free SoA particle system for splash/spray
  effects. Fixed capacity, swap-remove on expiry, gravity integration.
- **`PerfGovernor`** — watches frame deltas during playback and steps down sticky
  degradation levels. Calibrates against the device's own steady-state refresh
  interval so 30 Hz monitors and iOS Low Power Mode rAF throttling are never
  mistaken for GPU overload.

## 2D renderer changes (`renderer.ts`)

- **Hull surge** — avatar position oscillates with `strokeSurge`, checking at the
  catch and accelerating through the drive.
- **Splash particles** — `ParticlePool`-driven droplets spawn at each catch event
  (fixed-size pools, allocation-free).
- **Parallax ripple layers** — three concentric ripple polylines at different
  speeds and amplitudes, static under reduced motion.
- **Layered strokes replace `shadowBlur`** — per-frame canvas `shadowBlur` glows
  (the slowest canvas operation) are replaced with layered stroke passes, so the
  2D view is both richer and faster on weak machines.

## 3D renderer changes (`renderer3d.ts`)

- **Stroke-synced hull surge** — same `strokeSurge` drives the 3D boat/bike
  position along the track.
- **Arms for rower and skier** — articulated arm meshes animate with the stroke
  cycle (oars sweep against travel, blades bury at the waterline; skier poles
  plant ahead and pull back). Corrected pre-existing oar-sweep and pole-swing
  direction bugs.
- **Wave trains** — three interfering sine-wave trains with sun glint on glossier
  water, replacing the single displacement.
- **V-wake** — dispersing V-shaped wake trail behind the avatar, with seek/backward
  guards to prevent artefacts during scrub.
- **Instanced catch spray and buoy lines** — one draw call each, replacing
  per-particle draw calls.
- **Chase camera** — frame-rate-independent damping via `dampFactor`, three-quarter
  framing, and speed-aware FOV zoom. Camera pop at pause eliminated.
- **`PerfGovernor` integration** — watches frame deltas and steps down pixel ratio
  (2 → 1.5 → 1), then water displacement and spray. Calibrates first against the
  device refresh interval.

## Reduced motion

All new decorative motion (splash, spray, surge, waves, FOV zoom) is suppressed
under `prefers-reduced-motion`, matching the existing contract.

## Files changed

| File                                | Change                                       |
| ----------------------------------- | -------------------------------------------- |
| `src/lib/replay/motion.ts`          | New — shared animation helpers               |
| `src/lib/replay/motion.test.ts`     | New — unit tests for all motion helpers      |
| `src/lib/replay/renderer.ts`        | Surge, splash, ripples, layered strokes      |
| `src/lib/replay/renderer3d.ts`      | Arms, waves, V-wake, spray, camera, governor |
| `src/lib/replay/renderer3d.test.ts` | Medium-tier and governor integration tests   |
| `docs/usage.md`                     | Replay section updated                       |
| `src/lib/locales/*.ts`              | In-app guide updated in all 6 locales        |
