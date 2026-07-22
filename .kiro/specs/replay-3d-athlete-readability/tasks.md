# Implementation Tasks: Replay Figure and Motion Readability

> Historical scope note (July 2026): These completed tasks remain the
> readability baseline. The current authored 3D shell work is tracked in
> [Replay authored athlete assets](../replay-authored-athlete-assets/tasks.md).

Spec: `.kiro/specs/replay-3d-athlete-readability/`
Follow-up to: `.kiro/specs/replay-procedural-figure-rig/`

- [x] **1. Rebuild the silhouette-first 3D body forms**
  - Replace the squashed lathe torso with a watertight elliptical-ring body
  - Replace imperceptible tube taper with faceted elliptical limb rings
  - Consolidate hands, shoes, head, and helmet at the replay pixel budget
  - Use accent torso mass, dark shoulder yoke, and readable semantic materials

- [x] **2. Re-author sport-specific visual assets**
  - Shorten RowErg grip reach and separate knee planes without breaking contact
  - Add SkiErg shoulders, bent-arm targets, thicker poles, and shorter neutral skis
  - Rebuild the BikeErg frame from connected tube endpoints
  - Preserve all hand, foot, boot, bar, saddle, pole, and oar invariants

- [x] **3. Reframe and relight the 3D stage**
  - Add closer rear three-quarter sport camera rigs
  - Bound speed FOV and accelerate chase follow at high replay speeds
  - Add camera-relative fill/rim lights and smaller telemetry labels
  - Increase desktop/mobile 3D stage height without changing 2D

- [x] **4. Harden ghost rendering and focused tests**
  - Disable depth writes on translucent procedural/V3 ghost materials while
    keeping the V4 skinned ghost opaque, tinted, and depth-writing
  - Cover semantic body contrast and explicit shoulders
  - Cover RowErg grip envelope and 128-pose contacts
  - Cover projected athlete size at real desktop/mobile stage dimensions

- [x] **5. Remove BikeErg reverse-motion ambiguity**
  - Keep the signed clockwise wheel/crank convention
  - Add explicit cranks, pedals, chainring, sprocket, and chain strands
  - Add asymmetric rotating wheel markers for high-speed alias resistance
  - Cover signed direction, opposition, contact, and paint order

- [x] **6. Close professional-quality visual defects**
  - Frame both comparison lanes and the narrow RowErg oar span
  - Replace the opaque wake-card artifact with bounded distance samples
  - Separate both SkiErg poles and RowErg lower-body planes
  - Keep equipment/footwear distinct from every themed surface
  - Replace the large telemetry slab with a compact translucent pill

- [x] **7. Document and verify**
  - Update `README.md`, `docs/usage.md`, and `AGENTS.md`
  - Visually review all three sports paused and moving, dark mode, and narrow layout
  - Run formatting, locale validation, focused tests, and the full quality gate
