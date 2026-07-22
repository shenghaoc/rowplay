# Requirements Document: Replay Motion-System Rebuild

## Introduction

The replay’s Three.js renderer is capable of skeletal animation, clip blending,
and inverse kinematics, but the current V3 asset boundary deliberately ships
only static geometry and drives it with direct procedural limb placement. That
keeps equipment contacts trustworthy but caps the visible performance at a
well-behaved puppet. This specification raises the motion ceiling without
claiming unavailable athlete biomechanics.

It supersedes the **no animations / no skins** portion of the authored-athlete
asset policy and the **motion capture or replacement of sportKinematics** out of
scope note. It preserves every provenance, privacy, local-delivery, contact,
fallback, reduced-motion, and live/ghost requirement from the existing replay
specifications.

## Requirements

### Requirement 1: Technique-first playback

**User Story:** As an athlete, I want the first replay I see to move at a
human-readable speed instead of making an otherwise good rig look frantic.

#### Acceptance Criteria

1. WHEN a replay opens THEN technique playback SHALL default to 1× real time.
2. WHEN a user selects 2×, 4×, or 8× THEN those speeds SHALL remain available
   and clearly preserve workout-time truth rather than pretending that the
   resulting accelerated human motion is natural.
3. WHEN a replay route changes THEN the selected default SHALL reset
   deterministically.
4. WHEN keyboard or assistive-technology users operate speed controls THEN the
   selected speed SHALL remain announced and keyboard navigable.

### Requirement 2: Shared deterministic motion graph

**User Story:** As an athlete, I want the 2D and 3D views to express the same
purposeful technique instead of each being a separate collection of pose
shortcuts.

#### Acceptance Criteria

1. WHEN a `StrokePose` is sampled THEN a pure shared motion graph SHALL derive
   phase-continuous body, limb, contact, and secondary-motion channels for the
   selected sport.
2. WHEN a stroke crosses catch, drive, finish, release, or recovery THEN the
   graph SHALL preserve continuity of position and intended momentum; it SHALL
   not visibly settle every joint into a frozen scalar stage.
3. WHEN cadence, distance, pace, or effort changes THEN cycle timing and
   restrained expressive weighting SHALL follow recorded data, while the
   application SHALL NOT claim measured joint paths, force curves, or athlete
   technique.
4. WHEN 2D and 3D render the same `StrokePose` THEN their major body and
   equipment states SHALL agree.

### Requirement 3: Rigged V4 athlete hero path

**User Story:** As an athlete, I want a continuous human figure with convincing
shoulders, elbows, hips, knees, and kit motion rather than separate rigid limb
shells.

#### Acceptance Criteria

1. WHEN V4 is available THEN the local repository-owned GLB MAY contain a
   generic `SkinnedMesh`, skeleton, and named authored clips for RowErg,
   SkiErg, and BikeErg.
2. WHEN a clip is evaluated THEN its time SHALL derive deterministically from
   `StrokePose` / replay time (for example via `AnimationMixer.setTime()`), so
   pause, seek, cadence, reduced-motion, and live/ghost comparison remain
   exact.
3. WHEN a V4 clip supplies the base pose THEN a post-clip analytic constraint
   pass SHALL keep hands, feet, oars, handlebars, pedals, ski baskets, and
   planted pole contacts authoritative.
4. WHEN V4 cannot load or validate THEN V3 procedural/contact-safe 3D and
   Canvas 2D SHALL remain usable without a blank or degraded route.
5. WHEN V4 assets ship THEN they SHALL remain repository-generated or clearly
   licensed, local, generic, and free of scans, likenesses, avatar-generator
   output, user imagery, undocumented downloads, and third-party runtime
   requests.

### Requirement 4: Sport-specific choreography

**User Story:** As an athlete, I want each sport to look like itself at normal
viewing speed.

#### Acceptance Criteria

1. WHEN RowErg is shown THEN legs, pelvis, spine, shoulders, arms, wrists, and
   feathered blades SHALL create a continuous catch → drive → finish →
   hands-away → slide sequence while grips stay clear of the torso. Arms SHALL
   remain softly long through the leg drive and body opening. On the drive,
   visible elbow flexion SHALL begin only after the hands have passed the knee
   envelope and the legs are nearly extended; both elbows SHALL then travel
   rearward as the handle approaches the lower ribs. Recovery SHALL straighten
   the arms and move the hands back past the knees before body-over and slide;
   neither renderer SHALL select a forward-pointing, horizontal-wing, or
   through-torso elbow branch. V4 feet SHALL remain locked to the stretcher
   while both knees follow the shared raised rowing branch; neither leg may
   inherit the standing rest skeleton's downward branch or pass through the
   cockpit.
2. WHEN SkiErg is shown THEN reach, velocity-matched plant, loaded pull, and
   release SHALL read as distinct states; baskets SHALL remain course-anchored
   throughout the loaded phase while the athlete advances relative to them.
   Flexed elbows SHALL point down at plant, rotate rearward in the sagittal
   plane during the loaded core-led press, and re-extend into pole-off without
   selecting a sideways or horizontally inverted branch. During recovery the
   hands and poles SHALL lift and travel forward while the elbow plane returns
   underneath the arm, so the elbows point down again before the next plant.
   Both skis and boots SHALL retain a narrow parallel stance rather than a
   fore/aft striding split. Each hip, knee, and foot SHALL preserve left/right
   order for the entire cycle; V4 SHALL use the shared same-side knee targets
   after clip sampling rather than allowing its leg IK branches to cross.
   Pole contact SHALL end in the first 26–29% of the cycle, and each airborne
   basket SHALL approach the next plant continuously without dropping or
   snapping between anchors.
3. WHEN BikeErg is shown THEN opposed pedal loading SHALL drive coordinated
   ankle, knee, hip, pelvic, shoulder, and head response instead of a crank
   loop plus small sine-wave torso motion.
4. WHEN the camera follows a sport THEN it SHALL provide stable,
   animation-aware composition without random orbiting, strobing, or aggressive
   lens pumping.

### Requirement 5: Temporal visual acceptance

**User Story:** As a reviewer, I want proof that the animation works over time,
not only isolated static-contact screenshots.

#### Acceptance Criteria

1. WHEN animation changes are accepted THEN each sport SHALL be reviewed at
   1×, 2×, and 8× in moving sequences as well as characteristic paused poses.
2. WHEN automated tests run THEN they SHALL cover phase continuity,
   contact-state transitions, plant drift, hand/foot target tolerance,
   deterministic seeking, and live/ghost independence.
3. WHEN visual QA is published THEN it SHALL distinguish data-synchronised
   canonical technique from unavailable athlete-specific biomechanics.
4. WHEN motion is reduced at operating-system level THEN a calm stable pose
   SHALL remain readable and all contact guarantees SHALL hold.
