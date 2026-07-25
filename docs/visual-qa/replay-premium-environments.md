# Replay premium environments visual acceptance

This note records the venue visual-quality pass on
`codex/replay-environment-tier-overhaul`, relative to merge base `158029f`
(PR #172, the production athlete). It covers the rebuilt RowErg, SkiErg, and
BikeErg venues in both renderers and the tier contract that goes with them.

It exists to discharge Requirement 6 of
[`.kiro/specs/replay-premium-environments/requirements.md`](../../.kiro/specs/replay-premium-environments/requirements.md),
which ties environment quality to tests **and actual replay captures** so object
counts cannot substitute for a rendered result.

## Evidence

- Frames: [`premium-environments/`](premium-environments/) — 51 JPEGs, 3.2 MB
- Manifest: [`premium-environments/manifest.json`](premium-environments/manifest.json)
- Regenerate:

  ```bash
  vp run preview                      # build + wrangler dev on 127.0.0.1:8787
  node scripts/capture-replay-release-matrix.mjs \
    --matrix=environment --tiers=low,medium,high \
    --base-url=http://127.0.0.1:8787 \
    --output=docs/visual-qa/premium-environments
  ```

Frames are cropped to the replay stage. Venue review only needs the stage, and
cropping keeps the committed evidence small while putting the environment itself
under scrutiny. The manifest records, per frame: sport, route, renderer,
requested **and effective** quality, backend, theme, viewport, stage size,
playback state, ghost pace, seek position, and any console warnings.

## Matrix covered

Requirement 6.2 asks for all three sports in 2D and 3D, paused and moving, light
and dark, with ghost comparison and quality-tier states.

| Axis      | Covered                                  |
| --------- | ---------------------------------------- |
| Sport     | RowErg, SkiErg, BikeErg                  |
| Renderer  | Canvas 2D, 3D                            |
| Tier (3D) | Low, Medium, High                        |
| Theme     | Light, dark                              |
| Playback  | Paused, moving (replay actually running) |
| Ghost     | One per sport, 3D High, dark             |

2D is captured per sport × theme × playback (12 frames). The quality selector
exists only in 3D — `CourseRenderer` takes no tier — so a 2D tier axis would
emit identical frames under different names.

Moving frames click **Play** and let the replay run before capture, so wake,
spray, parallax, and the chase camera are shown mid-motion. Playwright's
`animations: "disabled"` only suppresses CSS animation and does not freeze canvas
rAF, so these are genuinely in-motion frames.

### Not covered: Ultra

**Ultra is not verified here, and the corresponding `tasks.md` line is
unchecked.** Ultra is WebGPU-only. The Playwright Chromium build in this
environment exposes no `navigator.gpu` at all — headless or headed, with
`--enable-unsafe-webgpu` and Metal/ANGLE variants all tried — so
`renderer3dLoader` correctly downgrades the request to High on WebGL.

An initial sweep did include Ultra, and the manifest showed
`requestedQuality: "ultra"` against `effectiveQuality: "high"` for every such
frame. Publishing 15 frames named "ultra" that were really High renders would
have misrepresented the tier, so the tier list was narrowed instead.

Ultra needs a re-run on WebGPU-capable hardware to confirm the two things only it
adds: normal-mapped close-surface detail, and the restrained sun glints
(`environment:rower:sun-glints`). Both are unit-tested in `renderer3d.test.ts`;
neither has a capture.

## What the frames show

**Tiers differ in scene content and material response, not just sharpness.** All
three Low/Medium/High frames are pixel-distinct for every sport in both themes.
Concretely, RowErg Low is an open basin with a sparse tree line; High adds the
launch dock, start pontoons, denser bank woodland, and lane furniture. SkiErg Low
has sparse pines and bare course edges; High carries a dense tree line and the
full red course fencing. This is the property Requirement 5.6 asks for, and it is
also pinned by the tier test in `renderer3d.test.ts`.

**Each sport reads as its own place.** RowErg is a lagoon loop whose circle
centre is a land island rather than more water — visible in both the 3D basin and
the 2D mid-course silhouette. SkiErg is a Nordic stadium with a snow-covered
centre. BikeErg is an indoor velodrome: banked boards, seating bowl, ceiling
structure, no outdoor skyline.

**Ghost comparison stays readable (Requirement 6.3).** In the ghost frames both
athletes and their labels are legible against the shared venue, with no
double-painted or faded scenery.

**Theme is a venue-wide change.** Dark frames re-light sky, ridges, foliage,
ground, and course surface rather than only recolouring the athlete. This is
additionally asserted in `renderer.test.ts` for the 2D venue.

## Known cosmetic notes

- On the stage crop the world-space telemetry pill can sit partly above the crop
  line for BikeErg, whose stage is shorter. This is a framing artifact of the
  crop, not a rendering defect; the uncropped release-gate frames show the pill
  in full.
- All 39 3D frames carry the expected `No available adapters.` warning from the
  environment's missing WebGPU, and one frame additionally recorded a Chromium
  GPU-readback warning during screenshot. They are kept in the manifest rather
  than filtered, so the capture conditions stay auditable. No frame produced a
  page error — the harness throws on those.

## Related

- Tier payload and provenance: [`../../static/replay-assets/environments/README.md`](../../static/replay-assets/environments/README.md)
- Athlete pass this branch builds on: [`replay-athlete-v5.md`](replay-athlete-v5.md)
