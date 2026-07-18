# Design Document: Replay Motion Truth and Sport Kinematics

## Overview

This follow-up keeps the existing wall-clock render loop, Concept2 stroke
timeline, WebGPU-first factory, WebGL fallback, and adaptive quality governor.
It replaces the remaining single-wave "puppet" motion with one pure,
deterministic sport-kinematics layer shared by the 2D and 3D renderers.

The work also corrects replay inputs that directly distort animation: leading
or interval-reset anchor rows must not become phantom strokes, split-derived
cadence must remain continuous when rate changes, normalized BikeErg pace must
stay in seconds per 500 m internally, and demo stroke rows must reflect the
declared cadence rather than a fixed sample count.

## Data boundary

The Concept2 Logbook stroke payload can provide cumulative time and distance,
pace, stroke rate (RPM for BikeErg), and heart rate for each stroke. rowplay
derives watts from normalized pace. The payload does not provide force curves,
handle position, drive length, joint positions, or measured posture.

Accordingly, the replay has two layers:

1. **Motion truth** aligns each valid recorded row to one deterministic cycle,
   while lower-resolution fallbacks integrate cadence continuously.
2. **Authored kinematics** turns that cycle into a plausible, sport-specific
   movement envelope. It is illustrative choreography, not biomechanical
   reconstruction.

## Timeline corrections

`strokeModel.ts` remains the sole pose source for both renderers.

- A row whose time and distance do not advance establishes an anchor and does
  not create a visible cycle.
- Internal pace is seconds per 500 m for every sport, including BikeErg.
- Synthetic entries carry cumulative cycle offsets so a rate change cannot
  jump the phase at a split boundary.
- Real valid stroke rows continue to map one-to-one to cycles.
- Demo strokes are generated one cycle at a time from `dt = 60 / cadence` and
  distance travelled at the current normalized pace.

## Shared sport kinematics

`src/lib/replay/sportKinematics.ts` is pure and DOM-/Three.js-free. Drive
segments use ease-out cubic so the catch punches; recovery uses ease-in-out so
the slide returns controlled. Stage windows deliberately overlap so the stroke
reads as one continuous athletic action rather than three queued puppets.

- **RowErg**: legs drive first, then body swing, then arm draw. Recovery sends
  hands away, brings the body over, and only then rolls the seat forward. Blade
  bury, extraction, and feathering remain continuous.
- **SkiErg**: high reach, pole plant, arm press plus hip/knee compression,
  release, and upright recovery are distinct stages.
- **BikeErg**: crank angle follows the recorded cycle, pedals remain opposed,
  ankle pitch stays bounded, and upper-body motion is restrained.

Renderer mapping is intentionally large enough to read at a glance: seat travel
≈ 0.6 m, oar yaw ≈ 95°, long inboard handle lever so hands move with the seat,
and deep double-pole crunch on SkiErg. Intensity may influence small secondary
cues such as surge or particle energy; it does not change the athlete's claimed
measured range of motion or posture.

## 2D renderer

The 2D race-board layout remains an overview rather than becoming another chase
camera. Athlete scale increases modestly for legibility, while the shared
kinematics drives seat, torso, arms, poles, and pedals.

The lane surface becomes sport-specific:

- RowErg keeps layered water, ripples, blade puddles, and wake.
- SkiErg uses a snow band with groomed grooves and pole-plant plume.
- BikeErg uses an asphalt/velodrome band with curb and lane markings.

Bike wheel roll follows distance rather than crank cadence. Catch particles
remain fixed-capacity and use restrained pose intensity scaling.

## 3D renderer

The procedural athlete remains the production path. Its transforms consume the
same shared kinematics as 2D.

- RowErg feet are solved against boat-space footplate targets, and hands are
  solved from actual oar-handle endpoints. The oars pivot at explicit locks.
- SkiErg hands stay on grips while pole tips plant on the course only during the
  contact stage.
- BikeErg feet remain on opposed pedals, shoes use bounded ankle pitch, and
  wheels roll from distance.

A small camera director keeps the existing chase concept but uses closer,
sport-aware and aspect-aware framing. Both camera position and look target are
frame-rate-independently damped. Reduced motion uses a stable framing path.

## Reduced motion and performance

User-controlled replay progress remains visible. Decorative bob, surge,
particles, surface motion, and lens breathing remain suppressed under
`prefers-reduced-motion`. Static sport surfaces and a readable authored pose
remain visible.

The upgrade reuses existing fixed pools, procedural geometry, lazy 3D loading,
and quality governor. New per-frame allocations and a WebGPU-only rendering
fork are out of scope.

## Out of scope

- Force-curve, handle-path, drag-factor, or joint-telemetry reconstruction.
- A new avatar asset/rig pipeline.
- A WebGPU shader/material redesign.
- New replay controls or user-visible backend choices.
- Replacing the 2D overview with a scrolling camera.
