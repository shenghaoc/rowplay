# SkiErg equipment and proportion visual acceptance

This note records the follow-up to PR #172 for the corrected scope: the skis,
ski poles/hand hardware, and the athlete-to-equipment proportions. BikeErg
geometry is intentionally unchanged by this pass.

## Visual target

The skier should read as an athlete on **readable Nordic equipment** — narrower
and more cambered than main's 110 mm planks, but still a visible platform under
the boot at chase-camera distance. Literal 44–47 mm FIS race stock disappears at
this distance.

Contract, with ratios against the **measured 1.64 m V4 rest-pose stature**
(pinned by `renderer3d.test.ts`, not a nominal figure):

| Piece                  |       Value | Rationale                                       |
| ---------------------- | ----------: | ----------------------------------------------- |
| Ski length             |  **1.90 m** | ~116% height — inside the classic 112–117% band |
| Ski max width          | **0.072 m** | Readable needle (~72 mm); boot sole sits on it  |
| Stance (centre–centre) |  **0.30 m** | Slightly outside hip width                      |
| Pole length            |  **1.37 m** | ~83.5% height — inside the classic 83–84% band  |
| Pole plant lateral     | **±0.46 m** | Just outside the ski pair                       |

Ski and pole length have been re-derived against the shipped 1.64 m V4 rig;
the ratios above are pinned in `skiEquipment.test.ts` so an asset or equipment
change cannot silently move them outside the accepted bands.

**Coherence rule:** boot sole width ≈ ski width × 1.15. A 10 cm boot on a
4.6 cm ski is what made the literal-race pass look broken.

The procedural arm and leg chain lengths remain PR172's contact-safe values so
the new hard-surface proportions do not move the authoritative hands, feet,
knees, or planted baskets outside the reach envelope.

Shared anchors:

- skis: `x = ±0.15`, `y = 0`, `z = 0.16`;
- boots and ankle targets: `x = ±0.15`, `z = 0.18`;
- pole plant lateral offset: `±0.46` from the course centre;
- athlete shoulders: `±0.25` with the existing PR172 arm reach envelope.

## Equipment form language

- **Skis** — long runners with mild sidecut, gradual tip rise, metal edges at
  High/Ultra, accent topsheet.
- **Bindings** — free-heel plate spanning most of the ski width, toe pins, low
  heel bumper only.
- **Boots** — compact Nordic shells sized to the ski platform, low cuff, rubber
  sole, toe bar; graphite black.
- **Poles** — thin carbon taper, ergonomic grip + strap, hard-track basket
  ~55 mm.

## Progressive graphics tiers

| Tier   | Ski and pole geometry                                                                                        | Equipment surface        | Athlete surface                                   |
| ------ | ------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------- |
| Low    | Complete runner, raised tip, slim boot shell, tapered shaft, grip and small basket                           | Procedural solid colours | PR172 V4 low material path or procedural fallback |
| Medium | Top sheet, binding plate/rails, free-heel toe bar, boot closures, grip straps                                | Procedural solid colours | PR172 V4 medium detail path                       |
| High   | Medium hardware plus metal ski edges and basket ribs; authored V3 ski assembly                               | Procedural solid colours | PR172 V4 high detail path                         |
| Ultra  | High geometry at the highest procedural radial resolution; authored V3 assembly with Ultra athlete materials | Procedural solid colours | PR172 V4 Ultra detail path                        |

## Provenance and licence

SkiErg equipment **geometry** is generated locally by
`src/lib/replay/renderer3d.ts` and `scripts/build-replay-assets.mjs` (MIT).
Equipment **shading stays procedural at every tier**.

An earlier revision of this branch shipped Poly Haven CC0 texture maps for the
High/Ultra metal, rubber, and leather roles. They were removed: the authored V3
ski composite carries POSITION and NORMAL only (enforced by
`scripts/validate-replay-assets.mjs`) and hides the UV-bearing procedural
fallback on those exact tiers, so every fragment sampled a single texel while
`color.setHex(0xffffff)` discarded the base tint — strictly worse than the
untextured baseline, for 613 KiB. Any future map must land together with UVs
and a relaxed slot validator.

Outdoor XC photographs informed silhouette only; they are not imported as
geometry, textures, or likenesses.

## In-app evidence

Real application captures, not renders. Manifest with per-file requested vs
effective quality, backend, and stage size:
[`ski-equipment/in-app/manifest.json`](ski-equipment/in-app/manifest.json).

| Artifact                                                                                  | Shows                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`poses/ski-loaded-press.jpg`](ski-equipment/in-app/poses/ski-loaded-press.jpg)           | Chase-distance silhouette: planted poles, skis under the boots      |
| [`poses/ski-high-reach.jpg`](ski-equipment/in-app/poses/ski-high-reach.jpg)               | Top of recovery — the post-release reach/contact phase              |
| [`poses/grip-ski-loaded-press.jpg`](ski-equipment/in-app/poses/grip-ski-loaded-press.jpg) | Macro grip camera: shaft through the fist, strap, basket            |
| [`tiers/tier-ski-equipment-{low,medium,high,ultra}.jpg`](ski-equipment/in-app/tiers/)     | Progressive **geometry**: top sheets, edges, closures, straps, ribs |
| [`cycles/ski-one-cycle.webm`](ski-equipment/in-app/cycles/ski-one-cycle.webm)             | One full technique cycle                                            |

All evidence is captured **headed** (`--headed`), which gives Playwright's
Chromium a real Metal-backed WebGPU adapter: the manifest records
`backend: WEBGPU` with requested = effective quality for every file, so the
Ultra tier frame **is** genuine hardware-WebGPU Ultra acceptance. Headless
capture remains available but reports WebGL and downgrades Ultra to High;
the per-file manifest fields make either mode self-describing.

### Wrist frame

Hand-frame angles chosen by eye are gone. They were never the right parameter:
the hand has to be built **against the pole**, and two rig measurements fully
determine it.

1. **Curl axis.** Every phalanx helper flexes about its own local +X, which is
   `(-0.61, ±0.16, ±0.77)` in the hand's frame. A fist encloses a cylinder only
   when that axis is parallel to it. The shipped frame had it at 0.11–0.72 —
   the shaft lay _along_ the palm rather than across it, so the hand ran past
   the pole and only the fingertips reached back. It is now 0.96–1.00 at every
   cycle.
2. **Grip channel.** The authored palm contact is a point on the palm
   _surface_, ~8.5 cm from the wrist; driving that onto the shaft axis laid the
   pole across the knuckles. The fist's real curl centre — fitted from the
   circle the curled middle finger traces — is `(±0.0393, -0.0088, 0.0142)`
   with a 0.0169 m radius. Driving _that_ onto the axis seats the shaft inside
   the curl: the fingertip now rides the grip cylinder at 0.017 m instead of
   hovering 0.057 m away.

Aligning the curl axis leaves exactly one freedom, spin about the shaft.
Inheriting it from the shaft frame turned the backs of the hands toward each
other, so it is resolved explicitly: the palms face **inward**, with the
wrist → grip-channel vector pointing at the athlete's centreline.

Both constants are measurements of the shipped GLB, re-derived from the rig by
`derives the SkiErg curl axis and grip channel from the authored rig` so an
asset rebuild cannot silently invalidate them.

### Recovery contact closure

The former left-hand-only gap at cycle 0.31–0.34 is resolved. Its measured peak
was 0.135 m because the free-pole preference used one shared procedural
shoulder/reach scalar while the visible V4 rig had separate sampled shoulders
and reached through a wrist bone plus an oriented fist-channel offset.

`SkiGripReachSolver` now derives each side from its current visible shoulder and
structural shoulder-to-wrist reach, rotates the fitted fist-channel offset
through the final pole-led hand frame, and intersects that wrist sphere with
the rigid 1.37 m pole sphere. If an authored airborne basket is infeasible it
moves only by the minimum distance needed for closure; a planted course anchor
never moves. A C2 reach floor continues extension through basket release, then
returns authority to the recovery arc by the flight apex. Dense production
V4 sampling keeps both grip channels below the 5 mm contact budget without
post-release elbow re-bend.

## Validation

```sh
vp run check                 # includes validate:replay-assets and the full suite
vp run build:replay-assets   # requires Blender 5 (BLENDER_BIN to override)
vp run validate:replay-assets
```

`vp run build:replay-assets` reproduces
`4422979720d151711c07f7f7107dda86aff1ee51681f86e386ce898ace9a8db8` (720,756
bytes) byte for byte on Blender 5.2.0 LTS. Review the V3 binary size and SHA-256
in [`static/replay-assets/README.md`](../../static/replay-assets/README.md)
after any rebuild.

Regression cover added by this pass:

- `holds one SkiErg wrist frame all the way around the course loop` — the wrist
  frame is invariant across four headings. Fails at 120° drift on the previous
  `rotateOnWorldAxis(courseRightWorld, …)`.
- `closes the SkiErg fist around the pole rather than beside it` — replaces a
  scalar palm-to-grip distance that **any** direction satisfied, which is how a
  hand gripping air 0.042 m from the grip passed. Asserts the curl axis is
  parallel to the shaft, the fingertip rides the grip cylinder, the wrist stays
  within a fist of it, and the palm faces inward. Each clause was verified to
  fail independently when its half of the fix is removed.
- `derives the SkiErg curl axis and grip channel from the authored rig` — pins
  both measured constants against the shipped GLB.
- `keeps SkiErg equipment shading procedural at every tier` — no map may be
  bound to UV-less equipment geometry.
- `gates SkiErg boot and basket trim on the tier that can display it` — boot
  closures, basket ribs, and metal edges asserted in both directions.
- `ties the declared SkiErg standing height to the shipped V4 rig` — makes the
  proportion ratios describe the rendered athlete instead of dividing two
  constants by each other.
- `moves only a released basket enough to close an unreachable grip` and
  `never moves a planted basket when the same geometry is unreachable` — pin
  free-hardware correction and course-anchor authority independently.
- `keeps planted SkiErg hardware fixed in the course while the V4 skier
advances` plus the technique/continuity sweeps — enforce sub-5 mm bilateral
  contact, rigid poles, planted-tip fixation, release extension, and loop
  continuity.

## Definition of done

- [x] Equipment geometry progressive across all four tiers, captured
- [x] Wrist frame yaw-invariant, with a failing-before/passing-after test
- [x] Contact tolerances restored; residuals named rather than budgeted away
- [x] Asset build deterministic from reviewed source (no self-reference)
- [x] Provenance accurate; no third-party textures shipped
- [x] Left-hand recovery reach defect resolved below the 5 mm full-cycle budget
- [x] Ski/pole length re-derived against the 1.64 m rig
