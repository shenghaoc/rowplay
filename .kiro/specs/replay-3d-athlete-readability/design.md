# Design Document: Replay Figure and Motion Readability

## Overview

This pass preserves the existing replay engine, shared sport-kinematics poses,
two-bone contact solvers, WebGPU/WebGL factory, ghost flow, and performance
governor. It replaces the weak visual layer around those systems and tunes the
stage that presents it.

The target is a deliberately stylized low-poly athlete, not photorealism. Broad
faceted masses, strong body-plane color blocking, and a rear three-quarter
camera are more useful at replay scale than ears, fingers, or other geometry
that projects to less than a pixel.

The 2D BikeErg keeps its mechanically correct clockwise crank/wheel sign. Its
former backward read came from temporal aliasing and visual symmetry: four
identical spokes and two feet orbited an invisible crank. An explicit layered
drivetrain, opposing pedals, chain cue, and asymmetric valve/chevron markers
make the signed direction perceptually stable at 1× through 8×.

## Procedural body language

The torso uses explicit elliptical rings for waist, rib cage, chest, back, and
shoulder transitions. Unlike a rotational lathe squashed in depth, the ring
mesh authors width and depth independently and forms one watertight silhouette.
The lane accent colors the primary jersey mass; a dark trapezoid yoke defines
the upper back without the former ellipsoid backpack effect.

Arms and legs use six axial rings with an exaggerated muscle belly and an
elliptical cross-section. They retain the renderer's unit-+Z placement contract,
so existing allocation-free two-bone positioning remains authoritative. Hands,
shoes, head, and helmet are consolidated into bold forms sized for the camera.
Mid-value slate kit, lighter skin, flat shading, and near-zero metalness keep
planes readable in both themes.

## Sport-specific construction

- **RowErg:** shorten the inboard grip path and rigid arm chain while preserving
  contact; broaden the shoulder mass; separate knees laterally; use visible
  skin knees/calves against dark shorts and the accent hull.
- **SkiErg:** add explicit shoulder caps; bend elbows down/out instead of using
  a horizontal wing hint; widen paired hand targets; thicken poles; shorten and
  neutralize skis while retaining accent tips.
- **BikeErg:** build down, seat, top, head, chain-stay, and seat-stay tubes between
  shared endpoints; broaden shoulders and bars; consolidate the helmet; retain
  exact bar, saddle, and opposed-pedal contacts.

## Presentation

The 3D stage grows to 420 px on desktop and 360 px on mobile, with bounded extra
height for ghost comparison. Sport-specific cameras move closer and farther to
the side, use a 42-degree base lens with at most two degrees of speed breathing,
and aim near the athlete instead of several metres down-course. Chase damping
increases with measured speed so 4x/8x playback does not leave the camera far
behind.

Two camera-relative directional lights complement the world sun and hemisphere
light. They do not cast shadows, so their cost is stable across quality tiers,
and they keep the athlete readable through every course heading. Telemetry
sprites use a compact translucent pill instead of a dominant opaque card.

The chase camera frames the actual midpoint and a continuous live-biased average
course tangent of live and ghost athletes on comparison replays, then derives
uncapped pullback from their visible course separation and the current lens.
The bias prevents opposite-course tangents from cancelling or snapping the
camera near a half-lap gap. Narrow RowErg framing includes the full oar span;
reduced motion keeps the static three-quarter composition while disabling lens
breathing and moving camera interpolation.

## Effects and contrast

Wake marks are distance-sampled low-opacity discs with bounded scale and no
depth writes. This prevents high-speed frame sampling from merging square
quads into an opaque polygon. SkiErg poles use distinct near/far neutral values
and wider grip/tip paths, while RowErg uses neutral thighs, visible knees, and a
separate seat mass. Sport-specific footwear/equipment values remain distinct
from water, snow, and asphalt in both themes.

## Ghost and performance

Live and ghost athletes still construct once. All pose scratch vectors and
quaternions remain reused. Transparent ghost materials disable depth writes,
which prevents near and far limbs from incorrectly masking one another while
preserving the existing opacity and no-shadow treatment.

## Verification

Three.js tests retain contact and fixed-length sweeps through 128 poses, and add
checks for torso cap winding, semantic luminance separation, explicit shoulders,
ghost depth writes and FOV-aware mobile comparison framing at ordinary,
near-half-lap, and half-lap progress separations, a human RowErg grip envelope,
two-pole SkiErg projection, bounded wake marks, connected bike-frame endpoints,
and clip-safe athlete size at the real 1140x420 desktop and 390x360 mobile
stages. The 2D tests assert signed clockwise rotation, opposing pedals, exact
leg contact, and far/frame/near paint order. Browser review covers all three
sports at rest and in motion, normal/high speed, and dark presentation.

## Out of scope

- Imported GLTF characters, scans, likenesses, textures, or customization.
- Biomechanical reconstruction not present in Concept2 stroke data.
- Facial animation, cloth simulation, or post-processing outlines.
- Changes to replay controls or recorded motion timing.
