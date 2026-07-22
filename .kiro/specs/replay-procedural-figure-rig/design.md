# Design Document: Replay Procedural Figure Rig

> Historical scope note (July 2026): This completed procedural baseline remains
> authoritative for articulation, equipment contacts, and the Canvas and 3D
> fallbacks. Its prohibition on repository-owned authored 3D athlete and
> equipment assets is superseded by
> [Replay authored athlete assets](../replay-authored-athlete-assets/design.md).

## Overview

This pass refines the existing procedural athletes instead of replacing the
replay pipeline. The Concept2-derived timeline, shared sport kinematics,
wall-clock engine, sport environments, camera, WebGPU/WebGL factory, and
performance governor remain authoritative.

The modelling goal is not photorealism. It is a strong athletic silhouette with
stable anatomy at replay scale: fixed-proportion two-segment limbs, explicit
elbows and knees, a shaped torso and pelvis, readable head/neck construction,
and restrained kit detail that survives the actual 2D overview and 3D chase
camera.

## Data and representation boundary

Concept2 stroke rows do not contain measured joint positions, posture, body
dimensions, clothing, or appearance. The new figure rig therefore consumes the
same illustrative pose channels already produced by `sportKinematics.ts` and
solves a generic authored body around known equipment contacts.

No downloaded character model, scan, texture pack, body profile, or user image
is introduced. The figure is deterministic procedural geometry and does not
represent an athlete's likeness.

## Shared articulation geometry

`src/lib/replay/figurePose.ts` owns pure, DOM- and Three.js-independent
two-segment articulation helpers. Given a root, target, two authored segment
lengths, and a bend hint, it computes a stable elbow or knee while preserving
the reachable equipment target.

The solver:

- clamps targets outside the reachable annulus to the nearest stable reach;
- preserves the chosen bend side across normal pose stages;
- returns finite output for coincident or nearly straight configurations;
- accepts caller-provided output storage so the animation hot path stays
  allocation-free; and
- is covered by co-located tests for segment lengths, contact, reach limits, and
  continuity.

## 2D figure construction

The Canvas renderer keeps its compact race-board composition but replaces
single-color line figures with layered procedural anatomy:

1. Far-side equipment and limbs.
2. Machine or boat support geometry.
3. Pelvis and shaped torso.
4. Near-side articulated limbs and equipment.
5. Neck, profile head or helmet, hands, and shoes.

Upper and lower limb segments use tapered strokes or compact shaped paths, with
small joint forms at elbows and knees. Skin, kit, hair or helmet, shoes, and a
subdued far-side treatment create depth without depending on splashes or glow.
Paired arms, legs, oars, and poles make the movement readable for all three
sports. RowErg oars remain rigid around their locks; SkiErg keeps both hands on
pole grips; BikeErg uses fixed-length legs around opposed pedals.

Figure bounds inform the nearby telemetry label so the larger silhouette does
not overlap its HUD.

## 3D figure construction

The Three.js scene keeps lightweight primitives and shared materials. Detail is
reallocated toward forms visible at chase-camera distance:

- a shaped torso with shoulder, chest, waist, and pelvis planes;
- explicit deltoid, elbow, and knee forms;
- simplified grip-readable hands and grounded shoes;
- a coherent pelvis-pivoted upper-body chain so torso, shoulders, neck, head,
  helmet, and kit move together;
- back-facing jersey or vest contrast for the actual chase view; and
- sport-specific support cues such as the BikeErg saddle/pelvis connection.

RowErg, SkiErg, and BikeErg use fixed-proportion two-bone chains. End effectors
stay at the existing oar, pole, bar, footplate, boot, and pedal targets; the new
solver determines elbows and knees instead of stretching a unit mesh between
arbitrary endpoints.

Tiny geometry that does not survive replay scale is removed or consolidated so
the stronger anatomy does not materially increase scene complexity.

## Motion and reduced motion

The figure rig maps the existing `RowPose`, `SkiPose`, and `BikePose` outputs; it
does not introduce a second motion timeline or retime recorded cycles. Equipment
contacts remain the primary constraints, with the authored body solving around
them.

Reduced motion continues to suppress decorative bob, surge, particles, surface
motion, and camera breathing. Playback progress and the staged pose remain
visible so the athlete and equipment relationship is still understandable.

## Performance and compatibility

All reusable geometry and materials are created during renderer construction.
Animation methods reuse scratch coordinates, vectors, matrices, and quaternions.
The work does not change the WebGPU-first factory, WebGL fallback, quality tier
contract, ghost path, replay controls, or lazy-loading boundary.

## Out of scope

- Photorealistic skin, cloth, hair simulation, or facial animation.
- User-selectable body shape, clothing, identity, or avatar customization.
- Imported GLTF, motion-capture, scanned, or branded character assets.
- Biomechanical reconstruction from force curves or unprovided joint telemetry.
- A camera, environment, effects, or replay-control redesign.
