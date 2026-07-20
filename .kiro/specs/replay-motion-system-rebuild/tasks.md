# Implementation Tasks: Replay Motion-System Rebuild

- [x] **1. Establish the superseding contract**
  - Record why Three.js is not the bottleneck
  - Permit reviewed repository-owned V4 skins/clips while retaining provenance
    and fallback rules
  - Preserve the truth boundary around available Concept2 data

- [x] **2. Correct technique playback semantics**
  - Default a new replay to 1×
  - Retain keyboard-accessible 0.5×–8× transport controls
  - Add a regression test for default / reset behavior

- [x] **3. Build the shared motion graph**
  - Create phase-continuous RowErg, SkiErg, and BikeErg motion frames
  - Add deterministic continuity and contact-window tests
  - Integrate the graph into the existing 2D and 3D choreography

- [x] **4. Prototype and introduce V4 skeletal animation**
  - [x] Produce an isolated repository-authored generic skinned athlete and a
    named deterministic clip; prove skinning, `AnimationMixer.setTime()` seek,
    and GLB round-trip in source tests
  - [x] Promote the reviewed local V4 contract to one production `SkinnedMesh`,
    19 bones, and distinct deterministic RowErg/SkiErg/BikeErg clips
  - [x] Validate and lazy-load V4 independently of V3, clone live/ghost skin,
    skeleton, geometry, material, and mixer resources, and dispose them safely
  - [x] Seek the selected clip from normalized replay phase, restore the sampled
    authored pose before repeated seeks, and apply pelvis alignment, two-bone
    IK, and palm/sole orientation only after clip sampling
  - [x] Keep V3 equipment/contact motion authoritative and retain V3,
    procedural 3D, WebGL, and Canvas fallback proof

- [x] **5. Complete temporal visual acceptance**
  - [x] Review every sport moving at 1×, 2×, and 8× in the in-app browser on
    the real WebGPU/Ultra stage
  - [x] Record Row stroke, Ski plant/press/release, Bike pedal-cycle, same-state
    baseline/V4, desktop-dark, desktop-light, and mobile evidence
  - [x] Protect palm/sole tolerances, Row torso clearance, Ski course-anchored
    plants, Bike opposed pedals, deterministic/reduced-motion seeks, live/ghost
    independence, camera readability, and fallback/disposal in focused tests
  - [x] Run focused tests, the full repository gate, asset/locales validation,
    visual browser smoke, and update the draft PR
