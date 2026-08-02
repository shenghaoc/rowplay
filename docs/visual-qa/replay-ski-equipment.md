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

> **Validated fit.** The lengths were re-derived against the measured 1.64 m
> shipped rig: 1.90 m skis are ~116% of stature and 1.37 m poles are ~83.5%.
> `skiEquipment.test.ts` pins both ratios so a future asset or equipment change
> cannot silently move them outside the documented classic bands.

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

### Thumb closure on the pole (2026-08-02)

The SkiErg grip contract inherited `thumbOppose: 0.62` from a pose that asserts
nothing about thumb contact. Measured on the shipped rig that stood the thumb
pad ~20 mm off the rendered rubber, with the thumb extended up the shaft rather
than closed around it — the same floating-thumb defect PR #181 fixed on the
BikeErg hood. It survived PR #179 because RowErg and BikeErg each pin their five
per-digit contact reports while SkiErg pinned only angular coverage and
opposition, so no test could see it.

The opposition is now the fitted `SKI_POLE_THUMB_OPPOSE = 1.75`, living in
[`skiEquipment.ts`](../../src/lib/replay/skiEquipment.ts) beside the rubber it
was fitted to. The [capture manifest](ski-equipment/in-app/pr-ski-thumb/manifest.json)
records source commit `0e767d13`. Every frame is a real application capture from
the Workers-faithful preview (`wrangler dev`) in headed Chromium on the hardware
WebGPU backend, at requested **and effective** Ultra, in the production
1112×420 replay stage, with no browser errors or warnings.

| Frame                                                                                     | Acceptance purpose                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Thumb before / after](ski-equipment/in-app/pr-ski-thumb/thumb-before-after.jpg)          | Both hands at both instants, against the same frames re-rendered at the inherited 0.62. The thumb closes from standing up the shaft to lying across the fist. |
| [Grip camera, plant](ski-equipment/in-app/pr-ski-thumb/poses/ski-grip-plant.jpg)          | Macro: both fists closed on their shafts at the plant, with the far hand showing the thumb-side lane directly.                                                |
| [Grip camera, loaded press](ski-equipment/in-app/pr-ski-thumb/poses/ski-grip-press.jpg)   | Macro: the closure survives the most flexed wrist of the cycle on both sides.                                                                                 |
| [Chase camera, plant](ski-equipment/in-app/pr-ski-thumb/poses/ski-chase-plant.jpg)        | Ordinary viewing distance: the high plant reads as compact closed fists, no splayed or floating digit.                                                        |
| [Chase camera, loaded press](ski-equipment/in-app/pr-ski-thumb/poses/ski-chase-press.jpg) | Ordinary viewing distance: down-and-back arms with both grips still closed and the poles trailing to their planted baskets.                                   |

**Why the chase frames are part of acceptance, not a nicety.** A grip close-up
has twice hidden a defect in this repo that the ordinary chase view showed
plainly, so a macro frame alone is not acceptance here. Both cameras are
captured at both instants.

The before column of the comparison sheet is a throwaway build made by
temporarily setting the constant back to 0.62; everything else — commit, camera,
theme, quality, cycle times — is held fixed, so the digit that moves between the
columns is the thumb. Which hand is which is pinned by name in the suite rather
than read off the pixels: the grip camera's rear-three-quarter framing shows one
hand from the thumb side and the other from the back.

No `front` frame is included. That capture-only portrait is framed for the
seated rower and clears only the top of a standing skier's head, so it would add
an unreadable file rather than a second angle. It is a pre-existing limitation of
that camera, untouched by this pass.

Regression cover added with the fix:

- **Per-digit contact** (`closes every reaching SkiErg digit onto the pole and
reports the pinky honestly`) — the five contact reports SkiErg was missing.
  The pinky saturates all three stage limits (~280° curl) and still stops ~6 mm
  short of a shaft this thin, so `contact` is `false` and the test pins that it
  closes _completely_ rather than that it arrives. Widening
  `FINGER_STAGE_LIMITS` to force contact would author an anatomically
  impossible pinky.
- **Rendered-shaft check** (`presses the SkiErg thumb pad onto the rendered
shaft`) — `surfaceDistance` is measured against whatever radius the contract
  supplied, so a seated thumb there can still be a floating thumb on screen.
  This measures the pad against the shaft geometry that actually renders, at
  four points around the cycle on both hands.
- **Solver guard** (`seats the pole thumb on the shaft instead of standing it
alongside`) — with a deliberately-failing 1.50 control so the assertion cannot
  be trivially satisfied.
- **Stacking bounds** were re-fitted rather than relaxed. The old
  pair was measured against a thumb standing _above_ the index, which a wrapped
  thumb cannot satisfy; the invariant is now that the pad lies across the fist —
  below the index, level with the middle, well above the pinky — which still
  rejects the inverted fist the original assertion was written to catch.

The closure _policy_ is unchanged: SkiErg keeps the sequential first-contact
solve its approved poses were fitted against, and only the opposition constant
moved. The BikeErg enclosure opt-in stays Bike-only.

### PR #179 exact-head regression audit (2026-08-02)

Fresh Codex in-app browser captures audit source commit
`58b41caeafd232a0d93957ffcd5d74d6f29c7c47` (the reviewed code/spec head before
this evidence-only commit). The
[`manifest`](ski-equipment/in-app/pr179-current/manifest.json) records the
WebGPU/Ultra backend, exact routes, viewports, pose times, and file hashes.

| Artifact                                                                                          | Shows                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`ski-high-reach-desktop.png`](ski-equipment/in-app/pr179-current/ski-high-reach-desktop.png)     | 1440×1024 grip camera: bilateral shaft enclosure at the recovery apex    |
| [`ski-loaded-press-desktop.png`](ski-equipment/in-app/pr179-current/ski-loaded-press-desktop.png) | 1440×1024 grip camera: down-and-back elbows and loaded bilateral closure |
| [`ski-high-reach-mobile.png`](ski-equipment/in-app/pr179-current/ski-high-reach-mobile.png)       | 390×844 ordinary close camera: full-athlete recovery composition         |
| [`ski-loaded-press-mobile.png`](ski-equipment/in-app/pr179-current/ski-loaded-press-mobile.png)   | 390×844 ordinary close camera: loaded press plus usable replay controls  |

The temporary worktree used the repository dependency tree through a symlink,
so Vite declined to serve those external font files. These frames therefore
accept geometry, responsive composition, and controls; the production build
gate remains the typography proof. The browser console itself was clean.

### Full matrix baseline

Real application captures, not renders. Manifest with per-file requested vs
effective quality, backend, and stage size:
[`ski-equipment/in-app/manifest.json`](ski-equipment/in-app/manifest.json).

| Artifact                                                                                  | Shows                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`poses/ski-loaded-press.jpg`](ski-equipment/in-app/poses/ski-loaded-press.jpg)           | Chase-distance silhouette: planted poles, skis under the boots      |
| [`poses/ski-high-reach.jpg`](ski-equipment/in-app/poses/ski-high-reach.jpg)               | Top of recovery — the reach-limited phase named below               |
| [`poses/grip-ski-loaded-press.jpg`](ski-equipment/in-app/poses/grip-ski-loaded-press.jpg) | Macro grip camera: shaft through the fist, strap, basket            |
| [`tiers/tier-ski-equipment-{low,medium,high,ultra}.jpg`](ski-equipment/in-app/tiers/)     | Progressive **geometry**: top sheets, edges, closures, straps, ribs |
| [`cycles/ski-one-cycle.webm`](ski-equipment/in-app/cycles/ski-one-cycle.webm)             | One full technique cycle                                            |

The full matrix evidence is captured **headed** (`--headed`), which gives Playwright's
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

### Recovery closure and wrist envelope

The former one-sided recovery defect is resolved. The V4 solve now converts the
oriented fist-channel offset into world space for each visible shoulder and
retains a 60 mm reachable interval at peak post-release extension; collapsing
that interval onto a tangent sphere was the source of the measured 0.138 m
branch jump. The dense 1/256-cycle production sweep now keeps both hands inside
the 5 mm SkiErg contact budget and every adjacent grip step below 50 mm.

The free return also uses the same geometry-conditioned shaft-spin relief as
the loaded pull, with a bounded diagonal hold and a lower-but-visible basket
clearance. Across 257 cycle samples per side, hand-long-axis wrist bend now
measures 87.9° at p95 and 91.1° maximum; every true palm normal remains inward,
the grip enclosure stays on the rendered pole, and the forearm segments remain
continuous.

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

## Definition of done

- [x] Equipment geometry progressive across all four tiers, captured
- [x] Wrist frame yaw-invariant, with a failing-before/passing-after test
- [x] Contact tolerances restored; residuals named rather than budgeted away
- [x] Asset build deterministic from reviewed source (no self-reference)
- [x] Provenance accurate; no third-party textures shipped
- [x] Left-hand recovery reach defect resolved with symmetric 5 mm contact and
      dense continuity guards
- [x] Ski/pole length re-derived against the measured 1.64 m rig
