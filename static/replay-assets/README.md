# rowplay replay assets

This directory contains compact, repository-owned 3D geometry for the optional
WebGPU/WebGL replay. It improves visible athlete and equipment form without
changing rowplay's contact-driven animation rig, sport timing, live/ghost
identity, or Canvas 2D fallback.

## `rowplay-rigs-v3.glb`

- **Purpose:** a texture-free authored athlete library plus six nested,
  reusable equipment templates for RowErg, SkiErg, and BikeErg.
- **Ownership:** created specifically for rowplay from source in this
  repository. No third-party model, stock asset, or user data is included.
- **Copyright and licence:** Copyright (c) 2026 shenghaoc and rowplay
  contributors; distributed under the repository's MIT `LICENSE`.
- **Source of truth:** `scripts/build-replay-assets.mjs`.
- **Validator:** `scripts/validate-replay-assets.mjs` verifies the binary,
  exact V3 hierarchy, slot/template names, material-role metadata, geometry
  bounds, normals, triangle/vertex/file budgets, and zero external assets.
- **Exporter:** Three.js `GLTFExporter` using the repository-pinned Three.js
  dependency and Node.js 24 or newer.
- **Reviewed V3 artifact:** 589,292 bytes; SHA-256
  `b61bb644a82d75d192bde3d646bd63674e0469288a5da1e0292fc469a22d3fc6`.
- **Inventory:** 18 compatibility leaf meshes, six composite roots, and 39
  direct composite parts (24 top-level logical entities; 63 nodes / 57 mesh
  nodes total). The package has 23,300 indexed triangles and 16,378 indexed
  vertices, one neutral placeholder material, zero textures/images, zero
  animations, and zero skins.
- **Detail language:** shared-vertex smooth normals, directional brow/nose/ear
  head planes, a swept hair cap, an aero helmet with tail and visor, low-relief
  jersey collar/raglan/back-yoke construction, asymmetric muscle-to-tendon
  limbs, deltoid transitions, and grip/sole/elbow detail. Equipment includes a
  sculpted scull, oarlocks and oar, raised ski deck and binding, aero-rim wheels
  with 14 fine spokes and six-spoke disc rotors, a proper diamond-frame bicycle
  with chain/cassette, calipers, contact-aligned brake hoods/levers, and a
  rotating crank assembly. All detail is generated from local Three.js core
  geometry; there is no image, texture, downloaded model, scan, or
  avatar-generator output.

### V3 schema and coordinate contracts

The 18 leaf slots preserve the generic athlete plus contact-sensitive Row blade
and Ski pole pieces. Each leaf has `replayAssetSlot`, `replayAssetKind: "leaf"`,
and a `replayMaterialRole` in its glTF extras.

The six root templates are intentionally transform-free. Their direct child
geometry bakes placement into the mesh, carries `replayAssetTemplateSlot`,
`replayAssetPart`, and `replayMaterialRole`, and remains static until the
existing renderer clones it onto its known rig anchor. Each root records
`replayAssetTemplateSlot`, `replayAssetKind: "composite"`, version 3, the
strict part count, and its material-role list.

| Template root                        | Canonical anchor contract                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equipment:row:boat-assembly`        | Row avatar root coordinates: hull, deck, cockpit rim, riggers, oarlocks, gunwales, and footwell align with the existing boat group; rigger ends meet the animated oar pivots.       |
| `equipment:row:oar-rig`              | One oar at its pin, with `+X` outboard: attach identity on the right and yaw π on the left. The animated blade remains the leaf slot.                                               |
| `equipment:ski:ski-assembly`         | One ski at the existing per-side anchor `(side × 0.21, 0, 0.16)`; clone it once per ski.                                                                                            |
| `equipment:bike:wheel-assembly`      | One wheel at the existing wheel-group centre with its axle along local X; the carrier, rotor spokes, and bolt heads remain wheel-local.                                             |
| `equipment:bike:frame-assembly`      | Bike avatar-root coordinates for the frame, stays, fork, cockpit, calipers, chain/cassette, saddle, and axles. Brake hoods and levers end at the rig's authoritative hand contacts. |
| `equipment:bike:drivetrain-assembly` | Crank-group-local coordinates; the existing renderer rotates the complete root about X and its clipless pedals meet the authoritative foot contacts.                                |

Runtime materials remain outside the GLB. The neutral placeholder is never a
product colour source: `replayMaterialRole` lets the renderer preserve lane
paint, equipment metal/rubber/grip, athlete fabric/skin/hair/footwear,
light/dark themes, and ghost transparency.

Rebuild and validate V3 from the repository root with:

```sh
node scripts/build-replay-assets.mjs
node scripts/validate-replay-assets.mjs
```

Review the resulting binary diff, exact size, and SHA-256 before committing it.
The `v3` filename identifies this composite hierarchy and coordinate contract;
an incompatible change requires a new versioned filename rather than silently
changing V3 meaning.

`rowplay-rigs-v1.glb` and `rowplay-rigs-v2.glb` remain checked in as
compatibility artifacts for older renderer builds. They are not rebuilt by the
current generator. V2's leaf-only package remains the stable fallback while a
renderer adopts V3's template roots.

## `rowplay-rig-v4-prototype.glb` (non-runtime proof)

This is an intentionally isolated feasibility artifact, **not a product asset
and not a renderer integration**. It is not requested by the replay loader,
does not participate in `build:replay-assets` or the V3 validator, and does
not alter WebGPU, WebGL, V3, procedural-3D, or Canvas behavior. It exists to
prove a safe future path away from independently transformed limb shells.

- **Purpose:** a generic repository-authored athlete built as one skinned glTF
  primitive, with a deterministic baseline row-cycle clip that can be sampled
  by `AnimationMixer.setTime()`.
- **Ownership and licence:** created from repository source, copyright (c)
  2026 shenghaoc and rowplay contributors, and distributed under the
  repository's MIT `LICENSE`. It contains no downloaded model, scan, likeness,
  avatar-generator output, user data, texture, image, or external request.
- **Source of truth:** `src/lib/replay/rigV4Prototype.ts`; export and
  round-trip script: `scripts/build-replay-rig-v4.mjs`.
- **Rebuild command:**
  `node --experimental-strip-types scripts/build-replay-rig-v4.mjs`.
  The script exports, reloads with `GLTFLoader`, and rejects a result that does
  not return as one skinned mesh with its named clip preserved.
- **Reviewed artifact:** 223,960 bytes; SHA-256
  `07243050a98472b5712c4eda9fdde0e6e10b89a8ed6d0e17b4f7d4f609611635`.
  Rebuilding twice produced byte-identical output.
- **Exact inventory:** one `SkinnedMesh`, 19 named bones, 2,991 indexed
  vertices, 5,040 indexed triangles, one vertex-colour `MeshPhysicalMaterial`,
  zero textures/images, and one animation named `v4-row-cycle-prototype` with
  13 `QuaternionKeyframeTrack`s (source duration 1.2 seconds; serialized float
  duration 1.2000000476837158 seconds).
- **Proof covered:** `src/lib/replay/rigV4Prototype.test.ts` verifies finite,
  normalized skin weights; deterministic seek sampling; actual vertex movement
  under skinning; and GLB → `GLTFLoader` → `AnimationMixer` round-trip.

The prototype proves that Three.js and glTF skinning are a viable rendering
path. It does **not** prove professional motion quality on its own. Promotion
requires a separate V4 loader/validator contract plus a contact-to-bone adapter
that applies the existing RowErg, SkiErg, and BikeErg hand, foot, oar, pedal,
and planted-pole constraints after the base clip has been sampled.

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
