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

- [ ] **4. Prototype and introduce V4 skeletal animation**
  - [x] Produce an isolated repository-authored generic skinned athlete and a
    named deterministic clip; prove skinning, `AnimationMixer.setTime()` seek,
    and GLB round-trip in source tests. This remains a non-runtime prototype.
  - [ ] Change validation/loading only for the reviewed V4 contract
  - [ ] Sample clips in the renderer and correct equipment contacts after sampling
  - Keep V3/procedural/Canvas fallback proof

- [ ] **5. Complete temporal visual acceptance**
  - Review every sport moving at 1×, 2×, and 8×
  - Record paused catch/drive/finish/recovery and plant/release proof
  - Run focused tests, full gate, Workers smoke, and update the draft PR
