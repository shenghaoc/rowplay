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

- Frames: [`premium-environments/`](premium-environments/) — 63 JPEGs, 4.2 MB
- Manifest: [`premium-environments/manifest.json`](premium-environments/manifest.json)
- Regenerate:

  ```bash
  vp run preview                      # build + wrangler dev on 127.0.0.1:8787
  node scripts/capture-replay-release-matrix.mjs \
    --matrix=environment --tiers=low,medium,high,ultra \
    --browser-channel=chrome \
    --base-url=http://127.0.0.1:8787 \
    --output=docs/visual-qa/premium-environments
  ```

`--browser-channel=chrome` is required — see [Ultra and WebGPU](#ultra-and-webgpu)
below. Without it the capture runs on Playwright's bundled Chromium, which
resolves no WebGPU adapter, and every Ultra frame silently downgrades to High.

Frames are cropped to the replay stage. Venue review only needs the stage, and
cropping keeps the committed evidence small while putting the environment itself
under scrutiny. The manifest records, per frame: sport, route, renderer,
requested **and effective** quality, backend, theme, viewport, stage size,
playback state, ghost pace, seek position, and any console warnings — plus the
browser channel for the run as a whole.

## Matrix covered

Requirement 6.2 asks for all three sports in 2D and 3D, paused and moving, light
and dark, with ghost comparison and quality-tier states.

| Axis      | Covered                                  |
| --------- | ---------------------------------------- |
| Sport     | RowErg, SkiErg, BikeErg                  |
| Renderer  | Canvas 2D, 3D                            |
| Tier (3D) | Low, Medium, High, Ultra                 |
| Theme     | Light, dark                              |
| Playback  | Paused, moving (replay actually running) |
| Ghost     | One per sport, 3D Ultra, dark            |

2D is captured per sport × theme × playback (12 frames). The quality selector
exists only in 3D — `CourseRenderer` takes no tier — so a 2D tier axis would
emit identical frames under different names.

Moving frames click **Play** and let the replay run before capture, so wake,
spray, parallax, and the chase camera are shown mid-motion. Playwright's
`animations: "disabled"` only suppresses CSS animation and does not freeze canvas
rAF, so these are genuinely in-motion frames.

### Ultra and WebGPU

Ultra is WebGPU-only, and getting a real WebGPU adapter under Playwright takes
one specific thing: **the machine's installed Google Chrome**, via
`--browser-channel=chrome`. All 51 3D frames in this set report
`backend: "WEBGPU"`, and all 15 Ultra frames report
`requestedQuality: "ultra"` against `effectiveQuality: "ultra"`.

The distinction that matters when re-running this:

| Browser                     | `navigator.gpu` | `requestAdapter()`    |
| --------------------------- | --------------- | --------------------- |
| Playwright bundled Chromium | present         | **null** — no adapter |
| Installed Google Chrome     | present         | Apple / `metal-3`     |

An earlier sweep of this matrix ran on the bundled Chromium and produced 15
frames labelled ultra whose manifest read `effectiveQuality: "high"`. Those were
discarded rather than published, because a frame named for a tier it did not
render misrepresents the tier. The frames here replace them.

Two notes for anyone re-deriving this. `navigator.gpu` is only exposed in a
**secure context**, so a probe run against `about:blank` reports it missing on
every browser and is a false negative — probe against the actual localhost page.
And the bundled Chromium's failure is specifically a missing _adapter_, not a
missing API, which is why it surfaced as the `No available adapters.` warning
rather than an outright error. That warning is absent from this run.

## What the frames show

**Tiers differ in scene content and material response, not just sharpness.** All
four Low/Medium/High/Ultra frames are pixel-distinct for every sport in both
themes. Concretely, RowErg Low is an open basin with a sparse tree line; High
adds the launch dock, start pontoons, denser bank woodland, and lane furniture.
SkiErg Low has sparse pines and bare course edges; High carries a dense tree line
and the full red course fencing. This is the property Requirement 5.6 asks for,
and it is also pinned by the tier test in `renderer3d.test.ts`.

**High → Ultra is a measured difference, not an assumed one.** Because the
Row/Ski surfaces animate on wall-clock time (see
[Capture determinism](#capture-determinism)), "the frames look different" proves
nothing on its own — two High captures also differ. So each sport was captured
three times on WebGPU (High, High again, Ultra) and the High↔Ultra difference
compared against that same-tier noise floor:

| Sport   | High↔High (noise) | High↔Ultra      | Separation |
| ------- | ----------------- | --------------- | ---------- |
| BikeErg | 1.4 % px, Δ 0.77  | 14 % px, Δ 12.2 | ~10×       |
| SkiErg  | 6.3 % px, Δ 3.13  | 21 % px, Δ 9.7  | ~3.4×      |
| RowErg  | 20 % px, Δ 5.32   | 32 % px, Δ 9.9  | ~1.6×      |

(Share of pixels differing by >8/255 on any channel, and mean per-pixel delta,
over the stage crop.) BikeErg is the cleanest case: near-deterministic paused, so
its 10× separation is unambiguous. Ultra there adds visibly denser track
furniture around the velodrome and re-lights the upper arena. For RowErg and
SkiErg the difference concentrates in the near-field ground and water — where the
Ultra normal maps and the finer water-normal texture apply — which is what the
tier is supposed to change.

One honest limit: the RowErg sun glints (`environment:rower:sun-glints`, 56
instances at 0.28 opacity) occupy the same near-field water as the Ultra
water-normal change, so a pixel diff cannot separate the two. Their presence at
Ultra only is asserted in `renderer3d.test.ts`; the capture confirms that region
changes, not which of the two changed it.

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

## Capture determinism

Useful when re-running the matrix or diffing frames across a change:

| Frames                     | Reproducible byte-for-byte |
| -------------------------- | -------------------------- |
| All 2D                     | Yes                        |
| BikeErg 3D, paused         | Yes                        |
| RowErg / SkiErg 3D, paused | **No**                     |
| Any `moving` frame         | **No**                     |

"Yes" means _on the same browser_. Every frame in this set changed when the
capture moved from the bundled Chromium to real Chrome, because the rasterizer
changed — including the 2D frames, which have no tier and no WebGPU involvement.
Diff frames only against a baseline captured on the same channel.

RowErg and SkiErg animate their surfaces on wall-clock time even while playback
is paused, so two runs of the _same build_ produce different bytes for those
frames. Moving frames advance with real elapsed time and never repeat. Only the
2D and BikeErg-3D paused frames are safe to use as byte-exact baselines; judge
the rest by eye.

This was confirmed by capturing twice against one unchanged build: the frames
that differed were exactly the Row/Ski 3D paused and all moving frames.
Quantified on the paused stage crop, that same-build noise is **20 % of pixels
for RowErg and 6.3 % for SkiErg**, against **1.4 % for BikeErg**. Any frame
comparison across a change has to clear the relevant figure before it means
anything — which is why the High→Ultra check above is stated as a ratio to it.

## Known cosmetic notes

- On the stage crop the world-space telemetry pill can sit partly above the crop
  line for BikeErg, whose stage is shorter. This is a framing artifact of the
  crop, not a rendering defect; the uncropped release-gate frames show the pill
  in full.
- This run recorded **no console warnings on any frame**. The earlier
  bundled-Chromium sweep carried `No available adapters.` on all 39 of its 3D
  frames; running on real Chrome removes the cause rather than filtering the
  symptom. Warnings are still captured per frame in the manifest, so the
  condition stays auditable if it returns. No frame produced a page error — the
  harness throws on those.

## Related

- Tier payload and provenance: [`../../static/replay-assets/environments/README.md`](../../static/replay-assets/environments/README.md)
- Athlete pass this branch builds on: [`replay-athlete-v5.md`](replay-athlete-v5.md)
