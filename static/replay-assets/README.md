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
- **Reviewed V3 artifact:** 535,216 bytes; SHA-256
  `77cc32fd30a504dad79295f263c2db278090233a2761e8f6702fa74bc5de8a8a`.
- **Inventory:** 18 compatibility leaf meshes, six composite roots, and 39
  direct composite parts (24 top-level logical entities; 63 nodes / 57 mesh
  nodes total). The package has 20,636 indexed triangles and 14,787 indexed
  vertices, one neutral placeholder material, zero textures/images, zero
  animations, and zero skins.
- **Detail language:** shared-vertex smooth normals, anatomical lofts, tapered
  limbs, grip/sole/elbow details, an aero shell helmet, a sculpted scull,
  oarlocks and oar, raised ski deck and binding, aero-rim wheels with 14 fine
  spokes and six-spoke disc rotors, a proper diamond-frame bicycle with
  chain/cassette, calipers, and contact-aligned brake hoods/levers, plus a
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
