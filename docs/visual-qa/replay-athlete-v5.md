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
| `rowplay-athlete-v4.glb`           |  5,069,284 | `d435338500c15ee50ee4343a28f821779be179987ebd38819f578bd0fbf55bc7` |
| `rowplay-athlete-v4.usdz`          | 11,830,173 | `1af7475805bfb7d9ac79d5af902ec11c6c957a8cc408c51f6cbdd7a56c7908e2` |
| `rowplay-athlete-v4.contract.json` |     27,593 | `4388abafdd7d7abe987359ceacd5e655416121e4a748f053da497d3d16729190` |

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

### BikeErg sit-surface correction — 2026-07-25

Codex’s earlier “seated fit” change only moved the hip **bone** onto the saddle
marker. Measured after full clip + contact solve, the production V4 posterior
sit surface still sat ~8 cm below that marker, so the buttocks sank under the
authored saddle and the seat read as empty from the chase camera while
hip-to-saddle unit tests stayed green. Palms were already on the hood contacts
(~0 mm).

Fix: lower the shared `BIKE_RIG` saddle/seat-cluster under
`hip + sitSurfaceFromHip` (keep the hip high enough for full pedal reach),
rebuild V3 equipment from that contract, document `sitSurfaceFromHip`, and
assert sit-surface distance (not hip≈saddle) plus palm-to-grip lock in the
tiered fit test. Post-fix: sit-to-saddle ≈ 2 cm, palm-to-grip ≈ 0 mm. No
third-party bike download — the empty seat was an athlete/saddle alignment bug,
not missing bike geometry.

### BikeErg seated-fit follow-up — 2026-07-25

The BikeErg machine and rider now share one `BIKE_RIG` proportion contract in
the procedural renderer and generated V3 package. The shorter wheelbase,
raised saddle cluster, and narrowed hood span keep the machine at a human-scale
relationship to the V4 body instead of stretching the frame around the old
pose. The V4 post-clip pass samples the visible shoulders, derives a deterministic
tucked elbow marker for each hood, and still leaves the motion graph as the
authority for opposed pedal contacts.

Local in-app review used `/replay/1004?qa=athlete-visual&athleteCamera=close` at
Ultra/WebGPU plus the skeleton overlay at the same pedal-top pose. The paused
and moving spot-checks showed the pelvis supported by the saddle, both palms on
the hood contacts, elbows below and behind the shoulders, and both shoes on the
opposed pedals. The focused regression suite additionally samples six phases
across the crank cycle and asserts saddle support, shoulder-width elbows, and
hood clearance. The update reuses the existing CC0-derived V4 athlete and
repository-authored V3/procedural equipment; no new runtime asset download was
introduced.

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
- [x] Low, Medium, High, and Ultra have materially progressive athlete quality
- [x] Hardware WebGPU/Ultra is recorded separately from headless High fallback
- [x] Six stress poses, skeleton/contact overlays, three cycles, ghost, mobile, and front views are captured
- [x] Source, creator, version, licence, extraction, modifications, hashes, and redistribution are documented
- [x] PR #171 motion/contact ownership and all fallback paths remain intact
