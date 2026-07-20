# Design Document: Replay Motion-System Rebuild

## Decision

Three.js remains the renderer. Replacing it would discard established WebGPU,
WebGL, lazy-loading, and contact-safe fallback work without providing an
authored character rig or better choreography. The replacement is a hybrid
motion architecture:

```text
logged cadence / time / distance / pace / power
                 ↓
            StrokePose timeline
                 ↓
        shared ReplayMotionGraph
                 ↓
  authored V4 clip (base human performance)
                 ↓
  deterministic contact / IK correction pass
                 ↓
         3D skin + shared 2D pose frame
```

The motion graph owns canonical technique timing and expressive phase curves.
It is deterministic and pure, so a scrub selects the same pose as playback.
The data owns cadence, stroke boundaries, pace, distance, and restrained effort
weighting. It does not own, and is never presented as owning, measured force,
joint, handle-path, pressure, or body-shape data.

## Playback modes

The replay starts at 1× because that is the only default at which a normal
stroke rate visibly reads as human technique. Existing faster transport speeds
remain race-navigation controls. Their displayed progress is still data-exact;
visual acceptance evaluates 1×, 2×, and 8× separately instead of judging a
high-speed review as a claim of natural biomechanics.

## Motion graph

`motionGraph.ts` converts `StrokePose` into a sport-specific `ReplayMotionFrame`.
It uses phase-native, C1-continuous curves and explicit contact-state windows
rather than a sequence of independently settled scalar stages. The frame
contains a common pelvis/spine/head/shoulder rhythm plus sport-specific body,
limb, equipment, plant, and velocity cues. It is a shared input to both
renderers; Canvas retains its own art direction but not a separate technique
interpretation.

RowErg runs through catch compression, leg-led acceleration, delayed body open,
late arm draw, hands-away, body-over, and slide. SkiErg runs reach, pre-load,
velocity-matched plant, loaded press, release, and upright recovery. BikeErg
runs continuous opposed pedal loading with coordinated pelvis shift, shoulder
counter-rotation, head stabilization, and ankle articulation.

## V4 rigged asset

V4 is a compact local glTF with a generic athletic skeleton and skin weights.
It has authored canonical clips, not a recording of an athlete. At runtime an
`AnimationMixer` samples clip time from the motion graph / `StrokePose` instead
of free-running from `requestAnimationFrame`; this makes replay time, seeking,
and ghost comparison reproducible. V4 permits only reviewed local animations,
skins, and optional local material maps. Its provenance document records every
byte and source.

After sampling, the renderer applies its existing analytic contact knowledge:
hands attach to RowErg grips or bike bars, feet attach to plate/pedals, oars
remain at oarlocks, and SkiErg baskets pass through explicit free → plant →
loaded → release contact states. IK adjusts only what it must; it no longer
generates the complete human performance from end-effector positions.

The production replay now installs the reviewed V4 skin over the hidden
contact-safe rig after the local asset validates. V3 static athlete/equipment
geometry and the existing procedural rig stay intact as validated 3D fallbacks;
Canvas stays the stable outer fallback. A failed request, parser, skeleton,
clip, or contact-metadata check therefore cannot blank the replay.

The native handoff preserves this same ownership boundary. The GLB remains the
web runtime artifact; USDZ is generated from the GLB for RowPlay Studio and is
validated as a portable skinned derivative, not as a second animation runtime or
a separate remodelled athlete.

## Non-goals

- Reconstructing a user’s actual technique from Concept2 data.
- Scans, likenesses, generic-avatar downloads, or generated human identity.
- Removing existing WebGPU, WebGL, V3, or Canvas fallback behavior.
- Adding third-party runtime asset delivery.
