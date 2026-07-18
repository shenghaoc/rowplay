# rowplay replay assets

This directory contains the compact, repository-owned 3D geometry package used
to raise replay figure and equipment quality while retaining rowplay's existing
contact-driven animation rig.

## `rowplay-rigs-v1.glb`

- **Purpose:** texture-free athlete shells and selected RowErg, SkiErg, and
  BikeErg equipment shells for the optional WebGPU/WebGL replay.
- **Ownership:** created specifically for rowplay from source in this repository;
  no third-party model or user data is included.
- **Copyright and licence:** Copyright (c) 2026 shenghaoc and rowplay
  contributors; distributed under the repository's MIT `LICENSE`.
- **Source of truth:** `scripts/build-replay-assets.mjs`.
- **Exporter:** Three.js `GLTFExporter` using the repository-pinned Three.js
  dependency and Node.js 24 or newer.
- **Reviewed v1 artifact:** 125,844 bytes; SHA-256
  `0406598f88bbfcd167b0310189d8deca6eb224e81f6fb7567e95954e9ab34bfd`.
- **Inventory:** 20 named meshes/nodes: 13 generic athlete slots, two RowErg
  slots, one SkiErg slot, and four BikeErg slots (1,552 triangles / 4,656
  vertices). The package contains one placeholder authoring material, zero
  textures/images, zero animations, and zero skins.
- **Runtime contract:** named `replayAssetSlot` meshes are validated and cloned
  onto the existing live/ghost rig. The GLB does not own timing, contacts,
  recorded animation, theme, or lane identity.
- **External sources:** none.
- **Textures, photographs, scans, and likeness data:** none.
- **Avatar-generator or generated-person output:** none.

The package is a deterministic build artifact. Rebuild it from the repository
root with:

```sh
node scripts/build-replay-assets.mjs
```

Review the resulting binary diff and exact byte size before committing it. The
`v1` filename identifies the required slot and coordinate contract; use a new
versioned filename for an incompatible schema change.

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
