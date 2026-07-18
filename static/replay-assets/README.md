# rowplay replay assets

This directory contains the compact, repository-owned 3D geometry package used
to raise replay figure and equipment quality while retaining rowplay's existing
contact-driven animation rig.

## `rowplay-rigs-v2.glb`

- **Purpose:** texture-free athlete shells and selected RowErg, SkiErg, and
  BikeErg equipment shells for the optional WebGPU/WebGL replay.
- **Ownership:** created specifically for rowplay from source in this repository;
  no third-party model or user data is included.
- **Copyright and licence:** Copyright (c) 2026 shenghaoc and rowplay
  contributors; distributed under the repository's MIT `LICENSE`.
- **Source of truth:** `scripts/build-replay-assets.mjs`.
- **Exporter:** Three.js `GLTFExporter` using the repository-pinned Three.js
  dependency and Node.js 24 or newer.
- **Reviewed v2 artifact:** 162,972 bytes; SHA-256
  `72f4c14e679f7c88ad24dfb9411d5f02de93e43982ca4f886c788f03e98d88d7`.
- **Inventory:** 24 named meshes/nodes: 14 generic athlete slots (including a
  compact asymmetric elbow flex cuff), two RowErg slots, four SkiErg slots
  (skis plus pole shaft, grip, and basket), and four BikeErg slots (7,304
  triangles / 4,099 indexed vertices). The package contains one placeholder
  authoring material, zero textures/images, zero animations, and zero skins.
- **Detail language:** shared-vertex smooth normals and denser lofted anatomy;
  correctly tapered proximal-to-distal limbs; compact cuff overlap;
  performance-shoe layers; sculpted hands and elbow; an aerodynamic helmet
  ridge; and smooth BikeErg slick tyres, aero frame tubes, contoured saddle,
  and clipless pedal shells. Raised geometry details are generated locally with
  Three.js core geometry helpers; no image, texture, or downloaded model is
  involved.
- **Runtime contract:** named `replayAssetSlot` meshes are validated and cloned
  onto the existing live/ghost rig. The GLB does not own timing, contacts,
  recorded animation, theme, or lane identity.
- **External sources:** none.
- **Textures, photographs, scans, and likeness data:** none.
- **Avatar-generator or generated-person output:** none.

The package is a deterministic build artifact. Rebuild v2 from the repository
root with:

```sh
node scripts/build-replay-assets.mjs
```

Review the resulting binary diff and exact byte size before committing it. The
`v2` filename identifies the current required slot and coordinate contract;
use a new versioned filename for an incompatible schema change.

`rowplay-rigs-v1.glb` remains checked in only as a short-lived compatibility
artifact for older branches. It is not rebuilt by the current generator and is
not the primary replay asset package.

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
