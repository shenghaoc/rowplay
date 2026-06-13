# Requirements Document: WebGPU-First Replay Graphics Upgrade

## Introduction

This follow-up to the replay animation upgrade keeps the wall-clock motion and
performance-governor foundation, then replaces generic cadence animation with a
Concept2-derived stroke timeline and adds a WebGPU-first 3D renderer path. WebGL
remains mandatory as the fallback so every existing replay still works on
browsers and devices without WebGPU.

The upgrade is scoped to data the public Concept2 Logbook API exposes through
workout strokes and splits. It may infer timing envelopes, accents, and intensity
variation from stroke rows, but it must not claim force-curve or handle-position
reconstruction.

## Glossary

- **Renderer_Factory**: `src/lib/replay/renderer3dLoader.ts`, the client-only
  selection layer for WebGPU first and WebGL fallback.
- **WebGPU_Renderer**: `src/lib/replay/renderer3dWebGPU.ts`, the lazy
  `three/webgpu` entry point.
- **WebGL_Fallback**: `src/lib/replay/renderer3d.ts`, the existing Three.js 3D
  course renderer kept as the compatibility path.
- **Stroke_Model**: `src/lib/replay/strokeModel.ts`, pure replay helpers that
  derive stroke timelines and poses from Concept2 stroke rows or synthetic split
  fallback data.
- **Stroke_Pose**: The per-frame pose envelope consumed by 2D and 3D renderers:
  phase, warped phase, stroke index, catch transition count, drive/recovery
  timing, amplitude, intensity, fatigue, and accents.
- **Ultra_Quality**: A new quality tier for WebGPU-capable devices, still subject
  to the existing performance governor.
- **Backend_Diagnostics**: An unobtrusive replay detail showing the active 3D
  backend (`WebGPU` or `WebGL`) without adding backend choices to the main mode
  selector.

## Requirements

### Requirement 1: WebGPU-First 3D Backend Selection

**User Story:** As an athlete on a premium device, I want the replay to use the
best available graphics backend automatically, so that 3D playback looks richer
without adding setup choices.

#### Acceptance Criteria

1. WHEN the user selects 3D THEN Renderer_Factory SHALL attempt WebGPU first via
   real runtime capability checks and `await renderer.init()`.
2. WHEN WebGPU is unavailable or initialization fails THEN Renderer_Factory SHALL
   fall back to WebGL without failing the replay.
3. WHEN the app renders on the server THEN Renderer_Factory SHALL be SSR-safe and
   report WebGPU unavailable without touching browser globals.
4. WHEN the replay UI is shown THEN the primary selector SHALL remain `2D / 3D`;
   backend information SHALL appear only as a diagnostics detail.

### Requirement 2: WebGL Compatibility Fallback

**User Story:** As an athlete on an older browser, I want the upgraded replay to
keep working, so that WebGPU support is an enhancement rather than a requirement.

#### Acceptance Criteria

1. WHEN WebGL fallback is selected THEN the app SHALL keep using
   `CourseRenderer3D`.
2. WHEN the user never enters 3D or WebGPU is unsupported THEN the app SHALL avoid
   eagerly importing the `three/webgpu` chunk.
3. WHEN `ultra` quality is requested on WebGL THEN the renderer SHALL gracefully
   demote to the closest supported WebGL quality tier.
4. WHEN fallback occurs THEN tests SHALL cover both WebGPU init failure and WebGL
   success paths.

### Requirement 3: Concept2-Derived Stroke Model

**User Story:** As an athlete replaying my own logbook result, I want visible
strokes, poles, or pedal cycles to follow my recorded strokes, so that the replay
feels like my workout rather than a mechanical loop.

#### Acceptance Criteria

1. WHEN real stroke rows exist THEN Stroke_Model SHALL map one visible cycle to
   one Concept2 stroke row.
2. WHEN building a stroke pose THEN Stroke_Model SHALL derive it only from
   public row fields such as `t`, `d`, `pace`, `spm`, `hr`, and `watts`.
3. WHEN stroke rows have irregular intervals or interval resets THEN
   Stroke_Model SHALL normalize them into a monotonic replay timeline.
4. WHEN real stroke rows are unavailable THEN Stroke_Model SHALL provide a
   synthetic split fallback compatible with existing replay behavior.
5. WHEN documenting or labelling the feature THEN the app SHALL NOT claim
   force-curve, drag-factor, or handle-position reconstruction.

### Requirement 4: Renderer Stroke Pose Inputs

**User Story:** As an athlete racing a ghost, I want both my avatar and the ghost
to animate from their own recorded stroke timing, so that side-by-side replay is
meaningful.

#### Acceptance Criteria

1. WHEN rendering a replay frame THEN `RenderState` SHALL accept `strokePose` and
   `ghostStrokePose`.
2. WHEN the replay page samples the live workout and ghost workout THEN it SHALL
   build stroke poses from their respective stroke arrays.
3. WHEN 2D or 3D splash/spray effects fire THEN they SHALL trigger from
   stroke-index catch transitions, not generic phase wrap.
4. WHEN reduced motion is active THEN stroke-derived decorative effects SHALL be
   suppressed while static replay geometry remains legible.

### Requirement 5: Ultra Quality and Larger 3D Stage

**User Story:** As an athlete on an iPhone 16-class phone or M5 MacBook Pro-class
machine, I want the 3D replay to use a larger, denser scene, so that it feels like
a premium visualization instead of a small widget.

#### Acceptance Criteria

1. WHEN WebGPU is active THEN `ultra` quality SHALL be available through the
   existing quality preference controls.
2. WHEN `ultra` quality is active THEN the renderer SHALL use a higher DPR cap,
   better shadow budget, denser course geometry, and richer instanced detail
   while remaining under governor control.
3. WHEN the replay is shown in 3D THEN the stage SHALL be larger than the prior
   3D card, including ghost replay layouts.
4. WHEN different sports are rendered THEN the scene SHALL retain sport-specific
   environmental treatment: RowErg water and lane texture, SkiErg snow/plume
   treatment, and BikeErg track/asphalt speed treatment.
5. WHEN 3D athletes are rendered THEN they SHALL use human-scale segmented bodies
   with separate torso, head, shoulders, limbs, hands/feet, and sport-specific
   kit so the avatar reads as an athlete rather than a toy marker.
6. WHEN the chase camera frames the live athlete THEN it SHALL remain close
   enough for body posture to be legible on desktop and mobile viewports.

### Requirement 6: Documentation, Tests, and Visual QA

**User Story:** As a maintainer, I want the upgrade covered by specs, tests, and
manual visual checks, so that future renderer changes do not regress silently.

#### Acceptance Criteria

1. WHEN Stroke_Model changes THEN co-located unit tests SHALL cover irregular
   intervals, interval resets, synthetic split fallback, high/low-rate envelopes,
   and exact catch transition detection.
2. WHEN renderer inputs change THEN 2D and 3D renderer tests SHALL consume
   `StrokePose` while preserving no-throw and governor coverage.
3. WHEN renderer backend selection changes THEN loader/factory tests SHALL cover
   WebGPU success, WebGPU init failure, WebGL fallback, and SSR-safe false.
4. WHEN replay graphics behavior changes THEN public docs and localized guide
   text SHALL be updated.
5. WHEN final verification runs THEN the branch SHALL pass the repo quality gate
   and manual visual QA SHALL cover `/replay/1001`, `/replay/1003`, and
   `/replay/1004` across 2D, 3D, fallback, light/dark, reduced motion, and mobile
   viewport checks.
