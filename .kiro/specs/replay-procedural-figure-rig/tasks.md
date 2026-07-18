# Implementation Tasks: Replay Procedural Figure Rig

Spec: `.kiro/specs/replay-procedural-figure-rig/`
Requirements: Req 1-6
Follow-up to: `.kiro/specs/replay-motion-truth-and-kinematics/`

- [x] **1. Add fixed-proportion articulation geometry**
  - Add pure, allocation-aware two-segment joint solving
  - Clamp unreachable and degenerate targets to finite stable poses
  - Cover segment lengths, contacts, bend direction, and edge cases in a
    co-located test

- [x] **2. Remodel the 2D procedural athletes**
  - Draw paired fixed-proportion arms and legs with explicit elbows and knees
  - Add shaped torso, pelvis, neck, profile head or helmet, hands, and shoes
  - Separate skin, kit, and near/far-side depth treatments
  - Keep paired RowErg oars rigid and SkiErg poles and BikeErg pedals attached
  - Keep the enlarged figure clear of nearby telemetry labels

- [x] **3. Remodel the 3D procedural athletes**
  - Add a shaped torso/pelvis silhouette and coherent upper-body hierarchy
  - Use fixed-proportion two-bone chains at equipment contacts
  - Add visible elbows, knees, shoulder forms, simplified grips, and grounded
    feet
  - Add back-facing kit contrast and BikeErg saddle/pelvis support
  - Consolidate sub-pixel detail and keep the animation hot path allocation-free

- [x] **4. Strengthen renderer regression tests**
  - Cover RowErg, SkiErg, and BikeErg articulated anatomy
  - Assert equipment contacts and finite transforms through representative
    stages
  - Preserve reduced-motion, quality governor, WebGPU/WebGL, ghost, and 2D
    fallback behavior

- [x] **5. Update public documentation**
  - Update `README.md`
  - Update `docs/usage.md`
  - Update replay workflow copy in all six locale dictionaries
  - Add this bounded follow-up spec to `AGENTS.md`

- [x] **6. Verify**
  - Focused articulation and renderer tests
  - Locale validation
  - Full repository quality gate
  - Browser QA on RowErg, SkiErg, and BikeErg in 2D and 3D
  - Reduced-motion renderer invariants and mobile-sized visual checks
