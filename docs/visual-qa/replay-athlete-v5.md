# Replay production athlete visual overhaul

This note records the dedicated **3D athlete visual-quality** pass on branch
`codex/replay-athlete-visual-overhaul`. It replaces the mannequin-like V4 loft
assembly with a coherent production sports character while freezing PR #171
movement physics.

## Baseline

| Item              | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Baseline commit   | `da0dc73` (PR #171 merge into `main`)                                             |
| Renderer          | WebGPU-first 3D Ultra (production path)                                           |
| Motion owner      | PR #171 (`rigV4.ts` clips + contact-constrained solve)                            |
| Baseline captures | [athlete-v5/baseline](athlete-v5/baseline/) (copied from higher-ceiling V4 Ultra) |
| Studio baseline   | [higher-ceiling/v4-blender](higher-ceiling/v4-blender/)                           |

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
chase-camera distance, deliberately modelled clothing panels, clean head/hair
silhouette, no photoreal face detail.

References retained from the higher-ceiling pass:

- [replay art-direction triptych](higher-ceiling/reference/replay-art-direction.png)
- Concept2 technique stills (motion only; not mesh sources)

## Approach A — replace V4 surface, keep semantic contract

The production path still loads `rowplay-athlete-v4.glb` through
`renderer3dV4Assets.ts`. Changes:

1. **Surface authoring** (`scripts/build-replay-athlete-v4-blender.py`)
   - denser anatomical cage with deliberate deltoid / thigh / calf volume
   - voxel remesh → **one connected topology component**
   - weight transfer from the ring-weighted cage (not bone-heat)
   - armpit chest-weight boost so raised SkiErg arms do not open holes
   - regional vertex colours for kit / skin / tights / shoes / hair
2. **Materials** (`rigV4.ts` `createV4Material`)
   - slightly lower roughness, restrained sheen/clearcoat for fabric response
3. **Runtime contract**
   - semantic 19 bones remain required
   - helper bones are permitted by the loader (not required by this asset)
   - topology component count and micro triangle budgets are no longer frozen
4. **Motion**
   - clips, drive ends, contact offsets, and IK solve are unchanged

## Evidence

### Studio six-pose stress set

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
- 24 topology components → **1** connected component
- Floating lace islands and open hair rims → removed
- Gaping armpit under raised arms → chest-weight boost + thicker deltoid root
- White shin “sock” paint bands → foot-block-only shoe colouring
- Plastic mannequin material → fabric sheen response

### Motion freeze proof

- `src/lib/replay/motionGraph.ts`, `sportKinematics.ts`, `figurePose.ts`,
  `strokeModel.ts`, and the Canvas 2D renderer are **untouched**
- Clip names, drive ends (`0.38` / `0.34` / `0.5`), contact offsets, and
  phase landmarks match the PR #171 contract
- Validator still requires the same 19 semantic bones and three clips

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
Exact vertex/triangle counts are sealed in the contract and are not art targets.

## Definition of done checklist

- [x] Coherent body rather than assembled tubes
- [x] Shoulders emerge from the torso (no open armpit hole in studio stress set)
- [x] Elbows/knees preserve volume through flexion
- [x] One shared athlete for all three PR #171 clips
- [x] Opaque live/ghost body path retained (no transparent sorting)
- [x] Canvas 2D / environments / equipment motion untouched
- [x] In-app live captures for row / ski / bike (dark + light + ghost + mobile)
- [ ] Real-time cycle videos (row / ski / bike) — optional follow-up; studio
      stress frames and live stills are the primary evidence in this PR

### In-app captures

Headless Chromium selected WebGL High (WebGPU Ultra is not always available
headless). Production V4 athlete loaded with zero page errors:

| Capture    | Path                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Row dark   | [in-app/row-3d-desktop-dark-ultra.jpg](athlete-v5/in-app/row-3d-desktop-dark-ultra.jpg)             |
| Row light  | [in-app/row-3d-desktop-light-ultra.jpg](athlete-v5/in-app/row-3d-desktop-light-ultra.jpg)           |
| Ski dark   | [in-app/ski-3d-desktop-dark-ultra.jpg](athlete-v5/in-app/ski-3d-desktop-dark-ultra.jpg)             |
| Ski ghost  | [in-app/ski-3d-desktop-dark-ultra-ghost.jpg](athlete-v5/in-app/ski-3d-desktop-dark-ultra-ghost.jpg) |
| Bike dark  | [in-app/bike-3d-desktop-dark-ultra.jpg](athlete-v5/in-app/bike-3d-desktop-dark-ultra.jpg)           |
| Bike light | [in-app/bike-3d-desktop-light-ultra.jpg](athlete-v5/in-app/bike-3d-desktop-light-ultra.jpg)         |
| Mobile     | [in-app/row-3d-mobile-light.jpg](athlete-v5/in-app/row-3d-mobile-light.jpg)                         |

Ghost comparison: both live and ghost bodies remain complete, opaque, and free
of transparent triangle-sorting disappearance.
