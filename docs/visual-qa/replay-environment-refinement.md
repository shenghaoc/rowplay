# Replay rowing-water and ski-snow refinement

This note records the final environment follow-up included in PR #172. The
surroundings remain generic procedural illustrations: Concept2 supplies timing
and progress, not venue, route, water, snow, weather, or lighting data.

## Scope

- **RowErg Canvas:** submerged depth channels and distance-stable shoreline
  reflections break up the previous flat teal basin.
- **RowErg 3D:** static water value variation plus a shallow shoreline shelf,
  bank, and restrained foam edge make the water-to-land transition readable.
- **SkiErg Canvas:** cool wind-packed contours and distance-stable perspective
  corduroy give the snow downhill direction and groomed texture.
- **SkiErg 3D:** cool lane variation, snow-edge shadows, and a sparse Nordic
  safety fence establish the course boundary and scale.
- **BikeErg:** unchanged. Regression coverage confirms RowErg and SkiErg
  environment objects do not leak into the cycling venue.

All additions use repository-local Canvas paths or standard Three.js geometry
and materials. No generated bitmap, downloaded texture, scanned location, or
imported venue model is shipped.

## Final browser evidence

The [capture manifest](athlete-v5/in-app/2026-07-24-hardware-webgpu/manifest.json)
records the combined athlete/environment code commit, backend, requested and
effective quality, locale, and console result.

| Sport / renderer    | Final capture                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| RowErg Canvas 2D    | [water and reflections](athlete-v5/in-app/2026-07-24-hardware-webgpu/row-canvas-2d.jpg)                         |
| RowErg WebGPU Ultra | [water material and shoreline](athlete-v5/in-app/2026-07-24-hardware-webgpu/hardware-webgpu-ultra-row.jpg)      |
| SkiErg Canvas 2D    | [snow contours and corduroy](athlete-v5/in-app/2026-07-24-hardware-webgpu/ski-canvas-2d.jpg)                    |
| SkiErg WebGPU Ultra | [snow variation, edge, and fencing](athlete-v5/in-app/2026-07-24-hardware-webgpu/hardware-webgpu-ultra-ski.jpg) |

Google Chrome on the actual macOS host reported `WebGPU`; both 3D captures were
made with the control set to `Ultra`. A SkiErg playback interaction advanced
from pause to 8.4 seconds and returned to pause successfully. Browser diagnostics
reported no warnings or errors during the RowErg/SkiErg 2D/3D pass.

## Acceptance

- Water and snow are materially distinct while athlete/equipment contacts stay
  readable.
- The static scene remains complete while paused; moving texture is driven by
  replay distance rather than renderer frame count.
- Low-tier semantic objects and the WebGL/Canvas fallbacks remain covered by
  renderer and loader tests.
- No additional control, persistence, localization, or workout-data behavior
  is introduced.

Remaining known environment compromises: none within this illustrative,
procedural venue scope.
