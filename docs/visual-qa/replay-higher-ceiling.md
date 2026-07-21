# Replay higher-ceiling visual QA

This note records rendered-frame evidence for the authored-athlete and venue
composition pass on draft PR #171. It is a visual acceptance record, not a
substitute for the motion/contact regression suite.

## Current correctness pass — contact-constrained mechanics (2026-07-22)

This pass supersedes the PROMPT 9 athlete-led contact policy below. Authored
clips still supply the base performance and the RowErg elbow plane. SkiErg uses
the shared reference-backed sagittal elbow marker, BikeErg uses the mechanical
knee marker, and rigid sport equipment is the terminal authority. The V4 hero root now
reports `userData.replayV4Architecture = "clip-contact-constrained"`.

| Sport   | Current mechanical contract                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BikeErg | Both shoes remain on mechanically opposed pedals. Each knee selects one continuous rider-forward branch of the hip/pedal sphere intersection; saddle height retains visible flexion through bottom dead centre.                                                                                              |
| RowErg  | Each palm terminates on its own rigid inboard scull grip. The hands remain uncrossed and outside the torso; neither a synthetic wide bar nor palm-led oar motion is present.                                                                                                                                 |
| SkiErg  | Each pole is a rigid 1.55 m link. The basket plants steeply, remains fixed while the skier advances, releases by 29% of the cycle, lifts through recovery, and converges continuously on the next catch. The hand stays on the pole-tip sphere and the elbow stays on its sagittal flex-to-extension branch. |

The correction is protected across dense full cycles: 256-step BikeErg knee
branch/continuity sampling, 128-step RowErg palm/contact/torso-clearance
sampling, and 256-step SkiErg rigid-pole/plant/contact/continuity sampling. V3
procedural fallback contacts and the 2D shared timing path remain covered too.
The SkiErg suite additionally checks the 80°/23° plant-to-pole-off shaft
envelope, early elbow flexion, near-extension at release, exact hand/grip
closure, and a zero-weight previous-anchor → next-anchor handoff at the start
of final approach.

The technique landmarks come from [Concept2's SkiErg technique](https://www.concept2.com/training/skierg-technique),
[Concept2's double-pole guidance](https://www.concept2.com/blog/skierg-technique),
and the on-snow timing and joint-angle measurements in
[Stöggl and Holmberg](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00978/full).

Moving acceptance used the SkiErg demo at both 0.5× and 1×. Canvas 2D kept
both baskets clear of the snow through the free-flight recovery and converged
on the next plant without a vertical drop. WebGPU/Ultra showed the V4 athlete
plant, load, finish beside the thighs, release, and recover without a backwards
horizontal arm flip. A clean dev-server restart produced no runtime diagnostics
during the final pass.

## Historical — PROMPT 9 clip-primary arm architecture (superseded)

The following section records the prior experiment and is retained only as
diagnostic history. Its athlete-led grips, synthetic RowErg bar, stretchable
ski poles, and `clip-primary-athlete-led` marker are no longer the runtime
policy.

### Rejected hybrid (root cause of “ridiculous arms”)

The skinned V4 hero previously:

1. sampled a sparse 9-key technique clip;
2. aligned the pelvis;
3. rewrote every arm/leg chain with two-bone IK whose **bend plane was dominated
   by hidden V3 procedural elbows** (oracle weight 0.82 rower / 0.88 ski);
4. **forced the hand bone to the equipment world quaternion**, corkscrewing the
   forearm when grip orientation changed.

That made elbows chicken-wing, flip, or park ahead of the grip line even when
palm–handle distance was millimetre-perfect.

### Replacement

| Layer            | Behaviour                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clip             | Denser biomechanical row/ski cycles in `rigV4.ts` (late arm draw; double-pole press arc). Baked into `static/replay-assets/rowplay-athlete-v4.glb`. |
| Bend plane       | **Clip elbow/knee only** — V3 elbow markers are never consulted by V4.                                                                              |
| Hand position    | Contact IK within limb reach (standard equipment lock).                                                                                             |
| Hand orientation | **Limited slerp** (~12°) — never a forced equipment quaternion.                                                                                     |
| Feet             | Full sole frame lock (no forearm twist chain).                                                                                                      |
| Ski poles        | Hands own the arc; poles follow hands. Planted tips stay on snow with stretchable shafts — no tip-sphere hand projection.                           |
| Diagnostics      | `setDiagnosticMode`: `clip-only`, `clip-pelvis`, `clip-hands`, `full`, `wireframe`, `unlit`, …                                                      |

Architecture marker on the hero root: `userData.replayV4Architecture = "clip-primary-athlete-led"`.

### Athlete-led equipment (structural, not constant tuning)

The previous soft-contact path still allowed **0.85 m** hand translation, so
equipment paths continued to generate arm pose via two-bone IK. That is rejected.

**Now:**

| Limb           | Policy                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Arms (row/ski) | Pure clip when residual &gt; 4.5 cm; soft orient ≤8°.                  |
| Arms (bike)    | Firmer bar lock (reach IK, clip bend plane).                           |
| Legs           | Equipment lock with clip bend plane.                                   |
| Grips          | **Follow** skinned palms after each V4 update (`syncEquipmentToHero`). |

RowErg **Option 1 Concept2**: single handle bar appears when V4 is active; dual
oars hide so they cannot own the arm solve. Ski poles stretch from hero palms
to tips without re-solving arms.

### Follow-up clip densification (PROMPT 9 carry-on)

- **Row clip:** 14 keys; forearm stays near-straight through leg drive and body
  open; elbow draw only after ~clip t=0.30 (finish deep flexion).
- **Ski clip:** 14 keys; nearly straight arms at high reach; modest load flex;
  continuous recovery without T-pose wings.
- **Motion graph:** row `armDraw` pulse delayed to `drive * 0.62` (was 0.45);
  handle blend reweighted legs/torso-first so equipment grips match late-draw
  arms. Both pure and `*Into` sample paths updated.
- Assets rebuilt: `rowplay-athlete-v4.glb` / `.usdz` / contract.

### Movement references (public technique, not third-party mocap files)

- Concept2 technique library (indoor rowing stages; SkiErg double-pole).
- British Rowing / World Rowing sculling posture stills.
- FIS / cross-country double-poling coaching stills.

No third-party mesh, scan, or licensed mocap clip was imported.

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

1. Replace the visible 3D body shells with one project-authored skinned GLB:
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

### Follow-up — v2 joint and pole-contact correction

The first authored package still had a visible mechanical failure in two
high-salience action poses: its limb profile widened toward the elbow because
the authored local axis was reversed, and a planted SkiErg basket continued to
follow the moving hand instead of the snow. Both faults were corrected in the
repository-owned `rowplay-rigs-v2.glb` package and the same contact-driven rig.

For RowErg, v2 defines local `-Z` as the proximal end and local `+Z` as the
distal end, compacts the shell overlap, and adds an authored elbow flex cuff.
The deepest pull therefore reads as a continuous upper arm, elbow, and forearm
rather than a reversed bulb or a detached sphere. For SkiErg, the shaft, grip,
and basket now share a true common axis; after course placement, a second solve
holds each basket at its deterministic catch-course contact through the loaded
press while preserving exact hand-to-grip and grip-to-tip lengths.

Focused renderer evidence covers deep RowErg flex and multiple fully planted
SkiErg poses with the loaded v2 package, including rigid hardware alignment,
contact height, course-anchor stability, and live/ghost-safe asset fitting.
The current in-app browser pass was captured on the real WebGPU stage at
`/replay/1001` and `/replay/1003`; the broader screenshot matrix below remains
the release-level visual record.

### Follow-up — stable shadows and smooth performance shells

The next real-stage review found three remaining credibility defects: a noisy
deprecated shadow path, two grounding systems visible at once, and a visible
flat-shaded/planar treatment that made the rider read as a blocky figurine.
High and Ultra now use a single VSM directional map with a compact,
sport-specific frustum snapped in light-space texels. The visible sun uses the
same key vector, decorative and transparent layers no longer receive the native
map, and the live fallback contact mark hides whenever that map is active.

The v2 pack was rebuilt with shared smooth normals, denser anatomical profiles,
rounded kit trim, smoother BikeErg tyre/frame/saddle/pedal hardware, and more
responsive fabric/skin material separation. The current motion review also
tests a full RowErg stroke for hand-to-torso clearance and the SkiErg load phase
for near-stationary planted baskets while the body advances. The focused
regression suite covers those state-space constraints; the browser pass at
`/replay/1001`, `/replay/1003`, and `/replay/1004` reviewed the resulting
WebGPU/Ultra frames before this draft update.

## V4 production athlete acceptance — 2026-07-20

The production pass replaces the visible segmented athlete with the reviewed
local `rowplay-athlete-v4.glb`: one skinned mesh, 19 bones, independent
RowErg/SkiErg/BikeErg clips, and a deterministic post-clip contact solve. V3
sport equipment remains visible and authoritative; a V4 load or validation
failure still exposes V3/procedural 3D before the outer Canvas fallback.

The first actual WebGPU frame caught a pale mannequin, shoulder sockets, an
oversized head shell, flat rear lighting, and an almost direct-rear camera. The
accepted pass corrects the glTF vertex-colour transfer to linear space, uses a
matte brand-indigo kit, buries the closed shoulder/hip roots, tapers the torso,
arms, wrists, palms, and head, adds a flush waistband/shorts value and thumb
forms, removes the visor-like face trim, and uses sport-specific true
three-quarter camera lines with restrained camera fill/rim.

Same-viewport paired inputs—not screenshots judged in isolation—record the
visible change:

- [RowErg baseline / V4](higher-ceiling/v4/row-baseline-v4-comparison.jpg)
- [SkiErg baseline / V4](higher-ceiling/v4/ski-baseline-v4-comparison.jpg)
- [BikeErg baseline / V4](higher-ceiling/v4/bike-baseline-v4-comparison.jpg)

Temporal contact sheets cover the real WebGPU/Ultra stage in motion:

- [RowErg catch, drive, finish, and recovery](higher-ceiling/v4/row-v4-motion.jpg)
- [SkiErg reach, plant, press, release, and recovery](higher-ceiling/v4/ski-v4-motion.jpg)
- [BikeErg opposed pedal cycle](higher-ceiling/v4/bike-v4-motion.jpg)

The in-app browser review also ran all three sports at 1×, 2×, and 8×. At 1×,
Row hands remain on the crossed scull grips without entering the pelvis shell;
Ski baskets hold their deterministic course point while the body advances
through the loaded press; Bike hands remain on the bar while soles follow the
same opposed crank graph that drives the drivetrain. The fast modes remain
navigation controls, not claims of natural-speed biomechanics.

Pre-Blender real-stage V4 evidence:

| Sport   | Desktop dark Ultra                                     | Mobile light Ultra                                     |
| ------- | ------------------------------------------------------ | ------------------------------------------------------ |
| RowErg  | [frame](higher-ceiling/v4/row-desktop-dark-ultra.jpg)  | [frame](higher-ceiling/v4/row-mobile-light-ultra.jpg)  |
| SkiErg  | [frame](higher-ceiling/v4/ski-desktop-dark-ultra.jpg)  | [frame](higher-ceiling/v4/ski-mobile-light-ultra.jpg)  |
| BikeErg | [frame](higher-ceiling/v4/bike-desktop-dark-ultra.jpg) | [frame](higher-ceiling/v4/bike-mobile-light-ultra.jpg) |

The pre-Blender RowErg record also has a
[desktop light Ultra frame](higher-ceiling/v4/row-desktop-light-ultra.jpg).
These WebGPU captures remain evidence for the stage, camera, sport equipment,
and runtime contact system, but they predate the current Blender-authored skin
and must not be used as visual proof of that newer surface.

## Blender-authored V4 surface refresh — 2026-07-21

The production V4 surface is now generated in Blender 5.2 from the reviewed
repository script `scripts/build-replay-athlete-v4-blender.py`. It uses no
downloaded model, scan, likeness, avatar generator, texture, or external
request. The Node build remaps Blender's joint order onto the canonical 19-bone
V4 skeleton, adds the three deterministic technique clips and contact metadata,
and exports the final GLB.

[Open the full nine-frame Blender deformation sheet](higher-ceiling/v4-blender/v4-blender-contact-sheet.jpg).

| Sport   | Early phase                                                 | Drive / load                                                | Late phase                                                  |
| ------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| RowErg  | [frame 1](higher-ceiling/v4-blender/v4-blender-rower-1.jpg) | [frame 2](higher-ceiling/v4-blender/v4-blender-rower-2.jpg) | [frame 3](higher-ceiling/v4-blender/v4-blender-rower-3.jpg) |
| SkiErg  | [frame 1](higher-ceiling/v4-blender/v4-blender-skier-1.jpg) | [frame 2](higher-ceiling/v4-blender/v4-blender-skier-2.jpg) | [frame 3](higher-ceiling/v4-blender/v4-blender-skier-3.jpg) |
| BikeErg | [frame 1](higher-ceiling/v4-blender/v4-blender-bike-1.jpg)  | [frame 2](higher-ceiling/v4-blender/v4-blender-bike-2.jpg)  | [frame 3](higher-ceiling/v4-blender/v4-blender-bike-3.jpg)  |

The studio sheet intentionally isolates mesh shape, skinning, and base-clip
deformation. It does not apply the runtime analytic hand/foot solve or render
sport equipment, so it is not presented as final handle, pole, or pedal contact
evidence. The earlier real-stage WebGPU sheets above remain the product-context
record, and automated renderer tests cover the post-clip contact constraints.
The current in-app browser worker exposed no WebGL/WebGPU context, so this pass
does not mislabel a Canvas fallback capture as current 3D proof.

Studio review rejected three intermediate candidates: floating collar and
joint rings, centreline thigh cones that spiked under hip flexion, and broad
pelvis caps that emerged as a skirt. Follow-up Blender passes then pinched
elbows/knees, narrowed the clavicle shelf, replaced mitten thumbs with grip
wedges, and **cleaned the head for high/ultra tiers**: removed floating brow/
eye/mouth tubes, eliminated the continuous brow ridge that cast a black
"visor" shadow, replaced full-circumference hair lofts (which wrapped a dark
band across the face) with a short crown ellipsoid, and soft-blended the
jersey into the neck so VSM shadows no longer pick up a collar hoop. The
accepted mesh uses continuous smooth arm and leg lofts, buried uncapped
shoulder/hip roots, graduated parent-child weights, a clean skull + crown
hair, sealed grip/thumb forms, footwear uppers/soles/laces, vertex-colour kit
construction, and one matte physical material. The result remains stylized and
generic
while removing the stacked-block and detached-joint language of the procedural
fallback.

The checked GLB is 564,712 bytes: one indexed skinned primitive, 7,204 vertices,
13,724 triangles, 19 bones, 30 reviewed topology components, one material, zero
textures, and three clips / 60 tracks. Two clean Blender-to-GLB builds were
byte-identical at SHA-256
`1cce28920c3735a3f8504d117af3cbbbbac7f9f4c072e7b8e0f662bc9817bbc2`.
The checked USDZ derivative is 1,272,704 bytes at SHA-256
`7a6b5701293b49bef5bd80a2c0fdc7d681303a49f7a243d816988f167142a932`;
the generated contract SHA-256 is
`76f28df4ce1cba6768a553e41ffce26d6b79625b36f3110f1c3d35e834775262`.
Blender 5.2 repeat USDZ containers are not byte-identical, so USDZ acceptance
remains semantic `USDLoader` validation rather than silent byte normalization.

## Earlier V3/fallback capture matrix

All files below are under `higher-ceiling/final/` and were captured from the
in-app browser against the real demo routes before V4 promotion. They remain
the broader V3/environment/fallback matrix; the V4 evidence above is the
current production-athlete acceptance record.

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
- The asset is a compact stylized skinned sports illustration, not a scanned or
  photoreal person. It deliberately does not infer a recorded athlete's body,
  clothing, appearance, technique, or location.
- The accepted frames have only P3 visual constraints. The missing release
  evidence above remains an open P1 documentation/acceptance item while the PR
  is a draft; the project-root `design-qa.md` records that distinction.

## Current draft verification — 2026-07-20

The current V4 draft was checked in the in-app browser against the real demo
routes at 1440×1024 and 390×844. WebGPU/Ultra was reported for RowErg, SkiErg,
and BikeErg in dark desktop, light Row desktop, and light mobile captures. Each
sport was played at 1×, 2×, and 8×; route changes reset transport to 1×.

- **RowErg:** the shared graph stages leg drive, body opening, late arm draw,
  hands-away, and recovery. The V4 palms remain on the oar grips, the inboard
  assembly stays forward of the pelvis, and the bent elbows remain outside the
  torso silhouette through the reviewed stroke.
- **SkiErg:** both pole assemblies remain rigid and phase-readable. Loaded
  baskets are reconstructed from their deterministic course anchor after body
  and course motion, so the athlete advances while the planted tips stay almost
  stationary; mobile framing moves toward rear-three-quarter to preserve the
  paired-pole pixel budget.
- **BikeErg:** hands remain on the bar, feet remain on opposed pedals, and the
  rider's knees, ankles, pelvis, shoulders, and head follow the shared circular
  graph. Positive wheel rotation and the matching crank/road cues remain the
  mechanically correct forward direction; reversing them would create the
  backwards-cycling defect.
- **Lighting and shadows:** the browser pass showed one stable world key and
  contact shadow rather than the earlier random-looking dual grounding. Camera
  fill/rim only model the skinned athlete and do not cast a competing map.

Automated evidence protects the parts a frame cannot prove: the exact 1.5 cm
palm/sole tolerance and 0.5° terminal orientation tolerance, deterministic
same-time seeks, fixed segment lengths, 128-phase pole readability, planted-tip
course drift, live/ghost independence, reduced motion, WebGPU/WebGL selection,
V4→V3→procedural→Canvas fallback, disposal, and asset provenance. This remains
canonical generic technique synchronized to Concept2 timing—not measured
athlete biomechanics or motion capture.
