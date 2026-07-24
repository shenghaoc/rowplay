# rowplay replay assets

This directory contains compact, repository-owned 3D geometry for the optional
WebGPU/WebGL replay. It improves visible athlete and equipment form without
changing rowplay's contact-driven animation rig, sport timing, live/ghost
identity, or Canvas 2D fallback.

## `rowplay-rigs-v3.glb`

- **Purpose:** a texture-free authored athlete library plus seven nested,
  reusable equipment templates for RowErg, SkiErg, and BikeErg.
- **Ownership:** created specifically for rowplay from source in this
  repository. No third-party model, stock asset, or user data is included.
- **Copyright and licence:** Copyright (c) 2026 shenghaoc and rowplay
  contributors; distributed under the repository's MIT `LICENSE`.
- **Source of truth:** `scripts/build-replay-assets.mjs`; the RowErg open shell
  and moving seat carriage are hard-surface authored by
  `scripts/build-replay-rowing-shell-blender.py` in Blender 5.2 and folded into
  the same validated V3 template contract.
- **Validator:** `scripts/validate-replay-assets.mjs` verifies the binary,
  exact V3 hierarchy, slot/template names, material-role metadata, geometry
  bounds, normals, triangle/vertex/file budgets, and zero external assets.
- **Exporter:** Three.js `GLTFExporter` using the repository-pinned Three.js
  dependency and Node.js 24 or newer.
- **Reviewed V3 artifact:** 676,456 bytes; SHA-256
  `3cd040317e99ac092208c0c09bb7575633849f963335964aab554c0ba9ebf63e`.
- **Inventory:** 18 compatibility leaf meshes, seven composite roots, and 49
  direct composite parts (25 top-level logical entities; 74 nodes / 67 mesh
  nodes total). The package has 26,590 indexed triangles and 18,745 indexed
  vertices, one neutral placeholder material, zero textures/images, zero
  animations, and zero skins.
- **Detail language:** shared-vertex smooth normals, a neutral lower rowing hull
  beneath lane-coloured split decks, directional brow/nose/ear
  head planes, a swept hair cap, an aero helmet with tail and visor, low-relief
  jersey collar/raglan/back-yoke construction, asymmetric muscle-to-tendon
  limbs, deltoid transitions, and grip/sole/elbow detail. Equipment includes a
  Blender-authored open-U racing shell with split decks, recessed cockpit,
  slide rails, angled stretcher, heel cups, wing rigger, oarlocks, moving
  four-roller seat carriage, and sculpted oar; raised ski deck and binding; aero-rim wheels
  with 14 fine spokes and six-spoke disc rotors, a proper diamond-frame bicycle
  with chain/cassette, calipers, contact-aligned brake hoods/levers, and a
  rotating crank assembly. All detail is generated from reviewed local
  Three.js or Blender Python source; there is no image, texture, downloaded model, scan, or
  avatar-generator output.

### V3 schema and coordinate contracts

The 18 leaf slots preserve the generic athlete plus contact-sensitive Row blade
and Ski pole pieces. Each leaf has `replayAssetSlot`, `replayAssetKind: "leaf"`,
and a `replayMaterialRole` in its glTF extras.

The seven root templates are intentionally transform-free. Their direct child
geometry bakes placement into the mesh, carries `replayAssetTemplateSlot`,
`replayAssetPart`, and `replayMaterialRole`, and remains static until the
existing renderer clones it onto its known rig anchor. Each root records
`replayAssetTemplateSlot`, `replayAssetKind: "composite"`, version 3, the
strict part count, and its material-role list.

| Template root                        | Canonical anchor contract                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equipment:row:boat-assembly`        | Row avatar root coordinates: open hull, split fore/aft decks, recessed cockpit, rails, stretcher, and full-width rigger; oarlocks meet the animated pivots at `(±0.78, 0.38, 0.095)`. |
| `equipment:row:oar-rig`              | One oar at its pin, with `+X` outboard: attach identity on the right and yaw π on the left. The animated blade remains the leaf slot.                                                 |
| `equipment:row:seat-carriage`        | Moving rower-group coordinates: the shaped pad, metal carriage, guides, and four rollers translate with the pelvis while remaining directly over the static slide rails.              |
| `equipment:ski:ski-assembly`         | One ski at the existing per-side anchor `(side × 0.21, 0, 0.16)`; clone it once per ski.                                                                                              |
| `equipment:bike:wheel-assembly`      | One wheel at the existing wheel-group centre with its axle along local X; the carrier, rotor spokes, and bolt heads remain wheel-local.                                               |
| `equipment:bike:frame-assembly`      | Bike avatar-root coordinates for the frame, stays, fork, cockpit, calipers, chain/cassette, saddle, and axles. Brake hoods and levers end at the rig's authoritative hand contacts.   |
| `equipment:bike:drivetrain-assembly` | Crank-group-local coordinates; the existing renderer rotates the complete root about X and its clipless pedals meet the authoritative foot contacts.                                  |

Runtime materials remain outside the GLB. The neutral placeholder is never a
product colour source: `replayMaterialRole` lets the renderer preserve lane
paint, equipment metal/rubber/grip, athlete fabric/skin/hair/footwear,
light/dark themes, and ghost transparency.

Rebuild and validate V3 from the repository root with:

```sh
vp run build:replay-assets
vp run validate:replay-assets
```

The V3 build now invokes Blender at
`/Applications/Blender.app/Contents/MacOS/blender`; set `BLENDER_BIN` to a
different Blender 5 executable when necessary.

Review the resulting binary diff, exact size, and SHA-256 before committing it.
The `v3` filename identifies this composite hierarchy and coordinate contract;
an incompatible change requires a new versioned filename rather than silently
changing V3 meaning.

`rowplay-rigs-v1.glb` and `rowplay-rigs-v2.glb` remain checked in as
compatibility artifacts for older renderer builds. They are not rebuilt by the
current generator. V2's leaf-only package remains the stable fallback while a
renderer adopts V3's template roots.

## `rowplay-athlete-v4.glb`, USDZ derivative, and contract

This is the production V4 hero athlete for WebGPU/WebGL replay. It replaces the
visible segmented V3 human shell when its strict loader contract validates,
while the hidden procedural rig continues to own equipment motion and exact
hand, foot, oar, pedal, and planted-pole targets. V3, procedural 3D, and Canvas
remain automatic fallbacks.

- **Purpose:** one generic repository-authored production `SkinnedMesh` with a
  stable 19-bone semantic skeleton, optional visual deformation helpers, and
  distinct deterministic RowErg, SkiErg, and BikeErg base clips. Runtime
  samples normalized clip time from replay phase and applies the analytic
  contact pass after the authored pose.
- **Ownership and licence:** created specifically for rowplay from source in
  this repository; copyright (c) 2026 shenghaoc and rowplay contributors and
  distributed under the repository's MIT `LICENSE`. It contains no downloaded
  model, scan, likeness, avatar-generator output, user data, image, texture, or
  external request.
- **Source of truth:** `scripts/build-replay-athlete-v4-blender.py` authors a
  denser anatomical cage, voxel-remeshes it into a coherent primary body mass,
  transfers cage skin weights, and paints kit/skin/footwear vertex colours in
  Blender 5.2. `src/lib/replay/rigV4.ts` owns the semantic skeleton, contacts,
  and clips; `scripts/build-replay-rig-v4.mjs` remaps Blender's exported joint
  indices to the canonical semantic order while preserving documented visual
  helper joints and sealing the final GLB. The scripts and GLB are production
  contracts. Set `BLENDER_BIN` when Blender is not installed at the default
  macOS application path.
- **Native handoff:** `rowplay-athlete-v4.usdz` is generated from the exact GLB
  by Blender 5.2. `scripts/build-replay-rig-v4-usdz.ts` honours `BLENDER_BIN`
  and launches the converter in `scripts/build-replay-rig-v4-usdz.py`. The
  derivative is for RowPlay Studio / PR #72 and must not be independently
  remodelled. The web runtime remains GLB through `GLTFLoader`.
- **Machine-readable contract:** `rowplay-athlete-v4.contract.json`, generated
  by `scripts/build-replay-rig-v4-contract.mjs`, records artifact hashes,
  units/axes, skeleton order, rest transforms, clips, phase landmarks, contact
  metadata, surface roles, provenance, and validation commands.
- **Rebuild and validate:** `vp run build:replay-rig-v4`,
  `vp run build:replay-rig-v4-usdz`,
  `vp run build:replay-rig-v4-contract`, then
  `vp run validate:replay-assets`. The build exports and reloads the GLB and
  rejects skeleton, clip, drive-boundary, skin, or contact-metadata drift. The
  USDZ portability gate lives in `src/lib/replay/rigV4Usd.test.ts`.
- **Reviewed artifact:** see `rowplay-athlete-v4.contract.json` for the sealed
  byte count and SHA-256. Two independent Blender→Node builds should match
  within normal float noise; commit the validator-checked binary.
- **Reviewed USDZ derivative:** Blender 5.2 does not produce byte-identical
  USDZ containers across repeat exports, so repeat-export acceptance is
  semantic: Three.js `USDLoader` must load one skinned athlete with the 19
  semantic bones in order (plus any contract-recorded visual helpers), finite
  normalized skin weights, finite bounds, matching triangle count, no
  external-looking references, and clone-safe skeleton/material instances.
- **Reviewed contract:** schema `rowplay.replay.athlete.v4`, version `1`.
- **Exact geometry inventory:** one indexed `SkinnedMesh`, 19 named semantic
  bones plus any contract-recorded visual helpers, 12 connected topology
  components sealed in the current contract, one portable opaque vertex-colour
  material in the GLB, and zero embedded textures/images. The reviewed
  `TEXCOORD_0` layout exists solely for the web loader's local,
  deterministic per-instance material maps; it adds no asset request or native
  bitmap dependency. The web loader derives seven independent runtime
  `MeshPhysicalMaterial` surface roles (`skin`, `jersey`, `lower`, `footwear`,
  `hair`, `trim`, and `face-detail`) from the reviewed colour regions while
  retaining the same geometry, skeleton, and asset request. The semantic order
  is the only replay-motion interface; helper joints may influence skinning but
  are not direct animation targets. The surface is a coherent sports character:
  ribcage-emergent shoulders, tapered limbs with volume at elbows/knees,
  modelled palm mass, performance shoes, deliberate kit panels, and a generic
  facial plane with brow, eye, nose, cheek, chin, hair, and sideburn silhouette.
  Exact vertex, triangle, and topology-component counts are recorded in the
  contract and are not frozen as an art-quality proxy.
- **Quality tiers:** Low, Medium, High, and Ultra use the same athlete and
  contact-safe technique. They are progressive rather than a single Ultra leap:
  Low keeps clean regional colour and no generated maps; Medium adds 32px
  deterministic UV albedo, normal, roughness, and relief maps; High raises
  those maps to 64px with stronger material response; Ultra raises them to 96px
  alongside further skin roughness/specular, fabric sheen, footwear/trim
  clearcoat, hair response, and face-detail refinement. This makes higher
  quality visibly spend compute on the athlete while preserving phase, clip,
  proportions, and equipment contacts.
- **Depth contract:** both live and ghost V4 bodies render with `opacity: 1`,
  `transparent: false`, and depth test/write enabled. Ghost identity uses a
  cool material tint while ghost equipment/wakes may remain translucent; the
  single deforming skin never enters Three.js's transparent triangle-sorting
  path, so limbs and overlapping garment forms cannot disappear by draw order.
  BikeErg's fixed saddle is a low-profile opaque support drawn before the skin
  without writing depth, so the athlete naturally occludes the overlapping
  cushion pixels instead of appearing to pass through a thick solid block.
- **Skinning:** elbow, wrist, knee, ankle, shoulder, and hip rings use spatial
  parent-to-child weight gradients. The seated posterior uses a shallow
  pelvis-led relief blend so the thigh seam does not sweep the body through the
  BikeErg support under crank motion. Palm/sole marker nodes and terminal-bone
  glTF extras encode exact local contact offsets: left/right hand
  `[-0.08,-0.01,0.035]` / `[0.08,-0.01,0.035]`; both feet
  `[0,-0.055,0.13]`.
- **Animations:** three normalized one-second clips, each with one hips
  translation and 19 semantic quaternion tracks: `rowplay-v4-row-cycle`
  (authored drive end `0.38`), `rowplay-v4-ski-cycle` (`0.34`), and
  `rowplay-v4-bike-cycle` (`0.5`). Helper joints derive their deformation pose
  from that hierarchy and never receive replay animation tracks. Clip extras
  also preserve the canonical phase schema and data-truth boundary.
- **Verification:** Blender studio renders can be reproduced with
  `scripts/render-replay-rig-v4-qa.py`. Source tests cover normalized finite
  weights, exact bone and contact schemas, topology component count,
  joint-weight gradients,
  deep-flex volume, distinct clip signatures, exact drive landmarks,
  deterministic seeking, loop closure, and GLB → `GLTFLoader` →
  `AnimationMixer` round-trip. The raw GLB validator independently checks the
  same binary contract, embedded-only delivery, and absence of external URIs.

The clips are polished generic technique, not measured athlete biomechanics.
Concept2 cadence and replay timing determine when they are sampled; no user
joint path, force curve, body shape, or technique is inferred.

See `docs/native-athlete-handoff.md` for the RowPlay Studio consumption
boundary.

## Provenance policy

Do not replace or extend this package with an undocumented downloaded asset. A
future externally sourced contribution must record the exact creator, source
URL, asset version, licence text, required attribution, and every modification,
and its licence must permit redistribution with this MIT project. Scanned
people, athlete likenesses, avatar-generator output, and user images are not
permitted.

This asset-policy exception is limited to athlete and sport-equipment geometry.
Replay environments remain governed by the procedural-environment provenance
policy in `.kiro/specs/replay-premium-environments/`.
