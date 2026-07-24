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

The GLB and USDZ byte counts and SHA-256 digests are sealed in
`static/replay-assets/rowplay-athlete-v4.contract.json` after each rebuild. A
contract cannot include its own digest, so this handoff pins the checked
contract identity separately:

| Artifact                           |  Bytes | SHA-256                                                            |
| ---------------------------------- | -----: | ------------------------------------------------------------------ |
| `rowplay-athlete-v4.contract.json` | 11,981 | `6495812d54c2952d49f01791fe252ed465572689f1cc72271ad34c36808bcccd` |

After an asset or contract rebuild, run `vp run build:replay-rig-v4-contract`
and update this contract row in the same reviewed change.

Blender 5.2 does not currently produce byte-identical USDZ containers across
repeat exports. Two same-basename exports differed in the `.usdc` payload, so
the release contract records the checked artifact SHA and validates portability
semantically through Three.js `USDLoader`: one skinned athlete, the 19 semantic
bones in contract order, normalized finite skin weights, finite bounds,
matching triangle count, no external-looking references, and clone-safe
skeleton/material instances.

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
- Mesh: one production `SkinnedMesh` with remeshed body mass plus post-remesh
  hands, face, kit trim, and shoe overlays (component count sealed in the
  contract as inventory, not an art-quality target). The GLB embeds no images
  or textures, but carries reviewed `TEXCOORD_0` coordinates so the web runtime
  can add deterministic per-instance surface material maps at Medium and above
  without an external request: 128px at Medium, 256px at High, and 512px at Ultra.
- Bones: stable 19-bone V4 semantic order; the checked contract records any
  optional visual helper bones and their rest transforms. Helpers may influence
  deformation but inherit semantic motion and are never replay-motion targets.
- Clips: RowErg, SkiErg, BikeErg normalized one-second technique clips
- Contacts: left/right palms and soles only; runtime equipment constraints
  remain authoritative
- Visual QA: `docs/visual-qa/replay-athlete-v5.md`

## Build and validation

Run from the rowplay repository root:

```sh
vp run build:replay-rig-v4
vp run build:replay-rig-v4-usdz
vp run build:replay-rig-v4-contract
vp run validate:replay-assets
vp test run src/lib/replay/rigV4Usd.test.ts
```

The USDZ launcher uses `/Applications/Blender.app/Contents/MacOS/blender` by
default and honours `BLENDER_BIN` for another Blender 5 executable, including
Linux and non-standard macOS installations.

The USDZ validation is a native handoff and portability gate. It does not switch
the production web loader from `GLTFLoader`/GLB to `USDLoader`/USDZ.
