# Requirements Document: Replay Procedural Figure Rig

## Introduction

The replay already shares sport-specific staged motion across 2D and 3D, keeps
3D hands and feet on equipment targets, and adapts effects to the device. This
bounded follow-up improves the athlete itself: stable human proportions,
articulated joints, a clearer silhouette, and sport-specific kit and contact
readability at the actual replay camera distance.

The figure remains lightweight, procedural, and deliberately generic. It does
not load a scanned avatar or claim to reproduce the athlete's body, clothing,
technique, or likeness.

## Requirements

### Requirement 1: Stable articulated proportions

**User Story:** As an athlete, I want arms and legs to keep believable lengths
through the whole cycle, so the figure reads as a person instead of a stretching
puppet.

#### Acceptance Criteria

1. WHEN a limb is posed THEN its upper and lower segments SHALL retain authored
   proportions within renderer precision.
2. WHEN an equipment contact target moves THEN the corresponding elbow or knee
   SHALL bend continuously without the limb telescoping.
3. WHEN a target reaches the edge of the authored range THEN the solver SHALL
   remain finite and choose the closest stable pose.
4. WHEN near and far paired limbs are visible THEN they SHALL use coherent joint
   chains rather than collapsing into one line.

### Requirement 2: Readable procedural human modelling

**User Story:** As an athlete, I want the replay figure to have recognizable
anatomy and clothing at a glance, so I can follow posture as well as equipment.

#### Acceptance Criteria

1. WHEN the figure is rendered THEN head, neck, shoulders, torso, pelvis, upper
   and lower limbs, joints, hands, and feet SHALL form a coherent silhouette.
2. WHEN the chase camera views the athlete from behind THEN back-facing kit and
   body planes SHALL remain distinct from the environment.
3. WHEN the 2D overview is shown THEN skin, kit, shoes, and near/far limbs SHALL
   have sufficient visual separation without relying on particle effects.
4. WHEN RowErg, SkiErg, or BikeErg is active THEN sport-specific details MAY
   distinguish the figure, but SHALL share one restrained modelling language.
5. WHEN the figure is documented THEN it SHALL be described as a generic
   illustration and SHALL NOT imply a scan, external character asset, or athlete
   likeness.

### Requirement 3: Sport equipment contact readability

**User Story:** As an athlete, I want hands, feet, and seated support to stay
visibly connected to the machine, so every sport's movement remains credible.

#### Acceptance Criteria

1. WHEN RowErg is posed THEN paired hands SHALL align with the rigid oar handles
   and paired feet SHALL align with the footplate targets.
2. WHEN SkiErg is posed THEN paired hands SHALL align with the pole grips and
   articulated legs SHALL keep the boots supported by the course.
3. WHEN BikeErg is posed THEN paired hands SHALL align with the bars, feet SHALL
   align with opposed pedals, and the pelvis SHALL read as supported by the
   saddle.
4. WHEN a cycle crosses a stage boundary THEN contacts and joint bend direction
   SHALL remain continuous.

### Requirement 4: 2D and 3D figure parity

**User Story:** As an athlete, I want the same movement to remain recognizable
when I switch views, so 2D and 3D do not portray different technique.

#### Acceptance Criteria

1. WHEN either renderer samples a frame THEN figure placement SHALL continue to
   consume the shared sport-kinematics pose.
2. WHEN 2D draws a figure THEN far equipment and limbs SHALL draw before the
   torso and near-side anatomy so the pose has stable depth order.
3. WHEN 3D poses an upper body THEN torso, shoulders, neck, head, and kit SHALL
   transform as one coherent chain.
4. WHEN reduced motion is active THEN the figure and equipment contacts SHALL
   remain readable while decorative secondary motion stays suppressed.

### Requirement 5: Performance and compatibility

**User Story:** As an athlete, I want clearer figures without losing smooth
playback or browser compatibility.

#### Acceptance Criteria

1. WHEN the animation loop runs THEN figure posing SHALL create no new geometry,
   material, or temporary vector objects per frame.
2. WHEN anatomy detail is added THEN reusable procedural geometry and restrained
   mesh counts SHALL be preferred over sub-pixel decoration.
3. WHEN 3D initializes THEN WebGPU-first selection, WebGL fallback, quality
   governor behavior, ghost figures, and existing controls SHALL remain intact.
4. WHEN 2D initializes THEN it SHALL remain the stable fallback on devices
   without a supported 3D backend.

### Requirement 6: Tests, documentation, and visual QA

**User Story:** As a maintainer, I want figure proportions and contacts to be
verified directly, so later animation changes do not quietly reintroduce rubber
limbs or unreadable silhouettes.

#### Acceptance Criteria

1. WHEN articulation math changes THEN pure co-located tests SHALL cover fixed
   segment lengths, target contact, finite edge cases, and stable bend direction.
2. WHEN renderer figures change THEN tests SHALL cover RowErg, SkiErg, and
   BikeErg anatomy and equipment-contact invariants where practical.
3. WHEN the feature ships THEN `README.md`, `docs/usage.md`, and the replay guide
   in all six locales SHALL describe the procedural figure honestly.
4. WHEN final verification runs THEN the repository quality gate SHALL pass.
5. WHEN visual QA runs THEN `/replay/1001`, `/replay/1003`, and `/replay/1004`
   SHALL be checked in 2D and 3D, including reduced motion and a mobile-sized
   viewport.
