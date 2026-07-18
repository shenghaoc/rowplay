# Replay higher-ceiling visual QA

This note records rendered-frame evidence for the authored-athlete and venue
composition pass on draft PR #171. It is a visual acceptance record, not a
substitute for the motion/contact regression suite.

## Source visual truth

- Art direction:
  [replay art-direction triptych](higher-ceiling/reference/replay-art-direction.png)
- Baseline head: `fcd5573ea565bcde21bf1eecd814e3b5109a3344`
- Demo routes: `/replay/1001`, `/replay/1003`, `/replay/1004`
- Baseline captures: [baseline](higher-ceiling/baseline/)
- Iteration captures: [iteration 1](higher-ceiling/iteration-1/),
  [iteration 2](higher-ceiling/iteration-2/), and
  [iteration 3](higher-ceiling/iteration-3/)
- Accepted final captures: [final](higher-ceiling/final/)

The art direction is a stylized sports-broadcast presentation: a broad regatta
basin at golden hour, a groomed Nordic stadium in an asymmetric alpine valley,
and a dusk velodrome with selective practical lighting. It is intentionally
illustrative and does not reconstruct a recorded location, weather, or athlete.

## Baseline diagnosis

Captured in the in-app browser before editing the renderer.

### Athlete modelling

1. **SkiErg exposes the core character problem most clearly.** The spherical
   head and hair cap, bright cylindrical joints, isolated pelvis, and uniform
   limb tubes read as a wooden mannequin. Shoulders do not emerge from the rib
   cage, the waist does not carry into the pelvis, and the pole-side arm can
   collapse into the torso from the rear three-quarter view.
2. **RowErg has credible timing but an incoherent body-to-craft ratio.** The
   athlete appears assembled on top of the shell instead of seated inside one
   connected rig. Hands, knees, and the narrow torso are visually lost against
   the oars and finish checker even though their contact solves are correct.
3. **BikeErg reads as a rider hovering over a frame diagram.** The pelvis/saddle
   support is weak, cylindrical arms merge with the bars, the spherical helmet
   and head flatten direction, and the wheels/frame carry more silhouette weight
   than the athlete.
4. **At mobile scale the anatomy fails before the mechanics do.** Detached
   joint caps and narrow tubes become dots and lines; paired limbs and wrist/
   ankle transitions disappear.

### Environment composition

1. All three 3D environments disclose the same circular construction. Horizon,
   trees, architecture, lights, wall panels, stands, and course marks are
   concentric and evenly sampled, so the chase camera sees a toy-diorama ring
   with nearly invariant parallax.
2. RowErg's complete tree belt and buoy necklaces close the basin into a bowl;
   SkiErg's mountain/tree ring removes the sense of a valley opening; BikeErg's
   continuous wall/canopy/panel repetition makes the venue feel like a carousel.
3. The one generic contact ellipse does not match a hull, two skis, or two tyre
   patches. Equipment therefore appears pasted above the surface.
4. Low-tier scenery is sparse without becoming composed. Ultra adds density,
   but the repeated radial grammar remains visible and the subject is still
   weaker than the background pattern.

### Camera, light, and value hierarchy

1. The rear three-quarter camera is directionally useful, but the athlete is
   too small in the 2D overview and its 3D silhouette has insufficient plane and
   value separation to justify moving the camera closer.
2. Dark BikeErg kit, saddle, limbs, and track collapse into one value family;
   light SkiErg snow, poles, and pale ground compress depth in the opposite
   direction.
3. Uniform venue lighting creates structure without composition. Light pools,
   landmark emphasis, and authored negative space are missing.

## Highest-impact changes

1. Replace the visible 3D body shells with one project-authored low-poly GLB:
   coherent torso/pelvis/head planes, embedded joint transitions, grip wedges,
   and directional shoes. Drive independent live/ghost instances from the
   existing contact-locked kinematic targets.
2. Recompose each venue into deterministic authored sectors, clusters, gaps,
   and one unique landmark. Keep the circular course mechanically authoritative
   while hiding its repetitive construction from the replay camera.
3. Retune sport-specific grounding, subject values, and final chase framing
   only after the new silhouette and venue composition are visible together.

## Iteration history

### Iteration 1 — SkiErg authored silhouette

Compared the
[baseline SkiErg frame](higher-ceiling/baseline/ski-3d-desktop-dark-paused.jpg)
with the
[SkiErg silhouette comparison](higher-ceiling/iteration-1/ski-reference-comparison.png),
then refined the authored shells
through the intermediate `authored-shells`, `v2`, `v3`, closer-camera, and
characteristic-pose captures.

The three largest defects were:

1. First-fit limbs inherited the procedural segment scale twice and became
   oversized. Runtime fitting now preserves the authored segment overlap while
   fitting only the cross-section to each exact kinematic bone.
2. Spherical elbow and knee caps still disclosed the mannequin construction.
   Authored tapered shells now overlap across the solved joints; the old caps
   are hidden only after the GLB validates and installs.
3. The SkiErg athlete remained too small and pale against the snow. The chase
   rig is closer, the full-sleeve Nordic kit and gloves establish a separate
   value frame, and the torso extends into the pelvis instead of ending at a
   floating cap.

Accepted for sport adaptation: the frame reads as one skier with two planted
skis, two visible poles, connected shoulders/hips, and unchanged contact-locked
motion. Venue depth remained intentionally deferred to iteration 3.

### Iteration 2 — RowErg/BikeErg adaptation and 2D parity

Compared the SkiErg-approved shell contract against the
[RowErg authored frame](higher-ceiling/iteration-2/row-3d-desktop-dark-authored.jpg),
[BikeErg authored frame](higher-ceiling/iteration-2/bike-3d-desktop-dark-authored.jpg),
and the existing Canvas view.

The three largest defects were:

1. RowErg still read as a body sitting on a generic purple capsule. The authored
   hull and blade shells are now fitted into the old geometry bounds, retaining
   oarlock, blade-depth, grip, seat, and footplate contact truth.
2. BikeErg's rider and frame had competing primitive weights. Authored aero
   tyres, tapered frame tubes, saddle, pedals, helmet, shoes, and athlete shells
   now share one visual language while the crank and wheel signs remain
   independent and mechanically correct.
3. Symmetric wheel spokes could still create a backwards-cycling illusion in
   Canvas even with correct crank math. The accepted 2D design keeps
   distance-locked clockwise wheels, a rigid 180-degree crankset, asymmetric
   valve/chevron direction cues, and oppositely travelling surface marks; the
   focused 2D renderer suite protects that signed convention.

Accepted for venue composition: both 3D adaptations preserve their exact
contacts and read as sport-specific equipment rather than a shared pod.

### Iteration 3 — Venue sectors, grounding, lighting, and camera

Compared the
[RowErg](higher-ceiling/iteration-3/row-reference-comparison.png),
[SkiErg](higher-ceiling/iteration-3/ski-reference-comparison.png), and
[BikeErg](higher-ceiling/iteration-3/bike-reference-comparison.png) paired
inputs after capturing the real Ultra/WebGPU stage.

The three largest defects were:

1. Repeated complete rings made every venue a toy donut. Row now opens toward
   water and clusters its regatta complex on one bank; Ski frames a clear valley
   with two massifs; Bike uses two grandstand sectors, open tunnels, selective
   panel banks, a scoreboard, and a service building.
2. The universal black ellipse pasted every athlete onto the course. It is
   replaced by a hull reflection strip, paired ski footprints, or paired tyre
   contact patches, each following the live or ghost rig's staged surge.
3. The chase view initially spent the whole vertical lens on the course. Final
   sport rigs retain the athlete and all critical equipment while admitting the
   asymmetric horizon, skyline, trees, venue landmark, and authored negative
   space. Alpine peak height was reduced after the paired comparison showed the
   first massif swallowing the sky.

Accepted for final matrix capture: the three venues no longer expose one shared
radial construction, Low/Ultra still change density rather than composition,
and contact-locked motion remains authoritative.

## Accepted capture matrix

All files below are under `higher-ceiling/final/` and were captured from the
in-app browser against the real demo routes.

| Sport   | 2D desktop dark                                                | 3D desktop dark Ultra                                                | 3D desktop light Ultra                                                | 3D mobile light Low                                                |
| ------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| RowErg  | [paused](higher-ceiling/final/row-2d-desktop-dark-paused.jpg)  | [paused](higher-ceiling/final/row-3d-desktop-dark-ultra-paused.jpg)  | [paused](higher-ceiling/final/row-3d-desktop-light-ultra-paused.jpg)  | [paused](higher-ceiling/final/row-3d-mobile-light-low-paused.jpg)  |
| SkiErg  | [paused](higher-ceiling/final/ski-2d-desktop-dark-paused.jpg)  | [paused](higher-ceiling/final/ski-3d-desktop-dark-ultra-paused.jpg)  | [paused](higher-ceiling/final/ski-3d-desktop-light-ultra-paused.jpg)  | [paused](higher-ceiling/final/ski-3d-mobile-light-low-paused.jpg)  |
| BikeErg | [paused](higher-ceiling/final/bike-2d-desktop-dark-paused.jpg) | [paused](higher-ceiling/final/bike-3d-desktop-dark-ultra-paused.jpg) | [paused](higher-ceiling/final/bike-3d-desktop-light-ultra-paused.jpg) | [paused](higher-ceiling/final/bike-3d-mobile-light-low-paused.jpg) |

Additional state evidence:

- Canvas motion and signed BikeErg direction:
  [moving BikeErg](higher-ceiling/final/bike-2d-desktop-dark-moving.jpg).
- Independent live/ghost rigs, labels, contact footprints, and comparison
  framing:
  [SkiErg ghost](higher-ceiling/final/ski-3d-desktop-dark-ultra-ghost.jpg).
- Moving 3D comparison and characteristic pull/recovery change:
  [moving SkiErg ghost](higher-ceiling/final/ski-3d-desktop-dark-ultra-moving-ghost.jpg).
- Full-view design comparisons:
  [RowErg](higher-ceiling/iteration-3/row-reference-comparison.png),
  [SkiErg](higher-ceiling/iteration-3/ski-reference-comparison.png), and
  [BikeErg](higher-ceiling/iteration-3/bike-reference-comparison.png).
- Focused athlete comparison:
  [SkiErg](higher-ceiling/iteration-1/ski-reference-comparison.png).

The selected in-app browser reported WebGPU for the accepted matrix. Explicit
WebGPU-to-WebGL downgrade, direct WebGL construction, missing/corrupt GLB
fallback, reduced-motion static poses, and Canvas fallback are protected by the
focused loader/renderer suites. The browser QA surface is intentionally
read-only and was not modified to falsify a WebGL or reduced-motion screenshot.

This remains a draft release record. Canvas light/mobile, 3D mobile dark,
HUD-hidden grayscale/dark silhouette, and operating-system reduced-motion
frames still need capture before the specification's complete release matrix
can be checked off. Automated evidence protects those mechanics, but is not
claimed as aesthetic evidence.

## Known compromises

- Environments remain texture-free procedural geometry under the existing
  provenance contract. They now match the art direction's composition and value
  hierarchy, but not its photographic cloud, snow, water, or asphalt detail.
- RowErg uses a wider equipment-safe chase frame than SkiErg/BikeErg so neither
  blade is cropped on a 390×360 stage.
- The asset is a generic low-poly sports illustration. It deliberately does not
  infer a recorded athlete's body, clothing, appearance, technique, or location.
- The accepted frames have only P3 visual constraints. The missing release
  evidence above remains an open P1 documentation/acceptance item while the PR
  is a draft; the project-root `design-qa.md` records that distinction.
