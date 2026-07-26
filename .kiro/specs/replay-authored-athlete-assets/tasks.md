# Implementation Tasks: Replay Authored Athlete Assets

Spec: `.kiro/specs/replay-authored-athlete-assets/`
Supersedes only the procedural-only 3D asset restrictions in the completed
figure, readability, and motion specs.

- [x] **1. Establish the bounded asset and provenance contract**
  - Permit one compact repository-owned athlete GLB and sport-equipment shells
  - Preserve procedural/contact-driven motion and all functional invariants
  - Document ownership, licence, source, versioning, and forbidden asset sources
  - Keep the procedural environment policy explicitly outside this supersession

- [x] **2. Load and apply the authored shell library**
  - Validate the local versioned GLB and every required unique slot
  - Clone authored geometry onto independent live and ghost rig instances
  - Preserve runtime-owned theme, lane, ghost, and equipment materials
  - Fall back to procedural 3D geometry and then Canvas without blanking replay

- [x] **3. Complete frame-led character and equipment iteration**
  - Accept a SkiErg 3D desktop/mobile silhouette vertical slice first
  - Adapt the authored language to RowErg and BikeErg without breaking contacts
  - Carry the same silhouette language into the procedural Canvas figures
  - Perform at least three screenshot-and-critique loops at 100% size

- [x] **4. Add mechanical regression proof**
  - Cover load success, retryable failure, missing/duplicate/invalid slots
  - Cover live/ghost independence, finite transforms, disposal, and backend fallback
  - Retain exact contact, fixed-length, reduced-motion, camera, and BikeErg sign tests
  - Record asset bytes and runtime geometry/material cost without presenting them
    as visual-quality evidence

- [x] **5. Update the asset-policy documentation**
  - Add the repository-owned GLB source/provenance README
  - Add supersession notices to completed procedural-only specs
  - Update `AGENTS.md`, `README.md`, `docs/usage.md`, and all six replay guides
  - Preserve environment provenance and no-likeness truthfulness

- [x] **6. Complete visual and release verification**
  - [x] Capture representative 2D/3D, sport, stage-size, theme, pose/motion,
    ghost, and Low/Ultra states
  - [x] Complete Canvas light/mobile, 3D mobile dark, HUD-hidden silhouette,
    and operating-system reduced-motion frames
  - [x] Publish linked baseline/final locations and remaining compromises in
    visual QA
  - [x] Replace public replay screenshots only with accepted final demo captures
  - [x] Run focused tests, `vp run check`, locale validation, browser/E2E smoke,
    and `git diff --check`

- [x] **7. Add the canonical native handoff**
  - [x] Generate `rowplay-athlete-v4.usdz` from the canonical GLB through
    Blender 5.2 without remodelling the athlete
  - [x] Generate `rowplay-athlete-v4.contract.json` from `rigV4.ts` constants
    and built artifact metrics
  - [x] Validate USDZ portability through Three.js `USDLoader` without changing
    the web GLB runtime
  - [x] Document the RowPlay Studio boundary, exact hashes, and Blender USDZ
    repeat-export nondeterminism

- [x] **8. Raise the production skin ceiling in Blender 5**
  - [x] Author a new generic athlete surface, vertex colours, smooth normals,
    and broad deformation weights from a repository Blender Python script
  - [x] Preserve the exact V4 skeleton, clips, contact offsets, runtime IK,
    live/ghost isolation, and V3/Canvas fallbacks
  - [x] Add reproducible Blender studio rendering and update GLB/USDZ/contract
    provenance, metrics, hashes, and semantic validation

- [x] **9. Integrate the athlete with a credible rowing shell**
  - [x] Replace the closed fake cockpit with a Blender-authored open U-shell,
    split decks, cockpit tub, rails, stretcher, heel cups, rigger, and oarlocks
  - [x] Add a separately animated but physically rail-aligned seat-carriage
    template with a shaped pad, frame, guides, and four rollers
  - [x] Keep V4 RowErg knees on the authoritative raised bend branch so both leg
    chains remain above the cockpit through the complete stroke
  - [x] Keep the live and ghost skin opaque/depth-writing, remove the
    near-coplanar chest zip, and protect shell/seat/leg/material contracts with
    checked-asset and dense-cycle tests

- [x] **10. Complete the dedicated production-athlete visual-quality gate**
  - [x] Replace the round mannequin head, bead-like features, helmet hair, and
    ball-shaped shoulders with a recognisably human generic athlete silhouette
  - [x] Keep PR #171 technique timing, semantic joints, and shared procedural
    motion frozen; allow only the documented microscopic RowErg stretcher
    compatibility alignment and isolate elbow clearance to the V4 skin
  - [x] Keep the BikeErg pelvis visually supported without body/saddle
    penetration in the athlete-only pass; Task 12 owns the later equipment/fit
    rebuild
  - [x] Give Low, Medium, High, and Ultra materially progressive athlete PBR
    detail while preserving one geometry, rig, clip set, and fallback chain
  - [x] Publish one baseline/new/skeleton six-pose sheet, three real-time sport
    cycles, ghost/mobile/theme coverage, and real hardware WebGPU Ultra evidence
  - [x] Rebuild and validate GLB, USDZ, and the eight-role native contract; run
    focused tests, the full local gate, E2E, and exact-head CI

- [x] **11. Articulate machine-specific hand grips**
  - [x] Derive per-finger and opposing-thumb helper chains from the reviewed
    Blender hand topology without adding a second athlete or motion system
  - [x] Apply RowErg scull, SkiErg cylindrical-grip, and BikeErg hood closure
    only after the authoritative palm contact solve
  - [x] Reduce only oversized local grip cross-sections needed to expose the
    existing human fingers; preserve equipment paths, timing, and environments
  - [x] Validate exact helper hierarchy/influence, deterministic reset,
    contact retention, and all three machine grips with bounded close-up frames

- [x] **12. Rebuild BikeErg equipment around the seated athlete**
  - [x] Centralize true-scale wheels, wheelbase, frame, steering, crank,
    handlebar, saddle, and rider anchors in one `BIKE_RIG` contract consumed by
    procedural rendering, authored-asset generation, runtime contact, and tests
  - [x] Replace the block pad with one analytic winged, cut-out, dropped-nose
    saddle used by both graphics paths and dense whole-surface penetration tests
  - [x] Keep the rider on the sit bones, palms closed on shaped hoods, shoes on
    opposed pedals, and knees on the continuous forward branch through the full
    crank cycle and every quality tier
  - [x] Replace placeholder tyres, frame, bar, seatpost, and drivetrain form
    with coherent materials and geometry while retaining the established
    contact anchors, animation graph, and fallback chain
  - [x] Give the shared pelvis/thigh crease one continuous position-driven
    weight field and verify the same mesh in RowErg and SkiErg
  - [x] Update provenance, hashes, user documentation, native handoff, and
    visual-QA evidence; run focused tests, the full repository gate, browser
    smoke, deployment, and exact-head CI
