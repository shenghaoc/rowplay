# Replay production athlete visual acceptance

This note records the dedicated 3D athlete visual-quality pass on
`codex/replay-athlete-visual-overhaul`, relative to merge base `da0dc73`. It
replaces the assembled procedural mannequin with a source-backed human surface
while retaining PR #171's **shared technique modules** (`motionGraph`,
`sportKinematics`, Canvas), contacts, equipment, environments, and fallbacks.
V4 **base clip keyframes** in `rigV4.ts` were re-authored on this branch for
finish/grip readability (drive ends stay frozen at 0.38 / 0.34 / 0.5).

## Target and scope

The shipped athlete is a **photoreal-directed generic human**: it uses reviewed
anatomical topology, continuous body volume, facial landmarks, wet-eye optics,
short sports hair, performance clothing, and tiered PBR materials. It is not an
Epic MetaHuman asset, scan, real-person likeness, avatar-generator output, or
user image. Calling it an Epic MetaHuman would be inaccurate and would require a
separately supplied asset with compatible redistribution rights.

The visual target applies across every quality tier. Low retains the complete
human silhouette and regional materials; Medium, High, and Ultra progressively
spend more GPU work on the athlete instead of reserving all visible improvement
for Ultra.

## Diagnosis and correction

The previous V4 surface was built from independent lofted tubes and caps. Its
limbs, shoulders, pelvis, hands, and head read as a toy even when rendered at
high resolution. More pixels could not repair that form.

The replacement:

- retargets one continuous anatomical body from the reviewed Blender source;
- preserves shoulder, elbow, wrist, pelvis, knee, calf, hand, finger, foot, and
  toe volume through the three existing sport clips;
- narrows the upper-arm and forearm radial profiles so the shoulders no longer
  inflate into a toy-like silhouette;
- shapes the forehead, brow, eyelids, cheek, nose, mouth, jaw, ears, and beard
  planes, with separate recessed ocular surfaces, limbal rings, irises, pupils,
  and highlights;
- adds close sports hair with crown lift, a temple fade, and non-uniform colour
  response instead of a smooth helmet;
- assigns matte technical fabric, skin, hair, footwear, trim, eye, and facial
  material roles with progressively richer response by quality tier;
- retains a shallow seated posterior channel and contact-safe elbow clearance
  without changing the shared motion graph; and
- keeps the live and ghost bodies opaque, depth-tested, and independently
  cloned so overlapping body parts cannot disappear through transparency
  sorting.

## Asset provenance

| Field              | Reviewed value                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Anatomical source  | Blender Studio **Human Base Meshes v1.4.1**, male base                                                                                        |
| Creator            | Dan Ulrich / Blender Studio                                                                                                                   |
| Official source    | <https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip>                                       |
| Upstream licence   | CC0-1.0                                                                                                                                       |
| Reviewed subset    | `static/replay-assets/source/rowplay-human-base-male-v1.4.1.blend`                                                                            |
| Extraction         | `scripts/extract-replay-athlete-base-blender.py`                                                                                              |
| RowPlay adaptation | Retargeting, bounded skin weights, rig helpers, facial/eye/hair treatment, sports kit, footwear, vertex colours, clips, build, and validation |
| Distribution       | CC0-1.0 anatomical source plus MIT RowPlay modifications; redistribution permitted                                                            |

The reviewed `.blend` is an audited 2,246,454-byte subset of the official
source and has SHA-256
`1defdfb22b53ce3bd779acfa96278ccfdff17f0e1178fa94967d600a9e27c457`.
The canonical asset and its contract contain no embedded texture, external URI,
runtime image request, scan, likeness, or undocumented download.

## Sealed production inventory

Binary identity is sealed in `static/replay-assets/rowplay-athlete-v4.contract.json`.
Refresh this table only after `vp run build:replay-rig-v4-contract` on the same
artifacts (do not hand-edit digests).

| Artifact                           |      Bytes | SHA-256                                                            |
| ---------------------------------- | ---------: | ------------------------------------------------------------------ |
| `rowplay-athlete-v4.glb`           |  5,069,284 | `03a588681c5a066d4974f6fc695101ecb49a0b77bbbf760baa8dbf2f763c8b24` |
| `rowplay-athlete-v4.usdz`          | 11,830,161 | `2cec944fa12954b78a3f808856f611f4d5fd3689838325c196ab4b41caed337d` |
| `rowplay-athlete-v4.contract.json` |     27,593 | `72b730a7cae727373d590c3cbe529ec3498e334704ce59e3118d95556178dbae` |

The GLB contains one indexed `SkinnedMesh`, 64,200 vertices, 106,256 triangles,
28 deliberate topology components, one continuous human core, one skin, one
portable vertex-colour material, 19 semantic bones, and 32 visual-only grip
helpers. Each hand has one palm cup, four three-segment finger chains, and one
three-segment opposing-thumb chain. The validator rejects a body assembled
from disconnected limb islands, helper hierarchy drift, or a helper without
meaningful checked skin influence.

## Materials and quality tiers

At runtime the reviewed colour regions become eight independent physical
surface roles: skin, jersey, lower kit, footwear, hair, trim, eye, and
face-detail. All tiers use the same geometry, rig, contacts, and technique.

| Tier   | Athlete detail                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Low    | Complete anatomical surface and clean regional colour; no generated maps                                                                     |
| Medium | 128 px deterministic UV albedo, normal, roughness, and relief maps                                                                           |
| High   | 256 px maps with stronger skin, fabric, footwear, hair, and facial response                                                                  |
| Ultra  | 512 px maps plus the strongest skin/specular, fabric sheen, trim/footwear clearcoat, hair response, wet-eye optics, and face-detail response |

Medium+ detail maps are **process-shared** per (quality, role, kind) so live and
ghost lanes reuse the same textures instead of rebuilding Ultra 512² maps twice.

This is a progressive ladder, not a Low-to-Ultra cliff. A denser 169k-vertex,
19.6 MB GLB experiment was also tested and rejected because it produced no
meaningful in-app improvement. The sealed level-one anatomical surface plus
facial and material work gives the better visual result without wasting replay
compute.

## Exact in-app evidence

### Surface / materials acceptance (`a56460b`)

The surface, face, kit, and quality-tier acceptance set is
[`2026-07-25-a56460b`](athlete-v5/in-app/2026-07-25-a56460b/manifest.json),
captured from implementation commit
`a56460b40d9611ee8319ed1566bf62b75ad8dfaa`.

### Motion / grip follow-up (`0565a58`)

After the surface capture, finish and grip work was re-authored and unit-tested
(`be0886a`–`0565a58`): RowErg hands finish at the lower chest, multi-axis finger
helpers curl after contact, and terminal hand soft-orient remains available for
sculls / poles / hoods. Bounded in-app stills for that motion are sealed in
[`2026-07-25-0565a58`](athlete-v5/in-app/2026-07-25-0565a58/manifest.json)
(row finish, ski loaded press, bike pedal top/bottom). Full six-pose sheets and
cycles remain the surface/contact matrix from `a56460b`; hardware WebGPU Ultra
proof is still the prior Chrome capture (headless Chromium reports WebGL/High).

### Articulated Concept2-machine grips (`4f23b36`)

The final hand pass replaces each rigid finger fan with individually weighted
proximal/intermediate/distal chains plus an opposing three-segment thumb. The
user-supplied Concept2 RowErg, SkiErg, and BikeErg photographs were used as
technique references for local hand enclosure only: the existing machine
contact paths, timing, equipment layout, and environments remain authoritative.
Outdoor rowing, cycling, and skiing references informed athletic silhouette
only and were not substituted for Concept2 machine geometry.

The exact implementation commit is
`4f23b36ac4855c564dab38b150572da387c15305`. Its bounded
[capture manifest](athlete-v5/in-app/2026-07-25-4f23b36/manifest.json) records
the real 1112×420 application stage, requested tier, effective tier, backend,
camera, and pose for:

- [RowErg catch grip](athlete-v5/in-app/2026-07-25-4f23b36/poses/grip-row-catch.jpg):
  relaxed palm cup, four phalange chains around the slim scull handle, and an
  opposing thumb;
- [SkiErg loaded-press grips](athlete-v5/in-app/2026-07-25-4f23b36/poses/grip-ski-loaded-press.jpg):
  both hands visibly enclose the independent cylindrical grips; and
- [BikeErg pedal-top grips](athlete-v5/in-app/2026-07-25-4f23b36/poses/grip-bike-pedal-top.jpg):
  both palms retain the existing hood/bar contacts while the fingers close
  below the cockpit.

The capture browser again had no WebGPU adapter, so these macro frames
truthfully record effective High/WebGL. They prove anatomy, enclosure, and
clipping at the same geometry and contact solve used by all tiers; the existing
hardware Chrome evidence remains the Ultra/WebGPU material proof.

### Geometry-aware RowErg closure (PR #180)

The historical frames above show the original bounded helper curl. The current
stacked RowErg layer now solves finger/thumb enclosure from the actual scull
radius and hand-channel centre after the authoritative oar contact pass. Its
fresh WebGPU/Ultra catch, finish, front, and mobile acceptance is documented in
[RowErg geometry-aware grip acceptance](replay-row-grip.md).

### Geometry-aware BikeErg closure (PR #181)

The final stacked layer keeps the same hood contacts while a Bike-only,
collision-bounded closure mode carries all four fingertips across the 36 mm
hood body and hooks the opposing thumb underneath. RowErg and SkiErg remain on
their approved closure paths. Fresh WebGPU/Ultra desktop macro, crank-extreme,
and seated-support evidence is documented in
[BikeErg geometry-aware grip acceptance](replay-bike-grip.md).

### SkiErg thumb closure follow-up

The SkiErg layer kept an opposition constant inherited from a pose that asserts
nothing about thumb contact, which stood the pad ~20 mm off the rendered pole
with the thumb extended up the shaft. RowErg and BikeErg each pin five per-digit
contact reports; SkiErg pinned only angular coverage, so no test could see it.
The refitted constant closes the thumb across the fist, and the missing
per-digit and rendered-shaft assertions are now in place. Its fresh WebGPU/Ultra
grip and chase evidence, including a before/after render of the same frames, is
documented in [SkiErg equipment and proportion visual acceptance](replay-ski-equipment.md).

### BikeErg equipment and seated fit — 2026-07-25

Product goal: a better **machine** plus correct athlete interaction. The athlete
body itself is #172; this change is equipment and contact.

**What shipped.** A stylised diamond-frame road bicycle: two equal wheels on the
ground, a main triangle with chain- and seat-stays and fork blades, a segmented
chain to the rear cassette, drop bars with contact-aligned hoods, and a
channelled performance saddle. An indoor-erg silhouette (flywheel cage, fixed
base, mast, console) was attempted first and abandoned — it read as an
incoherent object at chase-camera distance and made the rolling-progress
metaphor unreadable. The docs are written against the bicycle that ships, not
that abandoned direction; `docs/usage.md` and the asset README both state
plainly that the bicycle is a course metaphor, not a depiction of Concept2
hardware.

**Provenance.** A CC-BY Sketchfab spin bike was evaluated and **not imported**
(≈435k faces against a 32k V3 package budget; Sketchfab auth; no retarget).
See `static/replay-assets/source/bike/PROVENANCE.md`. Shipped geometry is
repository-authored MIT under the same fit contract a third-party mesh would use.

**The seating bug, and why the first two attempts missed it.** The initial
"seated fit" moved the hip **bone** onto the saddle marker, which unit tests
happily confirmed while the chase camera showed an empty seat. The reason is
that the hip bone is not the contact surface: measured over the pad footprint
after the full clip and contact solve, the lowest hips-weighted posterior skin
trails the hip bone by ≈ 18.8 cm at the worst crank phase — not the ~6.5 cm an
earlier bone-only estimate suggested. `BIKE_RIG.rider.sitSurfaceFromHip` now
records the measured value, and hip height is _derived_ from it
(`bikeRiderHipY`) rather than tuned by eye.

**Current mechanism.** Seating is geometric end to end. The pad top is
`BIKE_RIG.saddle.y + saddlePadHalfHeight`; the authored V3 saddle mesh is built
so its highest vertex lands exactly on that plane; hip Y is derived so the
measured sit surface rests on it, less a 5 mm cushion nestle. At runtime the V4
controller receives an explicit `seatContract` and may lift the root if clip hip
pitch would otherwise re-open 穿模 — bounded at 8 cm, beyond which the solve
refuses and replay falls back rather than posing the rider mid-air. The V4
post-clip pass samples the visible shoulders and derives a tucked elbow marker
per hood; the motion graph remains the authority for opposed pedal contacts.

**Regressions this closed.** Lowering the saddle without moving the seat post
left the post ending ~10 cm above the pad — straight through the rider — in the
V3 package, which is the _preferred_ path over the procedural fallback. The post
now stops beneath the pad, and `validate-replay-assets.mjs` fails the build on
any bike frame vertex that rises above the pad top inside the rider's footprint,
so this cannot recur silently. Separately, the V3 generator previously re-typed
the fit numbers by hand; it now imports `BIKE_RIG` directly, which is what makes
the no-drift claim in the asset README true rather than aspirational. That
import also revealed a 5 cm mismatch between the V3 frame's bottom-bracket
junction and the runtime crank centre, now resolved.

**Coverage.** The focused suite samples six crank phases across all four quality
tiers, asserting saddle support from skinned mesh vertices (not a config point),
palm-to-grip lock, shoulder-width elbows, and no ground penetration. Five new
controller tests cover the seat contract itself: the lift, XZ lock during lift,
refusal to drag the rider downward, over-budget fallback, and the shipped
`BIKE_RIG` numbers. The earlier version of this work had none — a height
heuristic in the controller meant the correction never executed under test.

**Frames.** Captured from the real application at
`http://127.0.0.1:8787` (Workers preview) with
`node scripts/capture-replay-athlete-v5-qa.mjs --only=…`; manifest at
[`bike-fit-2026-07-25/manifest.json`](athlete-v5/in-app/bike-fit-2026-07-25/manifest.json).

| View                        | Frame                                                                                                                                               | What it shows                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Chase, pedal top            | [frame](athlete-v5/in-app/bike-fit-2026-07-25/poses/saddle-bike-pedal-top.jpg)                                                                      | Rider seated on the pad at the crank extreme that previously reopened penetration |
| Chase, pedal top + skeleton | [overlay](athlete-v5/in-app/bike-fit-2026-07-25/poses/saddle-bike-pedal-top-skeleton.jpg)                                                           | Hip joint above the pad, continuous leg chain to the pedal                        |
| Chase, pedal bottom         | [frame](athlete-v5/in-app/bike-fit-2026-07-25/poses/saddle-bike-pedal-bottom.jpg)                                                                   | Seat still occupied through bottom dead centre; both wheels on the ground         |
| Close, pedal top / bottom   | [top](athlete-v5/in-app/bike-fit-2026-07-25/poses/bike-pedal-top.jpg) · [bottom](athlete-v5/in-app/bike-fit-2026-07-25/poses/bike-pedal-bottom.jpg) | Frame silhouette and rider posture at working distance                            |
| Grip close-up               | [frame](athlete-v5/in-app/bike-fit-2026-07-25/poses/grip-bike-pedal-top.jpg)                                                                        | Both palms closed on the bar; ghost hand independently gripping                   |

Remaining compromise: the `athlete-close` camera crops the rider's head on
BikeErg at desktop framing, which is why the seat evidence above uses the
ordinary chase camera. The close frames remain the posture reference.

### BikeErg true-scale rebuild — 2026-07-25

Review of the frames above found the bicycle itself was the problem, not its
details. Measured against the V4 athlete — 1.83 m tall, hip at 1.02, femur
0.4915, tibia 0.4794 — the bike was roughly 1.5× oversized: **1.02 m wheels**
(a 700c wheel is 0.67) on a **1.70 m wheelbase** (road bikes are ~1.00), with
the saddle at 1.23 m. The BikeErg's procedural legs had been stretched to
0.63/0.63 to reach it, where the rower's are 0.552.

Every other front-end complaint followed from that. Wheels that large force the
front wheel far forward or the pedals strike it, so the fork had to rake out to
**52° over 0.70 m** to meet the axle — a chopper, not a bicycle. The head tube
was also built backwards, with its top 0.08 m _ahead_ of its bottom, where a
real steerer leans back as it rises.

**Now derived, not authored.** `bikeRig.js` takes real road geometry (0.335 m
axle height, 0.07 BB drop, 73° head angle, 0.05 fork rake, 0.41 chainstay) and
then solves the rider's hip from their own leg length against the bottom
bracket, the way a fitter would. Results: 0.670 m wheels, 0.999 m wheelbase,
73.0° head angle with the top correctly rearward, a 0.384 m fork, 95% leg
extension at bottom dead centre, and 0.124 m of toe clearance to the front
wheel. Procedural femur and tibia now read from the same contract, so the
fallback figure cannot drift from the skinned athlete again.

**Parts and materials.** The tyre was a mid blue-grey at roughness 0.4 with a
touch of metalness, which is why the wheels read as moulded plastic; it is now
near-black at roughness 0.95 and zero metal. The chain was 48 straight tubes
between two eyeballed points that touched neither sprocket — it is now a single
closed loop solved as two external tangents plus the arcs it wraps, with a
cassette to wrap at the back. (The first attempt used `π/2 + β` for the tangent
contact angle where the correct solution of `cos(θ−α) = (r₁−r₂)/d` is
`π/2 − β`; a tangency test caught it.) The bar was a bare capsule ending in a
point, and is now a drop bar with shaped brake hoods the palms close on. The
saddle is deliberately **grey rather than black**: a black saddle merged with
both the dark kit above and the dark track behind, which is how "is the rider
on the seat?" became impossible to answer by eye, and it failed the semantic
contrast rule the renderer already enforced.

Frames, same harness, manifest at
[`bike-rescale-2026-07-25/manifest.json`](athlete-v5/in-app/bike-rescale-2026-07-25/manifest.json):

| View                    | Frame                                                                                                                                                       | What it shows                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Chase, light, pedal top | [frame](athlete-v5/in-app/bike-rescale-2026-07-25/poses/saddle-bike-pedal-top-light.jpg)                                                                    | True-scale bicycle under a correctly proportioned rider          |
| Chase, light, bottom    | [frame](athlete-v5/in-app/bike-rescale-2026-07-25/poses/saddle-bike-pedal-bottom-light.jpg)                                                                 | Steep short fork, rubber tyres, seat occupied through BDC        |
| Chase + skeleton        | [overlay](athlete-v5/in-app/bike-rescale-2026-07-25/poses/saddle-bike-pedal-top-skeleton.jpg)                                                               | Hip above the pad, leg chain unbroken to the pedal               |
| Close, top / bottom     | [top](athlete-v5/in-app/bike-rescale-2026-07-25/poses/bike-pedal-top.jpg) · [bottom](athlete-v5/in-app/bike-rescale-2026-07-25/poses/bike-pedal-bottom.jpg) | Frame tubing at road diameters instead of scaffolding            |
| Grip close-up           | [frame](athlete-v5/in-app/bike-rescale-2026-07-25/poses/grip-bike-pedal-top.jpg)                                                                            | Palms closed on shaped hoods; alloy bar with dark tape and drops |

### BikeErg saddle height and seat shape — 2026-07-26

The section above closed with the saddle 0.547 m above the bottom bracket and
called it unfixable without a re-shaped glute or a new clip. **That diagnosis
was wrong**, and worth recording precisely because the measurement looked
convincing.

**The sit surface was measured in the wrong place.** `SIT_SURFACE_FROM_HIP_Y`
was −0.2016, taken as "lowest hips-weighted posterior skin" with no lateral
gate. Binning that same region by |x| shows what it actually found:

| band                   | y below `v4Hips` | what it is    |
| ---------------------- | ---------------- | ------------- |
| \|x\| < 0.026          | −0.1952          | perineum      |
| \|x\| ∈ [0.026, 0.050] | −0.1455          | gluteal cleft |
| \|x\| ∈ [0.050, 0.075] | **−0.158**       | **ischia**    |

The lowest vertices sat on the centreline at z ≈ 0 — the crotch, not the
buttock. The saddle was being placed under soft tissue that on a real bike
hangs into a cut-out, so the whole bicycle was pulled 3.7 cm down. The
“constant to 1.5 mm across the cycle” observation was true and irrelevant: a
surface measured in the wrong place is stable in the wrong place.

The ischial band it should have used is at |x| 0.050–0.075 — a 100–150 mm
sit-bone spread, against 110–130 mm on a real pelvis — over a 40 mm plateau
0.095–0.135 behind the pelvis root, flat to about 3 mm.

**A second, independent 2.5 cm was lost to the hip joint.** The seating solve
treated `v4Hips` as the point the femur starts from. It is not: `v4LeftUpperLeg`
sits 25 mm below it. The leg was solved as if it began at the pelvis root, so
the derived reach fell 25 mm short.

**Saddle height now comes from knee angle.** `LEG_EXTENSION_AT_BDC = 0.95` was
never a fit criterion, just a number under 1 that kept the knee bent. Combined
with the femoral-head error it produced **44.8° of knee flexion at bottom dead
centre** — a cruiser squat. Bike fitters use the Holmes window, 25–35°, so
`KNEE_FLEXION_AT_BDC` is now 30° and the reach falls out of the law of cosines.

| quantity             | before  | after   |
| -------------------- | ------- | ------- |
| knee flexion at BDC  | 44.8°   | 30.0°   |
| knee flexion at TDC  | 110.5°  | 104.1°  |
| pad top above BB     | 0.547 m | 0.630 m |
| pelvis root above BB | 0.742 m | 0.783 m |

**The 0.883 × inseam rule does not apply to this rider, and that is a rig
fact, not a fudge.** It wants 0.75 m of saddle height for a 0.848 m inseam.
Solving that puts the femoral head 1.098 m from the BDC pedal while femur +
tibia is 0.971 m — the leg cannot reach. The V4 skeleton's femur + tibia is
14.5% of its crotch height longer than a scanned human's (0.971/0.848 = 1.145
against ~1.09), so the two criteria cannot both be met. Knee angle is the one
that decides whether the rider reads as a cyclist, so it wins; the bone lengths
are frozen for the RowErg and SkiErg work in flight.

**Raising the saddle exposed a defect that was already shipping.** With the pad
on the ischia, the previous 0.27 m rounded block was 19 mm inside the rider's
thighs at the crank extremes. It had been inside them at the old height too —
the guard never saw it, because it only sampled hips-weighted vertices, and
thighs are not hips-weighted.

**The saddle is now a shape contract, not a block.**
[`bikeSaddle.js`](../../src/lib/replay/bikeSaddle.js) holds a 14-station table
that the procedural renderer lofts, the authored V3 package lofts, and the
penetration guard tests against — one definition, three consumers. Measured
against the rider it has to be a winged, cut-out, dropped-nose saddle, which is
a real product shape (Selle SMP) that exists for exactly this reason:

- wings at |x| up to 0.075 carrying the ischia on a flat plateau;
- a **through cut-out** on the centreline, because the perineum hangs 37 mm
  below the ischia and no amount of channel depth in a solid pad clears that;
- a nose that narrows to 17 mm half-width and drops 62 mm, under the crotch and
  inboard of the sweeping thighs.

**Both features are load-bearing, and the guard proves it.** Removing the
cut-out drives the rider 7.7 mm into the shell; flattening the nose, 6.7 mm.
Both fail the new guard. The guard samples **every** vertex against the
analytic saddle solid at eighth-cycle phases across all four quality tiers —
quarter phases missed the worst case, and a stride of 3 walked past the contact
patch entirely. Baseline penetration is 2.0 mm, which is the ischial contact
itself, inside the 5 mm nestle. A second assertion requires that contact: a pad
parked clear of the athlete would otherwise satisfy "no penetration" perfectly.

| View                      | Frame                                                                                                                                               | What it shows                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Chase, pedal bottom       | [frame](athlete-v5/in-app/bike-fit-2026-07-26/poses/saddle-bike-pedal-bottom.jpg)                                                                   | Road posture: hips high, leg long at BDC, seat occupied          |
| Chase, light, bottom      | [frame](athlete-v5/in-app/bike-fit-2026-07-26/poses/saddle-bike-pedal-bottom-light.jpg)                                                             | Same at readable contrast — glute on the wings, saddle not empty |
| Chase, light, pedal top   | [frame](athlete-v5/in-app/bike-fit-2026-07-26/poses/saddle-bike-pedal-top-light.jpg)                                                                | Seat still carried at the phase that used to reopen penetration  |
| Chase + skeleton          | [overlay](athlete-v5/in-app/bike-fit-2026-07-26/poses/saddle-bike-pedal-top-skeleton.jpg)                                                           | Hip above the pad, leg chain unbroken to the pedal               |
| Close, top / bottom       | [top](athlete-v5/in-app/bike-fit-2026-07-26/poses/bike-pedal-top.jpg) · [bottom](athlete-v5/in-app/bike-fit-2026-07-26/poses/bike-pedal-bottom.jpg) | Knee angle through the stroke                                    |
| Grip close-up             | [frame](athlete-v5/in-app/bike-fit-2026-07-26/poses/grip-bike-pedal-top.jpg)                                                                        | Arms still reach the hoods after the 4 cm hip lift               |
| RowErg / SkiErg unchanged | [row](athlete-v5/in-app/bike-fit-2026-07-26/poses/row-finish.jpg) · [ski](athlete-v5/in-app/bike-fit-2026-07-26/poses/ski-loaded-press.jpg)         | No regression — the shared athlete mesh was not touched          |

**One regression this created, and fixed.** Moving the saddle 115 mm aft of the
pelvis root — onto the sit bones — turned the seatpost into an 8 mm stub
slanting 50 mm backwards, because `seatCluster` was pinned 30 mm under the
saddle. That pin was always wrong: it also ran the top tube and seat stays at
saddle height, a city-bike silhouette. The cluster is now derived back down the
seat-tube axis, giving 60 mm of exposed post collinear with a 72.4° seat tube,
a top tube that meets it below the saddle and rises 47 mm to the head tube
(compact road geometry), and a 55 mm saddle-to-bar drop. A guard pins all four.

**What this deliberately did not do.** The athlete GLB was byte-identical at
this point; the `seat_channel` band in `build-replay-athlete-v4-blender.py` is
untouched. (The hip-crease fix below, done the same day, _did_ regenerate the
shared mesh — with Row/Ski verified — so the byte-identical status is
historical to this section only.) The BikeErg clip's pelvis timing is still PR
#171's, and still unrotated — it simply stopped mattering once the saddle was
placed on the surface that actually carries the rider.

### BikeErg hip crease — the chopped-off thigh — 2026-07-26

With the fit corrected, review found the thigh under the saddle read as
severed and shifted forward. That was a skinning defect at the pelvis/thigh
border, and it was measurable: posing the shipped GLB through the clips and
checking every mesh edge in the hip region, adjacent vertices across the
border separated by up to **5.9× rest distance on the BikeErg — and 10.4× at
the rowing catch**, which has more hip flexion than any crank phase.

The cause was two weight rules that never agreed. The pelvis body gave its
posterior skin **zero** femur influence ("a hip folds at the front only", from
PR #172's standing-shear fix), while the thigh face sets reached **100% femur
by the very height where the pelvis rule still held 80–100% hips**. Whatever
either rule did alone, their border was a cliff, and ~90° of hip flexion
turned the cliff into a visible chop at the gluteal fold.

`hip_zone_weights()` in `build-replay-athlete-v4-blender.py` now owns the
whole crease: skin weights there are a **function of position only**, shared
by both face-set branches, so two neighbouring vertices cannot disagree no
matter which side of the border they fall on. Three constraints shaped it,
each found by measurement:

- **The gradient must be bounded.** The first cut moved the band with a
  posterior offset of 0.185 over a 5.5 cm ramp — a full femur transition
  inside 2.7 cm of glute surface, which just relocated the chop onto the back
  of the thigh. Offsets and ramps are now sized together to keep the
  transition under ~20%/cm.
- **The crotch floor is pelvic.** The two inner thighs touch at the midline;
  giving each side its own femur there tore the crotch ×35 at the rowing
  catch the moment the legs phased apart. Femur influence pinches out toward
  the midline at crease heights, and what remains is split between both legs.
- **The sit bones are planted.** Even a 6% femur share on the ischial plateau
  pulled it 2 cm under mean hip flexion and broke the saddle-contact contract
  the BikeErg fit is solved on. The posterior band tops out just below the
  measured plateau, so the sit surface — and the saddle placed under it — do
  not move with the pedal stroke, exactly as on a real rider.

Result, same probe: bike worst ×5.90 → ×4.36, rower ×10.39 → ×7.37, ski
×6.85 → ×5.01, and the residual worst edges are the fold itself stretching
smoothly (which real skin over a flexed hip does) rather than a step between
coplanar triangles. The renderer suite now carries a permanent guard —
weight-variation-per-metre plus per-sport posed stretch/gap ceilings, with
thresholds set between the measured continuous skin (19.9/m) and the measured
defect (32.6/m). The guard was falsified both ways: it fails against the old
GLB and passes against the new one. An earlier draft of that guard only
sampled edges under 1.4 cm and **passed the defective skin** — the seam ran
entirely along the crease's coarse 2–4 cm triangles — which is why no assert
in it may filter to short edges.

| View                      | Frame                                                                                                                                                                         | What it shows                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Chase, pedal top          | [frame](athlete-v5/in-app/hip-seam-2026-07-26/poses/bike-pedal-top.jpg)                                                                                                       | Glute flows into the hamstring; no notch, no forward-shifted thigh |
| Chase, pedal bottom       | [frame](athlete-v5/in-app/hip-seam-2026-07-26/poses/bike-pedal-bottom.jpg)                                                                                                    | Continuous crease at the opposite crank extreme                    |
| Seat, light, top / bottom | [top](athlete-v5/in-app/hip-seam-2026-07-26/poses/saddle-bike-pedal-top-light.jpg) · [bottom](athlete-v5/in-app/hip-seam-2026-07-26/poses/saddle-bike-pedal-bottom-light.jpg) | Readable-contrast seat contact through the stroke                  |
| RowErg catch / finish     | [catch](athlete-v5/in-app/hip-seam-2026-07-26/poses/row-catch.jpg) · [finish](athlete-v5/in-app/hip-seam-2026-07-26/poses/row-finish.jpg)                                     | Deepest hip flexion of any clip — crease holds                     |
| SkiErg press / reach      | [press](athlete-v5/in-app/hip-seam-2026-07-26/poses/ski-loaded-press.jpg) · [reach](athlete-v5/in-app/hip-seam-2026-07-26/poses/ski-high-reach.jpg)                           | Standing silhouette unregressed by the shared-mesh change          |

### RowErg down-pointing elbows and buried drive — 2026-07-26

The [`elbows-down-2026-07-26`](athlete-v5/in-app/elbows-down-2026-07-26/manifest.json)
set was captured on the Workers preview after the blade-immersion and
down-plane elbow rework. It verifies, in the real app, that the elbows hang
below the shoulder–grip chord through the whole stroke with only the slight
outward tilt of the British Rowing indoor model:

| View                    | Frame                                                                         | What it verifies                                                        |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Chase, catch            | [frame](athlete-v5/in-app/elbows-down-2026-07-26/poses/row-catch.jpg)         | Long soft arms to the swept grips; squared blades already buried        |
| Chase, finish           | [frame](athlete-v5/in-app/elbows-down-2026-07-26/poses/row-finish.jpg)        | Layback with handles at the lower chest and elbows tucked down-and-back |
| Front, finish           | [frame](athlete-v5/in-app/elbows-down-2026-07-26/poses/row-finish-front.jpg)  | Both elbows point down beside the ribs — no horizontal 90° armpit wing  |
| Mobile portrait, finish | [frame](athlete-v5/in-app/elbows-down-2026-07-26/poses/mobile-row-finish.jpg) | The down-elbow silhouette survives the narrow pullback framing          |

The primary matrix is the
[six-pose comparison](athlete-v5/in-app/2026-07-25-a56460b/six-pose-comparison.jpg):
baseline, production athlete, and skeleton/contact overlay for RowErg catch and
finish, SkiErg high reach and loaded press, and BikeErg pedal top and bottom.

| Stress pose          | Production frame                                                          | Skeleton/contact overlay                                                             |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| RowErg catch         | [frame](athlete-v5/in-app/2026-07-25-a56460b/poses/row-catch.jpg)         | [overlay](athlete-v5/in-app/2026-07-25-a56460b/poses/row-catch-skeleton.jpg)         |
| RowErg finish        | [frame](athlete-v5/in-app/2026-07-25-a56460b/poses/row-finish.jpg)        | [overlay](athlete-v5/in-app/2026-07-25-a56460b/poses/row-finish-skeleton.jpg)        |
| SkiErg high reach    | [frame](athlete-v5/in-app/2026-07-25-a56460b/poses/ski-high-reach.jpg)    | [overlay](athlete-v5/in-app/2026-07-25-a56460b/poses/ski-high-reach-skeleton.jpg)    |
| SkiErg loaded press  | [frame](athlete-v5/in-app/2026-07-25-a56460b/poses/ski-loaded-press.jpg)  | [overlay](athlete-v5/in-app/2026-07-25-a56460b/poses/ski-loaded-press-skeleton.jpg)  |
| BikeErg pedal top    | [frame](athlete-v5/in-app/2026-07-25-a56460b/poses/bike-pedal-top.jpg)    | [overlay](athlete-v5/in-app/2026-07-25-a56460b/poses/bike-pedal-top-skeleton.jpg)    |
| BikeErg pedal bottom | [frame](athlete-v5/in-app/2026-07-25-a56460b/poses/bike-pedal-bottom.jpg) | [overlay](athlete-v5/in-app/2026-07-25-a56460b/poses/bike-pedal-bottom-skeleton.jpg) |

The same set includes complete
[RowErg](athlete-v5/in-app/2026-07-25-a56460b/cycles/row-one-cycle.webm),
[SkiErg](athlete-v5/in-app/2026-07-25-a56460b/cycles/ski-one-cycle.webm), and
[BikeErg](athlete-v5/in-app/2026-07-25-a56460b/cycles/bike-one-cycle.webm)
cycles, an
[opaque live/ghost SkiErg frame](athlete-v5/in-app/2026-07-25-a56460b/poses/ghost-ski-loaded-press.jpg),
a [mobile RowErg frame](athlete-v5/in-app/2026-07-25-a56460b/poses/mobile-row-finish.jpg),
and a [front face view](athlete-v5/in-app/2026-07-25-a56460b/poses/row-finish-front.jpg).

The automated capture browser had no WebGPU adapter. Its manifest therefore
truthfully records `WEBGL` and effective `High` when a still requested Ultra.
The four tier frames document requested tier behavior, but the requested-Ultra
headless frame is **not** presented as Ultra acceptance:

- [Low](athlete-v5/in-app/2026-07-25-a56460b/tiers/tier-row-finish-low.jpg)
- [Medium](athlete-v5/in-app/2026-07-25-a56460b/tiers/tier-row-finish-medium.jpg)
- [High](athlete-v5/in-app/2026-07-25-a56460b/tiers/tier-row-finish-high.jpg)
- [requested Ultra, effective High fallback](athlete-v5/in-app/2026-07-25-a56460b/tiers/tier-row-finish-ultra.jpg)

Genuine hardware acceptance is separately recorded in the
[Chrome WebGPU/Ultra manifest](athlete-v5/in-app/2026-07-25-a56460b/hardware-webgpu-ultra.json).
The [canvas-only close-up](athlete-v5/in-app/2026-07-25-a56460b/poses/row-webgpu-ultra-front.png)
shows the final face and materials, while the
[frame with application controls](athlete-v5/in-app/2026-07-25-a56460b/poses/row-webgpu-ultra-front-with-controls.png)
visibly records effective **Ultra** and **WebGPU** on installed Chrome for
macOS hardware.

Earlier in-app directories, including `2026-07-24-12325d3`, are historical and
superseded; they are not final acceptance evidence. The regenerated
[`blender-qa-photoreal`](athlete-v5/blender-qa-photoreal/) set is supplementary
structural inspection only, not a substitute for the in-app renderer.

## Contact and clipping acceptance

- RowErg catch and finish keep both elbows outside the torso while both palms
  remain on their scull grips; individual phalanges and opposing thumbs close
  around the slim handles.
- BikeErg pedal top and bottom keep the saddle behind the pelvis rather than
  drawing through the body; both soles remain on the opposed pedals.
- SkiErg high reach and loaded press retain both pole contacts without opening
  the shoulder or armpit surface; both hands visibly enclose the cylindrical
  grips.
- BikeErg palms remain on the existing hood contacts while curled fingers close
  below the cockpit bar instead of floating open or merging into the handle.
- Live and ghost athletes retain complete opaque bodies with independent
  skeletons and material instances.
- Dense-cycle renderer tests cover elbow/forearm/palm clearance, saddle draw
  order, palm and sole contacts, clone isolation, and the quality-tier material
  progression.

## Motion and architecture freeze

`src/lib/replay/motionGraph.ts`, `sportKinematics.ts`, `figurePose.ts`,
`strokeModel.ts`, and the Canvas renderer are untouched. The V4 clip names,
phase landmarks, and drive ends remain `0.38` for RowErg, `0.34` for SkiErg,
and `0.5` for BikeErg. The 32 visual-only grip helpers derive from the semantic
hand hierarchy, carry no clip tracks, and are not replay-motion targets.

The V4 loader remains an optional hero path above V3, procedural 3D, and Canvas
fallbacks. No second motion system, equipment authority, environment path, or
asset request was introduced.

## Separate RowErg shell-mechanics follow-up

The RowErg shell and athlete-positioning work is intentionally delivered on the
separate `codex/rowerg-shell-mechanics` branch, after the production-athlete PR.
It changes the existing RowErg equipment template and rowing-specific motion
windows without changing the V4 athlete asset, SkiErg/BikeErg timing, cadence,
drive endpoint, contact authority, reduced-motion behavior, ghost comparison,
or fallback chain.

The geometry and movement targets were checked against current racing-shell and
coaching references:

- [Filippi's F14 racing single](https://www.filippiboats.com/eng/boats/competition/single-sculls-1x/f14)
  documents an 8.33 m, 29 cm waterline, U-section carbon racing shell with a
  wing rigger, sliding seat, and full-carbon foot stretcher.
- [Empacher's racing mould table](https://www.empacher.com/fileadmin/DE/downloads/BOFO22-1-2.pdf)
  places racing singles between 7.40 and 8.30 m, depending on athlete mass.
- [British Rowing's rigging guidance](https://plus.britishrowing.org/2024/04/22/rigging-for-success-understanding-the-key-principles-and-adjustments/)
  gives a 38–45° stretcher range and a typical 15–20 cm seat-to-heel height.
- [British Rowing's on-water technique model](https://www.britishrowing.org/knowledge/rower-development/british-rowing-technique/water-rowing-technique/)
  specifies vertical shins and a forward hip hinge at catch, a leg-led drive,
  late body/arm contribution, and hands-away, body-over, then slide on recovery.
- [British Rowing's indoor rowing technique](https://www.britishrowing.org/knowledge/rower-development/british-rowing-technique/indoor-rowing-technique/)
  keeps the arms hanging relaxed from the shoulders throughout: the elbows
  point down with only a slight outward tilt, and the upper arm never opens
  toward a horizontal 90° armpit.
- [World Rowing's equipment rules](https://worldrowing.com/wp-content/uploads/2025/04/2025-World-Rowing-Rules-of-Racing-Overall-Classic-rowing-Related-byelaws_March2025.pdf)
  require a visible bow ball and quick-release feet/heel restraints.

Applied to RowPlay, the shell is 7.8 m long with tapered bow/stern decks, a
neutral lower U-hull, bow ball, stern fin, open cockpit, full-width wing rigger,
and oarlocks. The aft-facing athlete sits between the bow-side sliding seat and
the stern-side fixed 42° stretcher; the heels sit about 16 cm below the seat
and include heel restraints, instep hardware, and diagonal supports. The shared procedural/V4 leg solve keeps the
shins near vertical at catch, knees above and inside the cockpit, and legs near
straight at finish. The rowing graph sequences legs → torso → arms on the drive
and hands → body → slide on recovery. The elbows only ever point down: the
arms hang from the shoulders with a near-vertical bend plane and a slight
outward tilt through the whole stroke. At the loaded draw each humerus extends
down-and-back — the elbows hang below the handle line, close under their own
shoulders and at most slightly behind the laid-back shoulder plane — then rise
back toward handle height as the blades extract. This rejects the
shoulder-height “chicken wing”, the left/right horizontal 90°-armpit flare,
and a past-vertical behind-the-back haul while the palms remain locked around
their separate rubber grips.

Blade/water interaction follows the same on-water model: the squared spoons
drop in just before the catch, stay buried below the water plane for the entire
loaded drive (the `bladeWater` contact holds through the full drive and
extracts in early recovery), and feather clear on the way forward. The oarlock
pin sits at real rigging height (~14 cm above the seat top), so the fixed-pin
roll that buries the spoon leaves the handles at an anatomical drive height and
adds only a few centimetres of rise into the lower-rib finish. Hull roll is
damped while the blades are buried — two water-locked spoons stabilise a scull
like outriggers — which also keeps the 2.97 m levers from porpoising a loaded
blade back out of the water. The visible arm draw begins only once the legs
have finished and spans roughly the last 100 ms of the drive at 28 spm, with
the grips passing well above the flattened knee envelope, rather than
collapsing the whole pull into a couple of display frames.

Focused contracts cover shell orientation and length, stretcher rake,
seat-to-heel height, full-stroke foot positions, catch shin alignment, finish
extension, finish elbow-to-handle height, rigid grip contact, and cycle
continuity.

## Rebuild and validation

```sh
vp run build:replay-rig-v4
vp run build:replay-rig-v4-usdz
vp run build:replay-rig-v4-contract
vp run validate:replay-assets
vp run validate:locales
vp run test:e2e:smoke
vp run check
git diff --check
```

## Definition of done

- [x] Source-backed continuous human anatomy replaces the assembled mannequin
- [x] Human head, face, eyes, hair, hands, feet, and joint volume survive all three clips
- [x] Individual fingers and opposing thumbs enclose all three machine grips
      without changing authoritative palm targets
- [x] RowErg elbow/body and BikeErg pelvis/saddle overlap are removed
- [x] The hip crease is weight-continuous: no chopped-off thigh at the saddle,
      guarded by weight-variation and posed stretch/gap ceilings falsified
      against the defective GLB
- [x] BikeErg saddle height is solved from knee flexion at BDC (30°, Holmes
      25-35°) with the pad on the measured ischial plateau, and no skin — of
      any bone — enters the saddle solid at any eighth-cycle phase or tier
- [x] Low, Medium, High, and Ultra have materially progressive athlete quality
- [x] Hardware WebGPU/Ultra is recorded separately from headless High fallback
- [x] Six stress poses, skeleton/contact overlays, three cycles, ghost, mobile, and front views are captured
- [x] Source, creator, version, licence, extraction, modifications, hashes, and redistribution are documented
- [x] PR #171 motion/contact ownership and all fallback paths remain intact
