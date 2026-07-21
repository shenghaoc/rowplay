# RowPlay V4 native athlete handoff

PR #171 owns the canonical RowPlay V4 athlete. RowPlay Studio should consume
the checked contract and generated native derivative from this repository; it
must not independently remodel, reproportion, reskin, or reanimate the athlete.

## Canonical source

- Surface source: `scripts/build-replay-athlete-v4-blender.py`
- Rig, contact, and clip source: `src/lib/replay/rigV4.ts`
- Web runtime artifact: `static/replay-assets/rowplay-athlete-v4.glb`
- Native derivative: `static/replay-assets/rowplay-athlete-v4.usdz`
- Machine-readable contract:
  `static/replay-assets/rowplay-athlete-v4.contract.json`
- Contract schema: `rowplay.replay.athlete.v4`, version `1`

The GLB remains the production web runtime artifact. Blender 5.2 authors its
generic local surface from the repository Python script; the Node build remaps
that surface to the canonical V4 skeleton and adds the reviewed clips and
contact metadata. The USDZ conversion script then derives the Studio artifact
from that exact checked GLB and contains no second model or alternative
proportions.

## Artifact identity

| Artifact                           |     Bytes | SHA-256                                                            |
| ---------------------------------- | --------: | ------------------------------------------------------------------ |
| `rowplay-athlete-v4.glb`           |   564,712 | `1cce28920c3735a3f8504d117af3cbbbbac7f9f4c072e7b8e0f662bc9817bbc2` |
| `rowplay-athlete-v4.usdz`          | 1,272,704 | `7a6b5701293b49bef5bd80a2c0fdc7d681303a49f7a243d816988f167142a932` |
| `rowplay-athlete-v4.contract.json` | generated | `76f28df4ce1cba6768a553e41ffce26d6b79625b36f3110f1c3d35e834775262` |

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
vp run build:replay-rig-v4
vp run build:replay-rig-v4-usdz
vp run build:replay-rig-v4-contract
vp run validate:replay-assets
vp test run src/lib/replay/rigV4Usd.test.ts
```

The USDZ validation is a native handoff and portability gate. It does not switch
the production web loader from `GLTFLoader`/GLB to `USDLoader`/USDZ.
