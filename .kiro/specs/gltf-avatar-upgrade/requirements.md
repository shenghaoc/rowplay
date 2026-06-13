# Requirements Document: GLTF Avatar Upgrade

## Introduction

The current 3D avatar is a ball-and-stick skeleton of ~20 meshes (ellipsoids,
capsules, boxes) with flat-colored materials. It looks identical at every quality
tier — the "Ultra" setting only improves the environment (water, shadows, spray),
not the athlete. This upgrade replaces the procedural human body with rigged GLTF
models driven by the existing IK animation system, so the avatar reads as a
human athlete rather than a toy marker.

Sport-specific equipment (boat, oars, skis, poles, bike) remains procedural
Three.js geometry. Only the human body switches to GLTF.

## Glossary

- **Model_Cache**: `src/lib/replay/modelCache.ts`, handles GLTF loading and
  in-memory caching by URL.
- **Bone_Mapper**: `src/lib/replay/boneMapper.ts`, converts IK target positions
  to skeleton bone rotations each frame.
- **GLTF_Model**: A rigged humanoid model in GLB format, sourced from Mixamo
  and converted. Two variants: full-detail and low-poly.
- **Sport_Profile**: The existing `SportProfile` interface and `SPORT_PROFILES`
  map, which defines per-sport avatar construction and animation.
- **Quality_Config**: The existing `QualityConfig` interface controlling renderer
  settings per quality tier.

## Requirements

### Requirement 1: Rigged Humanoid Model Loading

**User Story:** As an athlete replaying my workout in 3D, I want the avatar to
look like a realistic human with proper proportions, so that the replay feels
like a real athlete visualization.

#### Acceptance Criteria

1. WHEN the 3D renderer initializes THEN it SHALL load a rigged GLTF humanoid
   model instead of constructing a procedural body.
2. WHEN the same model is needed for live and ghost lanes THEN Model_Cache
   SHALL return cloned scenes from a single loaded model.
3. WHEN quality is Low or Medium THEN the renderer SHALL load a low-poly model
   variant.
4. WHEN quality is High or Ultra THEN the renderer SHALL load a full-detail
   model variant.
5. WHEN the model fails to load THEN the renderer SHALL fall back gracefully
   (show a minimal placeholder or log an error) without crashing the replay.

### Requirement 2: Bone-Driven Animation

**User Story:** As an athlete watching my stroke motion replayed, I want the
avatar's body to move with realistic joint articulation, so that rowing, skiing,
and cycling motions look natural.

#### Acceptance Criteria

1. WHEN the avatar animates THEN Bone_Mapper SHALL drive skeleton bone rotations
   from IK target positions computed by the existing sport animate functions.
2. WHEN computing limb rotations THEN Bone_Mapper SHALL use two-bone IK for
   arms (shoulder → elbow → hand) and legs (hip → knee → foot).
3. WHEN computing torso rotation THEN Bone_Mapper SHALL distribute layback
   across spine bones.
4. WHEN computing head orientation THEN Bone_Mapper SHALL use look-at from the
   torso direction.
5. WHEN reduced motion is active THEN the skeleton SHALL remain in a valid
   static pose without decorative animation.

### Requirement 3: Sport-Specific Equipment Retention

**User Story:** As an athlete replaying different sports, I want the correct
equipment (boat, skis, bike) to appear with the athlete, so that each sport is
visually distinct.

#### Acceptance Criteria

1. WHEN rendering RowErg THEN the avatar group SHALL include procedural hull,
   deck, foot plate, oars, and blades positioned relative to the skeleton.
2. WHEN rendering SkiErg THEN the avatar group SHALL include procedural skis,
   boots, poles, and baskets positioned relative to the skeleton.
3. WHEN rendering BikeErg THEN the avatar group SHALL include procedural frame,
   wheels, cranks, pedals, and helmet positioned relative to the skeleton.
4. WHEN hands/feet are on equipment THEN they SHALL remain visually attached
   (hands on oar handle, feet on pedals, hands on pole grips).

### Requirement 4: Quality Tier Integration

**User Story:** As an athlete on a premium device, I want the avatar to look
better at higher quality settings, so that the quality control affects the
athlete, not just the environment.

#### Acceptance Criteria

1. WHEN Quality_Config is rendered THEN it SHALL include an `avatarModel` field
   selecting the model variant.
2. WHEN the performance governor degrades quality THEN the loaded avatar model
   SHALL NOT hot-swap (environment detail degrades, not the model).
3. WHEN shadows are enabled (High/Ultra) THEN the GLTF model meshes SHALL cast
   and receive shadows via the existing `finalizeAvatar` shadow setup.

### Requirement 5: Accent and Material Customization

**User Story:** As an athlete viewing different lanes, I want each lane to have
its own accent color on the athlete's kit and equipment, so that live and ghost
lanes are visually distinct.

#### Acceptance Criteria

1. WHEN constructing the avatar THEN the accent color SHALL be applied to
   clothing material properties (color override) and equipment meshes.
2. WHEN the ghost lane renders THEN it SHALL use a different accent and
   translucent materials via the existing `finalizeAvatar` opacity path.

### Requirement 6: Documentation, Tests, and Visual QA

**User Story:** As a maintainer, I want the avatar upgrade covered by specs,
tests, and visual checks, so that future changes do not regress silently.

#### Acceptance Criteria

1. WHEN Model_Cache is implemented THEN co-located unit tests SHALL cover
   loading, caching, cloning, and error handling.
2. WHEN Bone_Mapper is implemented THEN co-located unit tests SHALL cover
   two-bone IK, spine rotation, and head look-at.
3. WHEN renderer avatar construction changes THEN 3D renderer tests SHALL cover
   the new GLTF-based avatar path.
4. WHEN final verification runs THEN the branch SHALL pass the repo quality
   gate and manual visual QA SHALL cover `/replay/1001`, `/replay/1003`, and
   `/replay/1004` across 3D mode, all quality tiers, light/dark themes, and
   mobile viewports.
