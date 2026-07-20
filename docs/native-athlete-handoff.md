# RowPlay V4 native athlete handoff

PR #171 owns the canonical RowPlay V4 athlete. RowPlay Studio should consume
the checked contract and generated native derivative from this repository; it
must not independently remodel, reproportion, reskin, or reanimate the athlete.

## Canonical source

- Source module: `src/lib/replay/rigV4.ts`
- Web runtime artifact: `static/replay-assets/rowplay-athlete-v4.glb`
- Native derivative: `static/replay-assets/rowplay-athlete-v4.usdz`
- Machine-readable contract:
  `static/replay-assets/rowplay-athlete-v4.contract.json`
- Contract schema: `rowplay.replay.athlete.v4`, version `1`

The GLB remains the production web runtime artifact. The USDZ is a derivative
for RowPlay Studio / PR #72 and is built from the exact GLB through Blender
5.2. The Blender script contains no authoring geometry or alternative
proportions.

## Artifact identity

| Artifact                           |     Bytes | SHA-256                                                            |
| ---------------------------------- | --------: | ------------------------------------------------------------------ |
| `rowplay-athlete-v4.glb`           |   433,104 | `4e658e31254539e00e60adc648a59eafcf033149cd89e641f85bf0391f3a6dba` |
| `rowplay-athlete-v4.usdz`          |   949,794 | `8b7a716bb572c9ff3124a6099c1f12caf41e2f00e33c0c5fc8ef44ba39f3f819` |
| `rowplay-athlete-v4.contract.json` | generated | `edea859484f5a5077eab9d99495a4640c442edae33c5e54f1f4d6f58d9af8f14` |

Blender 5.2 does not currently produce byte-identical USDZ containers across
repeat exports. Two same-basename exports differed in the `.usdc` payload, so
the release contract records the checked artifact SHA and validates portability
semantically through Three.js `USDLoader`: one skinned athlete, the 19 bones in
contract order, normalized finite skin weights, finite bounds, matching
triangle count, no external-looking references, and clone-safe skeleton/material
instances.

## Coordinate and rig contract

The contract JSON records units, axes, handedness, root orientation, exact
ordered bones, parent hierarchy, rest local transforms, clip names and phase
landmarks, contact bone names, roles, offsets, surface roles, provenance, and
build/validation commands.

Summary:

- Units: metres
- Up axis: `+Y`
- Forward axis: `+Z`
- Handedness: right-handed
- Mesh: one intended skinned athlete
- Bones: stable 19-bone V4 order
- Clips: RowErg, SkiErg, BikeErg normalized one-second technique clips
- Contacts: left/right palms and soles only; runtime equipment constraints
  remain authoritative

## Build and validation

Run from the rowplay repository root:

```sh
pnpm run build:replay-rig-v4
pnpm run build:replay-rig-v4-usdz
pnpm run build:replay-rig-v4-contract
pnpm run validate:replay-assets
pnpm test src/lib/replay/rigV4Usd.test.ts --run
```

The USDZ validation is a native handoff and portability gate. It does not switch
the production web loader from `GLTFLoader`/GLB to `USDLoader`/USDZ.
