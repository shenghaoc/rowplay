# Implementation Tasks: Replay Motion Truth and Sport Kinematics

Spec: `.kiro/specs/replay-motion-truth-and-kinematics/`
Requirements: Req 1-6
Supersedes the fixed-metres cadence assumption in
`.kiro/specs/replay-animation-upgrade/` while retaining its wall-clock and
performance-governor foundation.

- [x] **1. Correct replay cycle inputs**
  - Ignore non-advancing anchor rows
  - Preserve one cycle per valid recorded stroke row
  - Fix normalized BikeErg pace distance inference
  - Integrate synthetic cadence continuously across rate changes
  - Generate cadence-correct demo strokes

- [x] **2. Add the shared sport-kinematics solver**
  - Smooth RowErg legs/body/arms sequencing and blade stages
  - Smooth SkiErg reach/plant/pull/recovery stages
  - Opposed BikeErg crank, bounded ankle, and restrained torso channels
  - Keep authored range of motion stable

- [x] **3. Upgrade the 2D renderer**
  - Consume shared kinematics
  - Add sport-specific water, snow, and track lane treatments
  - Separate BikeErg wheel roll from crank cadence
  - Keep particles pooled, intensity restrained, and reduced motion compliant

- [x] **4. Upgrade the 3D renderer**
  - Consume shared kinematics
  - Lock RowErg feet and hands to equipment targets
  - Lock SkiErg hands and model pole contact/release
  - Lock BikeErg feet, bound shoe pitch, and roll wheels from distance
  - Add closer sport-/aspect-aware camera direction with damped look target

- [x] **5. Strengthen tests**
  - Pure kinematics continuity/bounds
  - Timeline anchor/unit/continuity regressions
  - Demo cadence coverage
  - 2D all-sport coverage
  - 3D transform/contact and real reduced-motion coverage where practical

- [x] **6. Update repository and in-app documentation**
  - `README.md`
  - `docs/usage.md`
  - Replay guide text in all six locales
  - `AGENTS.md`

- [x] **7. Verify**
  - Focused replay tests
  - Locale validation
  - Svelte analysis for the replay page
  - Full repository quality gate
  - Browser QA on RowErg, SkiErg, and BikeErg in 2D/3D
