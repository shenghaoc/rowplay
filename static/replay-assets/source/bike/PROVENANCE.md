# RowPlay BikeErg equipment source

## Decision

Option **B** (provenance-reviewed third-party CC0/CC-BY spin bike) was selected
for the equipment upgrade. A usable third-party candidate was evaluated and
**not imported** for the reasons below; the shipped BikeErg-form machine is
**repository-authored** under the project MIT licence, with the same provenance
discipline as a third-party extract (this file, deterministic rebuild, fit
contract, validator).

## Evaluated third-party candidate (not shipped)

| Field      | Value                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Name       | Spinning Bike                                                                  |
| Creator    | nurhadimli                                                                     |
| Host       | Sketchfab                                                                      |
| URL        | https://sketchfab.com/3d-models/spinning-bike-c6c7b485d4a6437999502c1b477617c5 |
| Licence    | Creative Commons Attribution 4.0 (CC-BY-4.0)                                   |
| Face count | ~434,816                                                                       |
| Download   | Requires Sketchfab authentication; no unauthenticated direct GLB URL           |
| Fit        | Generic spin bike; not retargeted to RowPlay `BIKE_RIG` anchors                |

### Why it was not imported

1. **Triangle budget** — V3 package max is 32,000 triangles for _all_ sports
   equipment and athlete leaves. A single 435k-face mesh is more than 10× the
   entire package budget even before decimation.
2. **No auth-free download** — RowPlay builds must not depend on interactive
   Sketchfab login or undocumented runtime fetches.
3. **Contact retarget cost** — even after decimation, saddle/hood/pedal
   landmarks would need full remapping to `src/lib/replay/bikeRig.js`.

A future CC0/CC-BY indoor-bike mesh may replace the authored shell **only** if
it is checked into `static/replay-assets/source/bike/`, retargeted to
`BIKE_RIG`, rebuilt through `scripts/build-replay-assets.mjs`, validated, and
documented here with licence + SHA-256.

## Shipped source of truth

| Field            | Value                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Form             | Stationary indoor BikeErg-like machine (front flywheel cage, fixed base, seat rail, cockpit)                          |
| Fit contract     | `src/lib/replay/bikeRig.js`                                                                                           |
| Generator        | `scripts/build-replay-assets.mjs` (`bikeWheelAssemblyParts`, `bikeFrameAssemblyParts`, `bikeDrivetrainAssemblyParts`) |
| Runtime fallback | `src/lib/replay/renderer3d.ts` `makeBikeAvatar`                                                                       |
| Licence          | Copyright (c) 2026 shenghaoc and rowplay contributors; MIT (`LICENSE`)                                                |
| External assets  | None — no textures, downloads, scans, or avatar-generator output                                                      |
| Interaction      | V4 athlete from PR #172; sit surface, palm grips, and pedals own contact                                              |

## Rebuild

```sh
vp run build:replay-assets
vp run validate:replay-assets
```

Review the resulting `rowplay-rigs-v3.glb` size and SHA-256 before commit.
