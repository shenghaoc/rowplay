# Replay production athlete visual overhaul

This note records the dedicated **3D athlete visual-quality** pass on branch
`codex/replay-athlete-visual-overhaul`. It replaces the mannequin-like V4 loft
assembly with a coherent production sports character while freezing PR #171
movement physics.

## Baseline

| Item              | Value                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline commit   | `da0dc73` (PR #171 merge into `main`)                                                                                                 |
| Renderer          | WebGPU-first 3D; headless evidence records WebGL/High fallback while the final acceptance below records connected Chrome WebGPU/Ultra |
| Motion owner      | PR #171 (`rigV4.ts` clips + contact-constrained solve)                                                                                |
| Baseline captures | [historical six-pose `da0dc73` manifest](athlete-v5/baseline/2026-07-23-da0dc73/manifest.json)                                        |
| Studio baseline   | [higher-ceiling/v4-blender](higher-ceiling/v4-blender/)                                                                               |

### Mannequin diagnosis (post-PR-171)

Visible defects were structural, not motion bugs:

| Region              | Cause                                                            |
| ------------------- | ---------------------------------------------------------------- |
| Tube limbs          | Separate elliptical lofts with constant radial profiles          |
| Detached joint look | Caps / pinches at elbow and knee without continuous volume       |
| Shoulder seam       | Sleeve root bolted to ribcage as a thin tube join                |
| Mitten hands        | Short palm loft without thumb mass after remesh                  |
| Pelvis skirt risk   | Independent thigh lofts under hip flexion                        |
| Flat toy materials  | Single vertex-colour physical material with high matte roughness |
| Fragmented topology | 24 connected components pretending to be one body                |

PR #171 contact timing, joint trajectories, and equipment paths remain
authoritative. This pass adapts the character to that motion.

## Art direction

Target: stylized sports-broadcast athlete — anatomically believable, readable at
chase-camera distance, deliberately modelled clothing panels, a close-fitting
short-hair silhouette and human facial landmarks, not a photoreal likeness.

References retained from the higher-ceiling pass:

- [replay art-direction triptych](higher-ceiling/reference/replay-art-direction.png)
- Concept2 technique stills (motion only; not mesh sources)

## Approach A — replace V4 surface, keep semantic contract

The production path still loads `rowplay-athlete-v4.glb` through
`renderer3dV4Assets.ts`. Changes:

1. **Surface authoring** (`scripts/build-replay-athlete-v4-blender.py`)
   - denser anatomical cage with deliberate deltoid / thigh / calf volume
   - shaped generic head with forehead, cheek, jaw, shallow nose ridge,
     low-profile eyes, a quiet mouth plane, and a smooth curved hair cap rather
     than a featureless egg, dark visor, or protruding bead-like facial parts
   - voxel remesh → coherent primary body mass; the release component count is
     sealed in the contract rather than treated as an art-quality target
   - weight transfer from the ring-weighted cage (not bone-heat)
   - armpit chest-weight boost so raised SkiErg arms do not open holes
   - seated posterior relief and pelvis-led weight blend so the BikeErg thigh
     seam does not sweep the visible body through the fixed support
   - regional vertex colours for kit / skin / tights / shoes / hair / eye detail
2. **Runtime materials** (`renderer3dV4Assets.ts`, `renderer3dV4Motion.ts`)
   - retain one portable GLB primitive/material for native handoff, then split
     its reviewed vertex-colour regions into seven runtime PBR surface roles
   - Low → Medium → High → Ultra retain the same athlete, clip, and contacts.
     Low has no generated maps; Medium first reveals 32px deterministic UV
     albedo, normal, roughness, and relief; High sharpens that work at 64px;
     Ultra reaches 96px with the strongest, but still incremental, PBR response
   - material profiles are athlete-specific, so a higher tier visibly improves
     the person rather than only pixel ratio or distant environment density
3. **Runtime contract**
   - semantic 19 bones remain required
   - build, GLB validation, runtime loading, and USDZ handoff preserve
     contract-recorded helper bones when an authored surface needs them
   - helpers remain visual-only: the three technique clips target semantic
     joints, so helpers derive their pose from the hierarchy
   - topology component count and micro triangle budgets are no longer frozen
4. **Motion**
   - clips, drive ends, contact offsets, and IK solve are unchanged; only the V4 surface/deformation clearance and a microscopic BikeErg saddle-compatibility relief are adjusted

## Evidence

### Final real in-app 3D acceptance

The primary evidence is the production app rather than an offline mesh viewer.
The [capture manifest](athlete-v5/in-app/2026-07-24-5b3220a/manifest.json)
is tied to rendered code commit `e0709ca` and records the renderer backend,
quality tier, viewport, and capture method for every artifact. These are
hardware-backed Chrome captures: `WebGPU` is the reported backend for every
final still and cycle.

The [six-pose comparison sheet](athlete-v5/in-app/2026-07-24-5b3220a/six-pose-comparison.jpg)
keeps the requested columns in order: **baseline**, **production athlete**, and
**skeleton / contacts**. Rows are RowErg catch/finish, SkiErg high-reach/loaded-
press, and BikeErg pedal-top/pedal-bottom.

| Sport / stress pose  | Final athlete                                                             | Skeleton overlay                                                                     |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| RowErg catch         | [frame](athlete-v5/in-app/2026-07-24-5b3220a/poses/row-catch.jpg)         | [overlay](athlete-v5/in-app/2026-07-24-5b3220a/poses/row-catch-skeleton.jpg)         |
| RowErg finish        | [frame](athlete-v5/in-app/2026-07-24-5b3220a/poses/row-finish.jpg)        | [overlay](athlete-v5/in-app/2026-07-24-5b3220a/poses/row-finish-skeleton.jpg)        |
| SkiErg high reach    | [frame](athlete-v5/in-app/2026-07-24-5b3220a/poses/ski-high-reach.jpg)    | [overlay](athlete-v5/in-app/2026-07-24-5b3220a/poses/ski-high-reach-skeleton.jpg)    |
| SkiErg loaded press  | [frame](athlete-v5/in-app/2026-07-24-5b3220a/poses/ski-loaded-press.jpg)  | [overlay](athlete-v5/in-app/2026-07-24-5b3220a/poses/ski-loaded-press-skeleton.jpg)  |
| BikeErg pedal top    | [frame](athlete-v5/in-app/2026-07-24-5b3220a/poses/bike-pedal-top.jpg)    | [overlay](athlete-v5/in-app/2026-07-24-5b3220a/poses/bike-pedal-top-skeleton.jpg)    |
| BikeErg pedal bottom | [frame](athlete-v5/in-app/2026-07-24-5b3220a/poses/bike-pedal-bottom.jpg) | [overlay](athlete-v5/in-app/2026-07-24-5b3220a/poses/bike-pedal-bottom-skeleton.jpg) |

Quality is deliberately progressive rather than a Low-to-Ultra cliff. The
same close RowErg finish was captured at every requested tier:

| Tier   | In-app frame                                                                   | Runtime surface work                             |
| ------ | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| Low    | [frame](athlete-v5/in-app/2026-07-24-5b3220a/tiers/tier-row-finish-low.jpg)    | base role material; no generated maps            |
| Medium | [frame](athlete-v5/in-app/2026-07-24-5b3220a/tiers/tier-row-finish-medium.jpg) | first 32px albedo, normal, roughness, and relief |
| High   | [frame](athlete-v5/in-app/2026-07-24-5b3220a/tiers/tier-row-finish-high.jpg)   | sharper 64px maps and stronger material response |
| Ultra  | [frame](athlete-v5/in-app/2026-07-24-5b3220a/tiers/tier-row-finish-ultra.jpg)  | strongest 96px material response                 |

The capture also includes [one RowErg cycle](athlete-v5/in-app/2026-07-24-5b3220a/cycles/row-one-cycle.webm), [one SkiErg cycle](athlete-v5/in-app/2026-07-24-5b3220a/cycles/ski-one-cycle.webm), [one BikeErg cycle](athlete-v5/in-app/2026-07-24-5b3220a/cycles/bike-one-cycle.webm), [opaque ghost SkiErg](athlete-v5/in-app/2026-07-24-5b3220a/poses/ghost-ski-loaded-press.jpg), [mobile RowErg](athlete-v5/in-app/2026-07-24-5b3220a/poses/mobile-row-finish.jpg), and a [front close-up](athlete-v5/in-app/2026-07-24-5b3220a/poses/row-finish-front.jpg). The [desktop dark/light Ultra set](athlete-v5/in-app/2026-07-24-5b3220a/manifest.json) covers RowErg, SkiErg, and BikeErg.

Review of the final in-app frames confirms the following visible outcomes:

- at both RowErg end poses, the skeleton overlay places elbows outside the
  torso volume while the hands stay on the scull grips;
- at both BikeErg extremes, the saddle remains visibly behind the pelvis rather
  than filling it; and
- the close-up shows a deliberately simplified but human face with a curved
  short-hair silhouette, shallow landmarks, and no dark visor/mask artifact.

Headless Chromium had no WebGPU adapter, so its manifest truthfully reports
`WEBGL` and `High` when an Ultra request falls back. The final hardware pass
closed that acceptance boundary in Google Chrome on macOS: RowErg and SkiErg
both reported `WebGPU`, accepted `Ultra`, and rendered the combined athlete and
environment branch without console warnings or errors. See the
[hardware WebGPU manifest](athlete-v5/in-app/2026-07-24-hardware-webgpu/manifest.json),
[RowErg frame](athlete-v5/in-app/2026-07-24-hardware-webgpu/hardware-webgpu-ultra-row.jpg),
and [SkiErg frame](athlete-v5/in-app/2026-07-24-hardware-webgpu/hardware-webgpu-ultra-ski.jpg).
The separate headless fallback remains covered by automated tests, but it is not
used to label the final athlete artifacts. The final visual gate is explicitly
the connected Chrome run above, where every entry in the exact-head manifest
reports `WebGPU` and the requested tier. The earlier focused RowErg/SkiErg
hardware manifest is retained as an independent environment sanity check; the
newer six-pose, three-cycle, Ghost, mobile, theme, and tier evidence is the
authoritative athlete acceptance set. This keeps the quality-tier comparison
honest: HD/Ultra compute is spent on visible authored-athlete detail rather
than an unverified backend fallback.

### Supplementary studio nine-pose stress set

Rendered from the sealed production GLB with the PR #171 clips:

| Pose                | Frame                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| Rowing catch        | [blender-qa/v4-blender-rower-1.jpg](athlete-v5/blender-qa/v4-blender-rower-1.jpg) |
| Rowing finish       | [blender-qa/v4-blender-rower-2.jpg](athlete-v5/blender-qa/v4-blender-rower-2.jpg) |
| Rowing recovery     | [blender-qa/v4-blender-rower-3.jpg](athlete-v5/blender-qa/v4-blender-rower-3.jpg) |
| SkiErg high reach   | [blender-qa/v4-blender-skier-1.jpg](athlete-v5/blender-qa/v4-blender-skier-1.jpg) |
| SkiErg loaded press | [blender-qa/v4-blender-skier-2.jpg](athlete-v5/blender-qa/v4-blender-skier-2.jpg) |
| SkiErg recovery     | [blender-qa/v4-blender-skier-3.jpg](athlete-v5/blender-qa/v4-blender-skier-3.jpg) |
| BikeErg pedal top   | [blender-qa/v4-blender-bike-1.jpg](athlete-v5/blender-qa/v4-blender-bike-1.jpg)   |
| BikeErg power       | [blender-qa/v4-blender-bike-2.jpg](athlete-v5/blender-qa/v4-blender-bike-2.jpg)   |
| BikeErg opposed     | [blender-qa/v4-blender-bike-3.jpg](athlete-v5/blender-qa/v4-blender-bike-3.jpg)   |

### Problems removed

- Assembled-tube limb read → continuous remeshed body mass
- 24 fragmented topology components → a coherent primary body mass; the final
  count is sealed in the contract rather than used as an art-quality target
- Floating lace islands and open hair rims → removed
- Gaping armpit under raised arms → chest-weight boost + thicker deltoid root
- White shin “sock” paint bands → foot-block-only shoe colouring
- Plastic mannequin material → role-specific PBR skin, fabric, hair, trim,
  footwear, and face-detail response at every quality tier
- RowErg elbow-through-torso risk → V4-only lateral bend clearance while
  preserving the scull grips and shared elbow branch
- BikeErg body/seat cut-through → low-profile support prepass plus a seated
  pelvis relief blend; hips, cranks, pedals, hands, and feet remain graph-owned

### Motion scope proof

- `sportKinematics.ts`, `figurePose.ts`, `strokeModel.ts`, and the Canvas 2D
  renderer are **untouched**
- the shell follow-up changes only RowErg's existing graph windows: body opening
  starts after the leg drive is established, while recovery remains hands-away
  → body-over → slide
- Clip names, drive ends (`0.38` / `0.34` / `0.5`), contact offsets, and
  phase landmarks match the PR #171 contract
- Validator still requires the same 19 semantic bones and three clips

### Post-review visual corrections

The follow-up addressed reported elbow/body and BikeErg body/seat overlap
without moving PR #171's semantic movement targets. Dense-cycle renderer tests
protect the rowing palm/elbow/forearm clearance, the V4 BikeErg support draw
order, all palm/sole contacts, and the per-tier material-role progression.
These automated checks establish contact and rendering contracts; fresh actual
browser capture remains the acceptance evidence for final visual appearance.

### Rowing shell and leg alignment follow-up

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
  specifies vertical shins and a forward hip hinge at catch; a leg-led drive;
  late body/arm contribution; and hands-away, body-over, then slide on recovery.
- [World Rowing's equipment rules](https://worldrowing.com/wp-content/uploads/2025/04/2025-World-Rowing-Rules-of-Racing-Overall-Classic-rowing-Related-byelaws_March2025.pdf)
  require a visible bow ball and quick-release feet/heel restraints.

Applied to RowPlay, the shell is now 7.8 m long with extended tapered decks,
a neutral lower U-hull, a bow ball, a shifted stern fin, and the existing
full-width wing rigger/oarlocks. The fixed stretcher is 42° from the hull floor;
its heels sit about 16 cm below the seat and now include heel restraints,
instep hardware, and diagonal supports. The shared procedural/V4 leg solve
keeps the shins near vertical at catch, the knees above and inside the open
cockpit, and the legs near straight at finish.
The complete RowErg assembly is oriented bow-first on the course while the
seated athlete faces the stern, matching on-water rowing.

The focused renderer contract covers shell length, stretcher rake,
seat-to-heel height, full-stroke foot positions, catch shin alignment, finish
extension, orientation, and portrait framing. The final connected browser pass
confirmed the WebGPU path with the bow leading down-course and the athlete
facing the stern; the manifest above remains the broader catch/finish and
three-cycle acceptance evidence.

## Asset and licensing

| Field             | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| Asset             | `static/replay-assets/rowplay-athlete-v4.glb`                            |
| Native derivative | `static/replay-assets/rowplay-athlete-v4.usdz`                           |
| Contract          | `static/replay-assets/rowplay-athlete-v4.contract.json`                  |
| Author            | repository-authored Blender 5 production skinned athlete                 |
| Source            | `scripts/build-replay-athlete-v4-blender.py` + `src/lib/replay/rigV4.ts` |
| Licence           | MIT (repository)                                                         |
| Third-party mesh  | **none**                                                                 |
| Redistribution    | permitted under repository MIT                                           |

## Rebuild

```sh
vp run build:replay-rig-v4
vp run build:replay-rig-v4-usdz
vp run build:replay-rig-v4-contract
vp run validate:replay-assets
```

Remesh resolution is tuned so live+ghost clones stay within CI test budgets.
Exact vertex, triangle, and topology-component counts are sealed in the
contract and are not art targets.

## Definition of done checklist

- [x] Coherent body rather than assembled tubes
- [x] Shoulders emerge from the torso (no open armpit hole in studio stress set)
- [x] Elbows/knees preserve volume through flexion
- [x] One shared athlete for all three PR #171 clips
- [x] Opaque live/ghost body path retained (no transparent sorting)
- [x] Canvas athlete/equipment motion untouched; the intentional environment-only
      Canvas refinement is documented in
      [replay-environment-refinement.md](replay-environment-refinement.md)
- [x] In-app six-pose contact evidence for row / ski / bike, plus ghost,
      mobile, and front-close views
- [x] Real-time cycle videos for row / ski / bike
- [x] Progressive Low / Medium / High / Ultra material configuration with
      in-app tier captures
- [x] Hardware WebGPU Ultra visual acceptance recorded in the connected Chrome
      manifest, including six-pose comparison, all three cycles, ghost, mobile,
      dark/light desktop, and Low/Medium/High/Ultra tier captures
