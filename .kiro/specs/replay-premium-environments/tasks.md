# Implementation Tasks: Replay Premium Environments

Spec: `.kiro/specs/replay-premium-environments/`
Follow-up to: `.kiro/specs/replay-3d-athlete-readability/`

- [x] **1. Define the sport environment art system**
  - Establish RowErg water/regatta, SkiErg snow/alpine, and BikeErg
    asphalt/venue palettes and silhouettes
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
  - Separate water, snow, and asphalt through value, roughness, highlights, and
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

- [x] **8. Refine RowErg water and SkiErg snow for the production-athlete phase**
  - Add depth channels and shoreline reflections to the RowErg Canvas basin
  - Add static water variation, a shoreline shelf/bank, and a restrained foam
    edge to the shared WebGPU/WebGL RowErg scene
  - Add cool snow contours and perspective corduroy to the SkiErg Canvas field
  - Add visible lane variation, snow-edge shadows, and sparse Nordic fencing to
    the shared WebGPU/WebGL SkiErg scene
  - Keep BikeErg unchanged and protect sport-object isolation with regression
    coverage
  - Publish final Canvas and real-hardware WebGPU Ultra RowErg/SkiErg captures,
    then pass the focused renderer tests, full repository gate, and E2E
