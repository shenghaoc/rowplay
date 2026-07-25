# RowPlay bike equipment source

## Decision

The shipped bike is **repository-authored** under the project MIT licence.
It uses a clean diamond-frame form with two equal wheels, BB at axle height,
chain to rear cassette, fork blades, and rim brakes — a compact stylised
road-bike silhouette, not a free-road-bicycle simulation.

Third-party CC0 candidates were evaluated (see below). A mesh may replace
the authored shell **only** if it is checked into
`static/replay-assets/source/bike/`, retargeted to `BIKE_RIG`, rebuilt
through `scripts/build-replay-assets.mjs`, validated, and documented here
with licence + SHA-256.

## Evaluated third-party candidates (not shipped)

### Spinning Bike (Sketchfab — CC-BY-4.0)

| Field      | Value                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Name       | Spinning Bike                                                                  |
| Creator    | nurhadimli                                                                     |
| Host       | Sketchfab                                                                      |
| URL        | https://sketchfab.com/3d-models/spinning-bike-c6c7b485d4a6437999502c1b477617c5 |
| Licence    | Creative Commons Attribution 4.0 (CC-BY-4.0)                                   |
| Face count | ~434,816                                                                       |
| Download   | Requires Sketchfab authentication; no unauthenticated direct GLB URL           |
| Verdict    | **Rejected** — > 10× triangle budget, requires auth, no retarget               |

### Bicycle (Poly Pizza — CC-BY-3.0)

| Field     | Value                                                    |
| --------- | -------------------------------------------------------- |
| Name      | Bicycle                                                  |
| Creator   | Poly by Google                                           |
| Host      | Poly Pizza                                               |
| URL       | https://poly.pizza/m/19VoUuA2pcN                         |
| Licence   | Creative Commons Attribution 3.0 (CC-BY-3.0)             |
| Triangles | ~1,700                                                   |
| Format    | OBJ / glTF                                               |
| Verdict   | **Rejected** — CC-BY (not CC0); no verified GLB download |

### Meshy bicycle gallery (CC0)

| Field     | Value                                                  |
| --------- | ------------------------------------------------------ |
| Host      | Meshy.ai                                               |
| URL       | https://www.meshy.ai/tags/bicycle                      |
| Licence   | CC0 (Creative Commons Zero) — gallery models confirmed |
| Format    | GLB / USDZ / FBX / OBJ                                 |
| Triangles | Not listed without account; individual download needed |
| Verdict   | **Pending** — CC0 licence confirmed; requires account, |
|           | triangle-count audit, and BIKE_RIG retarget            |

## Shipped source of truth

| Field            | Value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Form             | Diamond-frame road bike (two equal wheels, BB at axle height)            |
| Fit contract     | `src/lib/replay/bikeRig.js`                                              |
| Generator        | `scripts/build-replay-assets.mjs` (`bikeWheelAssemblyParts`,             |
|                  | `bikeFrameAssemblyParts`, `bikeDrivetrainAssemblyParts`)                 |
| Runtime fallback | `src/lib/replay/renderer3d.ts` `makeBikeAvatar`                          |
| Licence          | Copyright (c) 2026 shenghaoc and rowplay contributors; MIT (`LICENSE`)   |
| External assets  | None — no textures, downloads, scans, or avatar-generator output         |
| Interaction      | V4 athlete from PR #172; sit surface, palm grips, and pedals own contact |

## Rebuild

```sh
node scripts/build-replay-assets.mjs
node scripts/validate-replay-assets.mjs
```

Review the resulting `rowplay-rigs-v3.glb` size and SHA-256 before commit.
