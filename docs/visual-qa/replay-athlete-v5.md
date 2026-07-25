# Replay production athlete visual acceptance

This note records the dedicated 3D athlete visual-quality pass on
`codex/replay-athlete-visual-overhaul`, relative to merge base `da0dc73`. It
replaces the assembled procedural mannequin with a source-backed human surface
while retaining PR #171's motion, contacts, equipment, environments, and
fallbacks.

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

| Artifact                           |      Bytes | SHA-256                                                            |
| ---------------------------------- | ---------: | ------------------------------------------------------------------ |
| `rowplay-athlete-v4.glb`           |  5,059,344 | `6cb07263ebeed58750c5d7c52b34361b333b008fb1945ee68baec525643cae3d` |
| `rowplay-athlete-v4.usdz`          | 11,800,039 | `53dc821186fc6f3311e3633f1e4373226205228c0a5188fc8d54729ee64efc9c` |
| `rowplay-athlete-v4.contract.json` |     12,720 | `99b0b2a5cba35b13b210122f2a68e93bb5fc7b2f0cda5700d443ef995ba5ba44` |

The GLB contains one indexed `SkinnedMesh`, 64,200 vertices, 106,256 triangles,
28 deliberate topology components, one continuous human core, one skin, one
portable vertex-colour material, 19 semantic bones, and four visual-only helper
bones. The validator rejects a body assembled from disconnected limb islands.

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

This is a progressive ladder, not a Low-to-Ultra cliff. A denser 169k-vertex,
19.6 MB GLB experiment was also tested and rejected because it produced no
meaningful in-app improvement. The sealed level-one anatomical surface plus
facial and material work gives the better visual result without wasting replay
compute.

## Exact in-app evidence

The acceptance set is
[`2026-07-25-a56460b`](athlete-v5/in-app/2026-07-25-a56460b/manifest.json),
captured from implementation commit
`a56460b40d9611ee8319ed1566bf62b75ad8dfaa`.

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
  remain on their scull grips.
- BikeErg pedal top and bottom keep the saddle behind the pelvis rather than
  drawing through the body; both soles remain on the opposed pedals.
- SkiErg high reach and loaded press retain both pole contacts without opening
  the shoulder or armpit surface.
- Live and ghost athletes retain complete opaque bodies with independent
  skeletons and material instances.
- Dense-cycle renderer tests cover elbow/forearm/palm clearance, saddle draw
  order, palm and sole contacts, clone isolation, and the quality-tier material
  progression.

## Motion and architecture freeze

`src/lib/replay/motionGraph.ts`, `sportKinematics.ts`, `figurePose.ts`,
`strokeModel.ts`, and the Canvas renderer are untouched. The V4 clip names,
phase landmarks, and drive ends remain `0.38` for RowErg, `0.34` for SkiErg,
and `0.5` for BikeErg. The four helper bones derive from the semantic hierarchy
and are not animation targets.

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
- [x] RowErg elbow/body and BikeErg pelvis/saddle overlap are removed
- [x] Low, Medium, High, and Ultra have materially progressive athlete quality
- [x] Hardware WebGPU/Ultra is recorded separately from headless High fallback
- [x] Six stress poses, skeleton/contact overlays, three cycles, ghost, mobile, and front views are captured
- [x] Source, creator, version, licence, extraction, modifications, hashes, and redistribution are documented
- [x] PR #171 motion/contact ownership and all fallback paths remain intact
