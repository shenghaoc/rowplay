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
- **Reviewed V3 artifact:** 681,908 bytes; SHA-256
  `db15f6b1a32c0c65c64cd4071ab6df9a51eb5658be73720837f94cd5d61c8df5`.
- **Inventory:** 18 compatibility leaf meshes, seven composite roots, and 49
  direct composite parts (25 top-level logical entities; 74 nodes / 67 mesh
  nodes total). The package has 26,846 indexed triangles and 18,907 indexed
  vertices, one neutral placeholder material, zero textures/images, zero
  animations, and zero skins.
- **Detail language:** shared-vertex smooth normals, a neutral lower rowing hull
  beneath lane-coloured split decks, directional brow/nose/ear
  head planes, a swept hair cap, an aero helmet with tail and visor, low-relief
  jersey collar/raglan/back-yoke construction, asymmetric muscle-to-tendon
  limbs, deltoid transitions, and grip/sole/elbow detail. Equipment includes a
  Blender-authored open-U racing shell with split decks, recessed cockpit,
  slide rails, angled stretcher, heel cups, wing rigger, oarlocks, moving
  four-roller seat carriage, and sculpted oar; raised ski deck and binding; and a
  stylised **diamond-frame road bicycle** — aero-rim wheels with 14 fine spokes
  and six-spoke disc rotors, a main triangle with chain- and seat-stays and fork
  blades, chain and cassette, calipers, contact-aligned brake hoods and levers, a
  channelled performance saddle on a post that stops beneath the pad, and a
  rotating crank assembly. The bicycle is a course-progress metaphor rather than
  a model of Concept2's stationary BikeErg. Every one of those frame nodes is
  read at build time from the shared `src/lib/replay/bikeRig.js` contract that
  `makeBikeAvatar` also uses, so the checked-in V3 equipment cannot drift from
  the renderer's sit/grip/pedal fit; `validate-replay-assets.mjs` additionally
  refuses any frame geometry that rises above the saddle pad within the rider's
  footprint. Bike equipment provenance and the evaluated-but-not-imported CC-BY
  spin-bike candidate are recorded in `source/bike/PROVENANCE.md`. All detail is
  generated from reviewed local Three.js or Blender Python source; there is no
  image, texture, downloaded model, scan, or avatar-generator output.

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

- **Purpose:** one generic, provenance-reviewed production `SkinnedMesh` with a
  stable 19-bone semantic skeleton, 32 visual-only articulated grip helpers, and
  distinct deterministic RowErg, SkiErg, and BikeErg base clips. Runtime
  samples normalized clip time from replay phase and applies the analytic
  contact pass after the authored pose.
- **Ownership and licence:** the anatomical topology is Dan Ulrich / Blender
  Studio's **Human Base Meshes v1.4.1**, released under CC0-1.0 and downloaded
  from the [official Blender asset bundle](https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip).
  RowPlay's extraction, retargeting, rigging, appearance, build code, and other
  modifications are distributed under the repository's MIT `LICENSE`. The
  result is a generic anatomical base adaptation, not a scan, likeness,
  avatar-generator output, user image, embedded texture, or runtime request.
- **Reviewed base source:** `source/rowplay-human-base-male-v1.4.1.blend` is a
  2.25 MB audited subset containing the body and two eyes at one applied
  multires level. `scripts/extract-replay-athlete-base-blender.py` documents
  and reproduces that extraction from the exact v1.4.1 bundle; the `.blend`
  also embeds its provenance record.
- **Production source of truth:** `scripts/build-replay-athlete-v4-blender.py`
  deterministically retargets the source A-pose into the existing V4 rest
  skeleton, assigns bounded four-influence weights including grip helpers,
  preserves one continuous anatomical body, adds repository-authored short
  hair, eyes, performance footwear, and kit accents, and paints reviewed
  skin/fabric/hair/footwear regions in Blender 5.2.
  `src/lib/replay/rigV4.ts` continues to own the semantic skeleton, contacts,
  and clips; `scripts/build-replay-rig-v4.mjs` remaps Blender's exported joint
  indices to canonical order and seals the final GLB. Set `BLENDER_BIN` when
  Blender is not installed at the default macOS application path.
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
  bones plus 32 contract-recorded visual grip helpers, a continuous human body
  core plus deliberate eye/hair/footwear detail islands, one portable opaque
  vertex-colour material in the GLB, and zero embedded textures/images. The
  reviewed `TEXCOORD_0` layout exists solely for the web loader's local,
  deterministic per-instance material maps; it adds no asset request or native
  bitmap dependency. The web loader derives eight independent runtime
  `MeshPhysicalMaterial` surface roles (`skin`, `jersey`, `lower`, `footwear`,
  `hair`, `trim`, `eye`, and `face-detail`) from the reviewed colour regions while
  retaining the same geometry, skeleton, and asset request. The semantic order
  is the only replay-motion interface; helper joints may influence skinning but
  are not direct animation targets. Each hand has a shallow palm-cup helper,
  four three-segment finger chains, and a three-segment opposing-thumb chain
  derived from the reviewed anatomical face sets. The surface now carries anatomically
  modelled head/face/ears, individual fingers and toes beneath equipment,
  ribcage, shoulder, pelvis, knee, calf, and hand volume from the reviewed
  human topology; RowPlay supplies performance kit regions, close sports hair,
  footwear, and the post-contact finger curl. Exact vertex, triangle, and
  topology-component counts are recorded in the contract and are not frozen as
  an art-quality proxy.
- **Quality tiers:** Low, Medium, High, and Ultra use the same athlete and
  contact-safe technique. They are progressive rather than a single Ultra leap:
  Low keeps clean regional colour and no generated maps; Medium adds 128px
  deterministic UV albedo, normal, roughness, and relief maps; High raises
  those maps to 256px with stronger material response; Ultra raises them to
  512px alongside further skin roughness/specular, fabric sheen, footwear/trim
  clearcoat, hair response, wet-eye optics, and face-detail refinement. This makes higher
  quality visibly spend compute on the athlete while preserving phase, clip,
  proportions, and equipment contacts.
- **Depth contract:** both live and ghost V4 bodies render with `opacity: 1`,
  `transparent: false`, and depth test/write enabled. Ghost identity uses a
  cool material tint while ghost equipment/wakes may remain translucent; the
  single deforming skin never enters Three.js's transparent triangle-sorting
  path, so limbs and overlapping garment forms cannot disappear by draw order.
  BikeErg seating is geometric: the V4 posterior sit surface is constrained onto
  the pad top (hip Y derived from the measured sit offset), and the saddle is a
  thin performance shell with a centre channel plus sit-bone platforms so the
  butt does not pass through the cushion.
- **Skinning:** reviewed anatomical face sets drive deterministic A-pose→V4
  segment retargeting and bounded parent/child blends at shoulders, elbows,
  wrists, hips, knees, and ankles. The continuous body's major limb influences
  must remain in the pelvis/torso component; the validator rejects merely
  overlapping or capped limb islands. The seated posterior uses a shallow
  pelvis-led relief blend so the thigh seam does not sweep the body through the
  BikeErg support under crank motion. Palm/sole marker nodes and terminal-bone
  glTF extras encode exact local contact offsets: left/right hand
  `[-0.08,-0.01,0.035]` / `[0.08,-0.01,0.035]`; both feet
  `[0,-0.055,0.13]`.
- **Grip closure:** after the exact palm solve, runtime applies bounded
  sport-specific helper rotations for the RowErg scull, SkiErg cylindrical
  grip, or BikeErg hood. Individual proximal/intermediate/distal segments and
  the opposing thumb visibly enclose the local handle without moving the
  semantic hand or equipment contact. The validator requires the exact helper
  hierarchy and a meaningful checked skin influence for every helper.
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
  deterministic seeking, loop closure, articulated-grip reset/contact
  retention, and GLB → `GLTFLoader` →
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
