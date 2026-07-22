# Requirements Document: Replay Figure and Motion Readability

> Historical scope note (July 2026): These completed visual and contact
> requirements remain authoritative. The ban on repository-owned authored 3D
> athlete and equipment shells is superseded only by
> [Replay authored athlete assets](../replay-authored-athlete-assets/requirements.md).
> Requirement 4's translucent-ghost rule remains the procedural/V3 fallback
> contract; the V4 skinned human is narrowly superseded by authored-athlete
> Requirement 8.4 and uses opaque tint plus depth writing to avoid skinned-mesh
> transparency sorting artifacts.

## Introduction

The replay already has correct staged sport kinematics and equipment-locked
contacts, but those invariants alone do not guarantee a convincing rendered
athlete. This follow-up treats the actual chase-camera image as a product
requirement: the 3D figure must read clearly at desktop and mobile replay scale,
in both themes, without adding an imported likeness or abandoning the existing
procedural renderer.

## Requirements

### Requirement 1: Silhouette-first athlete modelling

**User Story:** As an athlete, I want the 3D figure to read as a coherent person
at a glance, so I can follow posture instead of deciphering dark sticks.

#### Acceptance Criteria

1. WHEN a 3D athlete is rendered THEN torso, shoulder, pelvis, head, arm, leg,
   hand, and foot masses SHALL survive the actual replay pixel budget.
2. WHEN the camera views the athlete from behind THEN the torso SHALL present a
   shaped back, waist, shoulder yoke, and distinct kit planes rather than a
   floating front/back sticker.
3. WHEN limbs are rendered THEN their cross-sections and taper SHALL remain
   visible at Low through Ultra quality.
4. WHEN small anatomy cannot survive replay scale THEN one bold faceted form
   SHALL be preferred over multiple sub-pixel meshes.
5. WHEN light or dark theme is active THEN skin, primary kit, secondary kit,
   shoes, and equipment SHALL retain visible value separation.

### Requirement 2: Sport-specific visual credibility

**User Story:** As an athlete, I want each sport's body and machine to form one
credible silhouette, so RowErg, SkiErg, and BikeErg do not look like the same
puppet on different props.

#### Acceptance Criteria

1. WHEN RowErg is posed THEN arms SHALL use a bounded shoulder-to-grip reach,
   knees SHALL separate laterally, and hands and feet SHALL remain locked to the
   oars and footplate.
2. WHEN SkiErg is posed THEN both shoulders and bent arms SHALL remain readable,
   poles SHALL stay on their grip/tip solve, and neutral skis SHALL not dominate
   the athlete.
3. WHEN BikeErg is posed THEN the frame SHALL meet at authored tube endpoints,
   the pelvis SHALL read as saddle-supported, and opposed pedalling SHALL remain
   visible through the rider silhouette.
4. WHEN any sport cycles through 128 representative poses THEN segment lengths,
   equipment contacts, and transforms SHALL remain exact and finite.

### Requirement 2A: Unambiguous BikeErg forward rotation

**User Story:** As an athlete, I want the 2D BikeErg to read as pedalling
forward at every replay speed, so temporal aliasing never suggests reverse
cycling.

#### Acceptance Criteria

1. WHEN the right-facing BikeErg advances THEN wheels and cranks SHALL retain
   the shared clockwise Canvas rotation convention.
2. WHEN the BikeErg is drawn THEN opposing crank arms, pedal platforms,
   chainring, sprocket, and chain strands SHALL make the drivetrain explicit.
3. WHEN wheel spokes are sampled at 4× or 8× THEN asymmetric directional
   markers SHALL break quarter-turn symmetry without falsifying distance roll.
4. WHEN the rider is posed THEN both shin endpoints SHALL terminate at the
   exact opposed pedal anchors, with far/frame/near depth order preserved.

### Requirement 3: Athlete-first 3D presentation

**User Story:** As an athlete, I want the replay camera and stage to make the
figure worth looking at, so improved geometry is not reduced to a thumbnail.

#### Acceptance Criteria

1. WHEN 3D is selected THEN the stage SHALL be taller than the compact 2D stage
   and SHALL adapt between desktop, mobile, and ghost layouts.
2. WHEN any sport is framed THEN a rear three-quarter chase angle SHALL expose
   paired limbs while keeping relevant grip/equipment contacts in view.
3. WHEN replay speed rises THEN FOV breathing and chase damping SHALL remain
   bounded so the athlete does not shrink dramatically or run away from camera.
4. WHEN the athlete travels around the course THEN camera-relative fill and rim
   light SHALL keep rear-facing body planes readable.
5. WHEN telemetry labels render THEN they SHALL not dominate the figure or
   consume unnecessary stage space.
6. WHEN live and ghost lanes are both present THEN their real positions,
   midpoint, course direction, and progress separation SHALL inform the camera,
   and both athletes SHALL remain inside the mobile comparison stage.

### Requirement 4: Ghost, performance, and compatibility

**User Story:** As an athlete, I want clearer figures without sacrificing smooth
playback, ghost comparison, or fallback behavior.

#### Acceptance Criteria

1. WHEN a procedural/V3 ghost material uses opacity below one THEN it SHALL be
   transparent with depth writes disabled to prevent self-occlusion artifacts.
2. WHEN the V4 skinned ghost human renders THEN its body SHALL remain opaque,
   tinted, depth-tested, and depth-writing; alpha MAY remain on separate ghost
   equipment, effects, or labels.
3. WHEN animation runs THEN no geometry, material, vector, or rig object SHALL
   be allocated per pose.
4. WHEN quality changes THEN athlete readability SHALL remain independent of
   optional shadows, particles, and environment density.
5. WHEN WebGPU is unavailable THEN WebGL and 2D fallback behavior SHALL remain
   unchanged.
6. WHEN wake effects render THEN their size, opacity, spacing, depth writes,
   and render order SHALL remain bounded at 1× through 8×.

### Requirement 5: Regression proof and visual QA

**User Story:** As a maintainer, I want tests and review evidence tied to the
rendered result, so object existence cannot masquerade as visual quality.

#### Acceptance Criteria

1. WHEN renderer tests run THEN they SHALL cover torso proportions, material
   contrast, explicit shoulders, ghost depth behavior, fixed contacts, and
   authored limb lengths for all sports.
2. WHEN camera tests run THEN they SHALL use the real desktop and mobile stage
   sizes and enforce projected athlete and shoulder-span minimums.
3. WHEN visual QA runs THEN RowErg, SkiErg, and BikeErg SHALL be reviewed in 3D
   while paused and moving, including dark theme and a narrow viewport; the 2D
   BikeErg SHALL also be reviewed at 1× and 8×.
4. WHEN the change is complete THEN public documentation and the full repository
   quality gate SHALL pass.
