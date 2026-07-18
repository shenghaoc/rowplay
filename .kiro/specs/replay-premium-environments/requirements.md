# Requirements Document: Replay Premium Environments

## Introduction

The replay's articulated athletes and sport kinematics can only read as a
professional product when the course around them establishes material, scale,
depth, and place. This follow-up replaces generic gradients, flat floors, and
repeated course clutter with complete sport-specific environments in both the
Canvas 2D and Three.js 3D renderers.

The scenery remains an illustrative replay presentation. Concept2 workout data
does not include route geography, venue, weather, lighting, or camera data, so
the environment must never imply that it reconstructs the athlete's real
location or conditions.

## Glossary

- **Renderer_2D**: `src/lib/replay/renderer.ts`, the Canvas 2D replay renderer.
- **Renderer_3D**: `src/lib/replay/renderer3d.ts`, the Three.js scene shared by
  the WebGPU and WebGL 3D paths.
- **Environment_Profile**: The sport- and theme-specific palette, lighting,
  atmosphere, material, and scenery rules used to build a coherent course.
- **Venue_Cues**: Restrained background and trackside forms that establish a
  competition setting without claiming a real-world venue.
- **Quality_Tier**: The existing low, medium, high, or ultra replay quality
  preference, subject to renderer capability and adaptive degradation.
- **Reduced_Motion**: The operating-system `prefers-reduced-motion: reduce`
  setting.

## Requirements

### Requirement 1: Complete sport-specific visual identity

**User Story:** As an athlete, I want each replay to look like a purposeful
sport venue, so RowErg, SkiErg, and BikeErg no longer appear to share one empty
generic stage.

#### Acceptance Criteria

1. WHEN a RowErg replay is shown THEN both renderers SHALL present layered water
   with shoreline or regatta-scale venue cues and clear separation between
   water, course markings, and sky.
2. WHEN a SkiErg replay is shown THEN both renderers SHALL present groomed snow
   with snowbank, alpine, evergreen, or Nordic-stadium cues and readable cool
   shadow separation.
3. WHEN a BikeErg replay is shown THEN both renderers SHALL present a deliberate
   asphalt or velodrome-style course with curbs, barriers, and built-venue or
   floodlit training-circuit cues.
4. WHEN switching sports THEN the environment SHALL change in composition,
   material, silhouette, and palette rather than only changing a tint.

### Requirement 2: Layered and legible 2D environments

**User Story:** As an athlete using the reliable 2D renderer, I want a rich
course illustration with depth and scale, so fallback graphics still feel like
a first-class product.

#### Acceptance Criteria

1. WHEN Renderer_2D paints a frame THEN it SHALL compose distinct sky,
   horizon/background, middle-distance venue, course, and foreground layers.
2. WHEN course texture or parallax moves THEN its offset SHALL follow replay
   distance and direction rather than renderer frame count.
3. WHEN a ghost is present THEN the shared environment SHALL retain full
   opacity while ghost styling applies only to the ghost athlete and its own
   effects or labels.
4. WHEN the replay stage is resized THEN environment layers, course width, and
   athlete scale SHALL remain legible on desktop and narrow mobile layouts.
5. WHEN course markers are drawn THEN they SHALL reinforce depth and distance
   without turning the full scene into a spreadsheet-like grid.

### Requirement 3: Grounded and atmospheric 3D environments

**User Story:** As an athlete using 3D replay, I want a convincing horizon,
ground material, and surrounding venue, so the athlete does not float on a flat
plane in an empty void.

#### Acceptance Criteria

1. WHEN Renderer_3D builds a scene THEN it SHALL include a sky or atmospheric
   background, a readable horizon, sport-specific ground/course treatment, and
   distant scenery that establishes scale.
2. WHEN RowErg is active THEN generic course clutter SHALL NOT be reused as
   unexplained objects on SkiErg or BikeErg stages; markers SHALL be
   sport-appropriate and intentionally placed.
3. WHEN an athlete is framed THEN lighting and local ground contrast SHALL keep
   the athlete and equipment visually anchored without obscuring their
   silhouette.
4. WHEN a theme changes THEN sky, fog/atmosphere, lighting, course materials,
   and venue cues SHALL update as one coherent palette.
5. WHEN optional detail density changes THEN the core horizon, course identity,
   and athlete grounding SHALL remain present at every quality tier.

### Requirement 4: Professional composition without false realism

**User Story:** As an athlete, I want polished replay graphics without being
misled about what my workout recorded.

#### Acceptance Criteria

1. WHEN scenery is documented or displayed THEN it SHALL be described as a
   generic illustrative venue, not a reconstruction of route geography,
   weather, time of day, or a real competition site.
2. WHEN the course is composed THEN scenery SHALL support the athlete, equipment,
   progress, and ghost comparison rather than competing with telemetry or
   blocking important contacts.
3. WHEN decorative forms are too small to survive the replay pixel budget THEN
   the renderer SHALL prefer bold authored silhouettes over noisy sub-pixel
   detail.
4. WHEN replay art is bundled THEN the environment SHALL be produced from local
   procedural Canvas drawing and Three.js geometry/materials; it SHALL NOT
   download or ship generated environment images, scanned locations, or imported
   venue models.

### Requirement 5: Performance, fallback, and accessibility

**User Story:** As an athlete on any supported device, I want the improved scene
to remain smooth and accessible instead of reserving a coherent environment for
only the fastest hardware.

#### Acceptance Criteria

1. WHEN quality is low or adaptive degradation is active THEN the renderer MAY
   reduce scenery density, shadow cost, resolution, water displacement, and
   particles, but SHALL preserve sport identity, course readability, and the
   athlete silhouette.
2. WHEN ultra quality is unavailable THEN WebGL or 2D fallback SHALL retain the
   same art direction with an appropriately reduced detail budget.
3. WHEN Reduced_Motion is active THEN decorative parallax, wave, spray,
   speed-responsive lens changes, and secondary chase easing SHALL be
   suppressed or frozen while the static environment remains complete and the
   essential athlete-locked follow camera remains legible.
4. WHEN the scene animates THEN static environment geometry, materials, and
   palette objects SHALL NOT be rebuilt per frame.
5. WHEN a ghost comparison is active THEN environment detail SHALL remain
   bounded so both athletes stay visible within the existing camera and
   performance contracts.

### Requirement 6: Regression proof and visual verification

**User Story:** As a maintainer, I want environment quality tied to tests and
actual replay captures, so object counts cannot substitute for a professional
rendered result.

#### Acceptance Criteria

1. WHEN renderer tests run THEN they SHALL cover sport-specific environment
   selection, theme contrast, quality-tier bounds, reduced-motion behavior, and
   the absence of inappropriate shared course clutter.
2. WHEN visual QA runs THEN all three demo sports SHALL be reviewed in 2D and
   3D, with representative paused and moving playback, light and dark themes,
   ghost comparison, and low/ultra quality states.
3. WHEN ghost replay is reviewed THEN the shared environment and both athletes
   SHALL remain readable without double-painted or faded scenery.
4. WHEN the change is complete THEN public documentation, replay screenshots,
   and the repository quality gate SHALL be updated and pass.
