# Requirements Document: Replay Motion Truth and Sport Kinematics

## Introduction

The replay already has recorded-stroke poses, sport-aware 3D scenery, and a
WebGPU-first backend. This upgrade makes the visible movement honest and
coherent across renderers: correct cycle inputs, one shared authored kinematics
solver, stable equipment contacts, and distinct 2D sport surfaces.

## Requirements

### Requirement 1: Motion-truth timeline

**User Story:** As an athlete, I want visible cycles to stay aligned with the
logged cadence, so the replay does not invent or skip strokes.

#### Acceptance Criteria

1. WHEN a leading or interval-reset row advances neither time nor distance THEN
   it SHALL establish an anchor without creating a visible cycle.
2. WHEN a valid real stroke row is modeled THEN it SHALL create exactly one
   cycle for RowErg, SkiErg, or BikeErg.
3. WHEN a split-derived rate changes THEN synthetic phase SHALL remain
   continuous across the entry boundary.
4. WHEN BikeErg distance is inferred from internal pace THEN the calculation
   SHALL treat that pace as seconds per 500 m.
5. WHEN demo strokes are built THEN their count and timing SHALL follow the
   declared cadence rather than a fixed sample count.

### Requirement 2: Shared authored kinematics

**User Story:** As an athlete, I want the 2D and 3D figures to perform the same
recognizable movement instead of moving every joint from one cosine.

#### Acceptance Criteria

1. WHEN RowErg is rendered THEN drive SHALL sequence legs, body, and arms, and
   recovery SHALL sequence hands, body, and slide in reverse order.
2. WHEN SkiErg is rendered THEN reach, plant/pull, release, and upright recovery
   SHALL be separate continuous stages.
3. WHEN BikeErg is rendered THEN opposed pedals, bounded ankle pitch, and
   restrained torso motion SHALL follow a continuous crank cycle.
4. WHEN either renderer samples a pose THEN it SHALL consume the shared pure
   kinematics outputs rather than independently inventing phase curves.
5. WHEN effort changes THEN authored range of motion SHALL remain stable; only
   restrained secondary cues MAY change.

### Requirement 3: Sport-specific 2D replay

**User Story:** As an athlete, I want the 2D course to read as water, snow, or
track for the selected machine.

#### Acceptance Criteria

1. WHEN RowErg is active THEN the 2D lane SHALL show water-oriented treatment.
2. WHEN SkiErg is active THEN the 2D lane SHALL show snow and groomed-course
   treatment without water ripples.
3. WHEN BikeErg is active THEN the 2D lane SHALL show track, curb, and lane-mark
   treatment without water ripples.
4. WHEN BikeErg wheels animate THEN wheel roll SHALL derive from distance while
   crank motion derives from cadence.
5. WHEN reduced motion is active THEN decorative surface and particle motion
   SHALL stop while the course and athlete remain readable.

### Requirement 4: 3D contact and camera integrity

**User Story:** As an athlete, I want hands and feet to stay attached to the
equipment and the camera to frame the movement clearly.

#### Acceptance Criteria

1. WHEN a RowErg stroke is posed THEN feet SHALL remain at boat-space footplate
   targets and hands SHALL remain at actual oar-handle targets.
2. WHEN a SkiErg stroke is posed THEN hands SHALL remain at pole grips and pole
   tips SHALL contact the course only during the plant/pull stage.
3. WHEN BikeErg is posed THEN feet SHALL remain on opposed pedals, shoe pitch
   SHALL remain bounded, and wheel roll SHALL derive from distance.
4. WHEN the chase camera updates THEN both its position and look target SHALL use
   frame-rate-independent damping.
5. WHEN viewport aspect or sport changes THEN framing SHALL keep the athlete's
   posture legible without clipping the course.
6. WHEN reduced motion is active THEN camera framing SHALL remain stable and
   SHALL suppress decorative lens breathing.

### Requirement 5: Honest documentation and compatibility

**User Story:** As an athlete, I want to understand what the replay derives and
what it merely illustrates.

#### Acceptance Criteria

1. WHEN replay motion is documented THEN it SHALL say that the kinematics are an
   illustrative envelope aligned to recorded stroke rows.
2. WHEN telemetry is described THEN documentation SHALL NOT claim recorded force
   curves, handle path, joint positions, drive length, or posture.
3. WHEN watts are mentioned at stroke resolution THEN documentation SHALL make
   clear that rowplay derives them from pace.
4. WHEN the upgrade ships THEN WebGPU-first selection, WebGL fallback, quality
   governor, ghost timing, and existing replay controls SHALL remain compatible.

### Requirement 6: Tests and visual verification

**User Story:** As a maintainer, I want motion constraints to be tested rather
than relying on mesh existence and no-throw coverage.

#### Acceptance Criteria

1. WHEN sport kinematics change THEN pure tests SHALL cover stage continuity and
   finite bounded outputs for all sports.
2. WHEN timeline logic changes THEN tests SHALL cover anchors, BikeErg units,
   synthetic phase continuity, and demo cadence.
3. WHEN renderer motion changes THEN tests SHALL cover all three sports and
   observable contact/transform constraints where practical.
4. WHEN final verification runs THEN the repository quality gate SHALL pass.
5. WHEN visual QA runs THEN demo routes `/replay/1001`, `/replay/1003`, and
   `/replay/1004` SHALL be checked in 2D and 3D, including reduced motion and a
   mobile-sized viewport.
