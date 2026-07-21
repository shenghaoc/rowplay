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

- [x] **6. Publish the V4 native handoff contract**
  - [x] Keep GLB as the web runtime artifact and generate USDZ as a derivative
  - [x] Generate the machine-readable V4 contract from source constants and
    artifact metrics
  - [x] Validate the USDZ through Three.js `USDLoader` as a portability gate

- [x] **7. Enforce closed-chain sport mechanics**
  - [x] Keep BikeErg shoes on opposed pedals and knees on a continuous
    rider-forward bend branch through the full crank cycle
  - [x] Keep RowErg palms on separate rigid scull grips without crossing the
    torso
  - [x] Keep SkiErg poles rigid, hands on their grips, and loaded baskets fixed
    in course space while the athlete advances
  - [x] Protect V4, procedural 3D, and Canvas 2D paths with dense full-cycle
    regression tests, the repository gate, and live browser acceptance

- [x] **8. Correct classic double-pole biomechanics in both renderers**
  - [x] Replace the generic drive-fraction pole sweep with reference-backed
    plant, elbow-load, pole-off, flight, approach, and pre-plant landmarks
  - [x] Make the V4 SkiErg arm use the shared sagittal elbow marker so the
    skinned arm cannot flip into the clip's horizontal backwards branch
  - [x] Keep 2D and 3D baskets rigid, snow-safe, and continuous when authority
    changes from the old plant to the next catch
  - [x] Run focused/full tests, asset validation, moving browser acceptance,
    and exact-head draft-PR CI

- [x] **9. Correct RowErg draw biomechanics in both renderers**
  - [x] Keep both arms long through the leg drive and body opening, with elbow
    flexion confined to the graph's late arm draw
  - [x] Select the rearward elbow branch in Canvas, procedural 3D, and V4
    instead of a forward-pointing or horizontal chicken-wing branch
  - [x] Keep both palms on separate rigid inboard grips, preserve the RowErg
    wrist frame through V4 parent-bone IK, and keep forearms outside the torso
  - [x] Protect the result with dense full-cycle 2D/3D sampling, V4 contact and
    clearance tests, repository gates, moving browser acceptance, and
    exact-head draft-PR CI

- [x] **10. Restore the complete RowErg seated leg chain**
  - [x] Make V4 consume the deterministic raised-knee target after foot-contact
    closure instead of retaining the standing clip's downward leg plane
  - [x] Keep both knees above the open cockpit, laterally separated, and within
    tolerance of the procedural mechanical branch through dense full-cycle poses
  - [x] Verify the moving seat/carriage stays over the static rails while the
    fixed stretcher and oar pivots remain authoritative
