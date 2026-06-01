# Requirements Document: Sport-Aware 3D Replay

## Introduction

The 3D replay view (`.kiro/specs/3d-replay-view/`) shipped with a single avatar
and environment: a low-poly **rowing scull on water**, rendered regardless of
the workout's sport. rowplay's data model, however, covers three Concept2
machines — **RowErg**, **SkiErg**, and **BikeErg** — and the 2D renderer, gauges,
and analytics are already sport-aware (`src/lib/replay/sports.ts`). A SkiErg or
BikeErg session therefore replayed in 3D as a rowing boat, which is misleading.

This follow-up makes the 3D scene **sport-aware**: the avatar (athlete + machine)
and the ground/environment are selected from the workout's `sport`. It is purely
a presentation change to `CourseRenderer3D` plus the one constructor call that
builds it; there are **no** changes to the engine, server, data model, the
`RenderState` seam, or the 2D renderer.

## Glossary

- **Renderer_3D**: The existing `CourseRenderer3D` (`src/lib/replay/renderer3d.ts`).
- **Sport**: The `Sport` union (`'rower' | 'skierg' | 'bike'`) from `src/lib/types.ts`.
- **Avatar_3D**: The per-lane athlete + machine mesh group placed on the lap circle.
- **Sport_Profile**: Per-sport scene + animation tuning (avatar builder, ground,
  cadence cycle, bob/roll, trail).
- **Replay_Page**: The route `src/routes/replay/[id]/+page.svelte`.
- **Reduced_Motion**: The OS `prefers-reduced-motion: reduce` setting.

## Requirements

### Requirement 1: Sport-Selected Avatar

**User Story:** As an athlete, I want my 3D replay avatar to match the machine I
used, so that a SkiErg or BikeErg session does not appear as a rowing boat.

#### Acceptance Criteria

1. WHEN a `rower` workout is replayed in 3D THEN Renderer_3D SHALL render the
   existing rowing scull (hull, seated rower, two sweeping oars) unchanged.
2. WHEN a `skierg` workout is replayed in 3D THEN Renderer_3D SHALL render a
   standing skier on skis with two poles that double-pole.
3. WHEN a `bike` workout is replayed in 3D THEN Renderer_3D SHALL render a
   cyclist on a two-wheeled frame whose wheels and cranks turn.
4. The live and ghost lanes SHALL use the same sport avatar, the ghost remaining
   translucent and shadowless.

### Requirement 2: Sport-Selected Environment & Cadence

**User Story:** As an athlete, I want the 3D environment and motion to suit the
sport, so the scene reads as snow/road rather than always water.

#### Acceptance Criteria

1. WHEN the sport is `rower` THEN the ground SHALL remain translucent rolling
   water with a foam wake, exactly as before.
2. WHEN the sport is `skierg` THEN the ground SHALL be opaque snow, flat (no wave
   displacement), with a spray trail.
3. WHEN the sport is `bike` THEN the ground SHALL be opaque asphalt, flat, with
   no trail.
4. Per-sport animation SHALL be driven by the existing distance-based stroke
   phase, with a sport-appropriate distance-per-cycle so cadence reads correctly.
5. Hull roll SHALL apply to water sports only; bob amplitude SHALL be tuned per
   sport.

### Requirement 3: No Regressions, Theming & Accessibility Preserved

**User Story:** As a maintainer, I want the sport change to inherit all existing
3D behaviour, so quality tiers, theming, reduced-motion, and disposal still work.

#### Acceptance Criteria

1. The per-lane accent (`--live` / `--ghost`) and light/dark theme recolour SHALL
   continue to apply across all three avatars.
2. Decorative motion (waves/wake and the per-stroke animation) SHALL be
   suppressed under Reduced_Motion for every sport; user-driven lap motion stays.
3. Quality tiers, dpr cap, single-draw-per-`render()`, and full GPU disposal SHALL
   be unchanged.
4. `three` SHALL remain imported only in `renderer3d.ts` (lazy chunk preserved).
5. Navigating between workouts of different sports SHALL rebuild Renderer_3D for
   the new sport (the workout-change `$effect` already calls `setRenderer`).
6. No new user-visible strings are introduced; sport names stay untranslated.
