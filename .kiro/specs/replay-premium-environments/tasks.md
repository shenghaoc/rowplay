# Implementation Tasks: Replay Premium Environments

Spec: `.kiro/specs/replay-premium-environments/`
Follow-up to: `.kiro/specs/replay-3d-athlete-readability/`

- [x] **1. Define the sport environment art system**
  - Establish RowErg water/regatta, SkiErg snow/alpine, and BikeErg
    timber-velodrome palettes and silhouettes
  - Keep light/dark theme, ghost comparison, and semantic contrast explicit
  - Document that venue, weather, and scenery are illustrative rather than
    recorded workout facts

- [x] **2. Rebuild the Canvas 2D environments**
  - Compose sky, horizon, distant venue, course, and foreground layers per sport
  - Replace full-scene grid treatment with clipped perspective course detail
  - Drive restrained parallax and repeating course texture from replay distance
  - Keep the shared environment opaque when a ghost is present
  - Increase and responsively frame the 2D stage for a readable venue composition

- [x] **3. Rebuild the shared WebGPU/WebGL 3D environment**
  - Add a sky/atmosphere layer, readable horizon, broad sport ground, and distant
    low-poly venue scenery
  - Give RowErg, SkiErg, and BikeErg distinct course-edge and background systems
  - Remove inappropriate universal marker clutter from non-rowing scenes
  - Ground athletes with stable local contrast while preserving their existing
    kinematics, contacts, and chase camera

- [x] **4. Re-author lighting and material hierarchy**
  - Apply coherent theme palettes to sky, fog, lights, ground, lane, and scenery
  - Separate water, snow, and timber through value, roughness, highlights, and
    restrained emissive accents
  - Keep environment contrast subordinate to athletes, equipment, and telemetry

- [x] **5. Preserve quality, fallback, and accessibility contracts**
  - Keep the core sport identity at low through ultra quality
  - Gate optional scenery density and expensive shadows/effects by quality tier
  - Reuse static geometry/materials and retain tracked disposal
  - Preserve WebGPU-first, WebGL, 2D fallback, adaptive degradation, and reduced
    motion behavior

- [x] **6. Add regression proof**
  - Cover sport-specific environment selection and RowErg-only marker semantics
  - Cover theme/material contrast, bounded quality density, and disposal
  - Retain existing renderer, motion, figure, contact, camera, and fallback tests

- [x] **7. Document and visually verify**
  - Update `README.md`, `docs/usage.md`, `AGENTS.md`, and this specification
  - State the illustrative-scene and no-generated-runtime-assets boundaries
  - Review all three demo sports in 2D and 3D, plus representative paused and
    moving, light/dark, ghost comparison, and low/ultra quality states
  - Replace public replay captures after final visual QA and pass the repository
    quality gate

- [x] **8. Make quality tiers visually and materially distinct**
  - [x] Rebase the environment work on the merged production-athlete PR
  - [x] Give adjacent Row tiers distinct reflection, venue, and highlight layers
  - [x] Give High/Ultra Ski snow documented local PBR material response
  - [x] Give High/Ultra Row the full river-valley CC0 material system (grass
    banks, forest-ground earth, pebble waterline, leafy reeds, leaf shoreline,
    bark trunks, leaf canopies, plank dock/pavilions) while water stays the
    authored clear-coat basin; Ski reuses bark/leaf on pines
  - [x] Record CC0 source, creator, license, source checksums, and shipped digests
  - [x] Add regression coverage proving tiers differ beyond DPR and density
  - [x] Guard the surface-map contract: resolve every referenced path against the
    shipped files, re-derive each provenance digest, and fall back to solid
    colour when a map fails to load
  - [x] Record the per-tier request count and payload, and bound payload, mesh,
    and instance counts by test
  - [x] Complete browser visual QA across Low, Medium, and High, with captures
    committed under `docs/visual-qa/replay-premium-environments.md`
  - [x] Complete browser visual QA at Ultra — captured on WebGPU by driving the
    installed Google Chrome (`--browser-channel=chrome`) instead of Playwright's
    bundled Chromium, which exposes `navigator.gpu` but resolves no adapter. All
    15 Ultra frames report `effectiveQuality: "ultra"` on `backend: "WEBGPU"`,
    and the High→Ultra difference is measured against the same-tier noise floor
    rather than asserted.
  - [x] Replace the public replay captures (`docs/screenshots/replay-demo.png`,
    `docs/screenshots/replay-3d-demo.png`) — the 3D capture is a genuine
    Ultra / WebGPU frame
  - [x] Pass the full repository quality gate

> Task 9 supersedes task 8's earlier scene composition. The committed matrix
> under `docs/visual-qa/premium-environments/` and the public screenshots were
> recaptured on head `c76fde9` (`buildVersion 1785044266849`) after the
> one-light-story pass, with harness version pinning so a stale server fails
> the capture loudly.

- [x] **9. Replace repetition with authored tier destinations**
  - [x] Rebase this isolated worktree on current `origin/main`
  - [x] Recompose RowErg as sector banks/campus/open wetland, with an Ultra-only
    boardwalk and hide rather than a denser ring of shoreline props
  - [x] Recompose SkiErg as a Nordic stadium bowl with authored forest gaps, a
    High rock shoulder, and Ultra spectator/rescue destinations
  - [x] Recompose BikeErg in both renderers as one indoor timber velodrome
    (evening-session light story), with High team-pit/event architecture and
    Ultra hospitality
  - [x] Replace Bike asphalt with provenance-recorded CC0 oak and add
    provenance-recorded CC0 rock to the Ski shoulder
  - [x] Pin adjacent-tier scene signatures, payloads, custom timber UVs, and
    non-ring object bounds in renderer tests
  - [x] Commit each venue to one light story: Row morning glass (per-material
    sky radiance on water, mist, finish tower), Ski blue-hour dusk (warm
    floodlight pools on dimmer groom), Bike evening session (single warm cone,
    matte timber, côte d'azur line grammar)
  - [x] Regenerate the complete Chrome/WebGPU visual matrix and replace public
    captures; harness asserts served `_app/version.json` matches disk build
  - [x] Pass the full repository quality gate on the final captured head
