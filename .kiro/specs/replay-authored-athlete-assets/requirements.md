# Requirements Document: Replay Authored Athlete Assets

## Introduction

The procedural replay rig preserves timing, contacts, fallback behavior, and a
small animation hot path, but its visible 3D shells can still read as assembled
primitives. This follow-up raises the visual ceiling by allowing one compact,
repository-owned GLB containing authored athlete and sport-equipment geometry.

The GLB changes visible form, not motion truth. `sportKinematics.ts`, the
existing contact targets, and the established live/ghost placement remain
authoritative. Canvas 2D and the procedural 3D geometry remain reliable
fallbacks. The asset is a generic sports illustration: it is not an avatar
generator output, scan, user image, or athlete likeness.

This specification supersedes only the procedural-only 3D asset restrictions
in the completed replay figure and motion specifications. The later
[`replay-motion-system-rebuild`](../replay-motion-system-rebuild/design.md)
supersedes V3's static-only animation boundary while retaining this
specification's provenance, privacy, contact, fallback, and performance
contracts. Neither specification relaxes the procedural-environment,
data-truth, accessibility, or performance requirements.

## Requirements

### Requirement 1: Repository-owned and auditable artwork

**User Story:** As a maintainer, I want every shipped replay model to have clear
ownership and provenance, so visual quality does not introduce licensing or
identity risk.

#### Acceptance Criteria

1. WHEN an authored replay GLB is shipped THEN it SHALL be created specifically
   for rowplay or distributed under a licence compatible with this MIT project.
2. WHEN the asset is committed THEN a neighbouring provenance document SHALL
   identify its source, creator or ownership, licence, generation/export path,
   version, contents, and any modifications.
3. WHEN the asset is rebuilt THEN a repository script SHALL produce the same
   named slot contract deterministically from reviewed source.
4. WHEN a model is selected THEN it SHALL NOT be an avatar-generator output,
   scanned person, athlete likeness, user image, or undocumented download.
5. WHEN the asset format or required slot contract changes incompatibly THEN
   the asset filename/version SHALL change rather than silently replacing the
   meaning of an existing version.

### Requirement 2: Authored form with authoritative procedural motion

**User Story:** As an athlete, I want a coherent designed 3D character without
losing trustworthy sport timing or equipment contact.

#### Acceptance Criteria

1. WHEN 3D initializes successfully THEN authored torso, pelvis, head, limb,
   hand, foot, and supported equipment shells SHALL replace the corresponding
   visible procedural shells.
2. WHEN the authored shells are applied THEN existing rig nodes, staged sport
   kinematics, segment lengths, and hand/foot/equipment targets SHALL continue
   to own every runtime transform.
3. WHEN live and ghost athletes render together THEN each SHALL receive
   independent geometry instances and transforms while sharing immutable loaded
   templates where safe.
4. WHEN theme or lane identity changes THEN runtime-owned materials SHALL retain
   light/dark separation and live/ghost accents without baking identity into the
   asset.
5. WHEN the athlete is shown THEN the result SHALL remain a generic
   illustration and SHALL NOT claim measured biomechanics, body shape,
   clothing, appearance, or likeness.

### Requirement 3: Reliable loading and fallback

**User Story:** As an athlete, I want replay to remain available when an optional
3D asset or backend cannot load.

#### Acceptance Criteria

1. WHEN the user opts into 3D THEN the local GLB SHALL load through the existing
   lazy 3D boundary and SHALL NOT increase the initial 2D application bundle.
2. WHEN the asset request, parse, or slot validation fails THEN the existing
   procedural 3D rig SHALL remain usable and Canvas 2D SHALL remain the outer
   stable fallback.
3. WHEN WebGPU is unavailable THEN the same authored geometry SHALL work through
   WebGL without a second asset fork.
4. WHEN the loader completes THEN missing, duplicate, invalid, or non-finite
   required slots SHALL fail closed to the procedural geometry.
5. WHEN the renderer is destroyed THEN cloned geometry and parsed temporary
   materials SHALL be disposed without invalidating cached templates still in
   use.

### Requirement 4: Web delivery and animation performance

**User Story:** As an athlete on a recent phone or laptop, I want improved form
without a long load or degraded replay smoothness.

#### Acceptance Criteria

1. WHEN the asset ships THEN its exact byte size, geometry/slot inventory, and
   material/texture inventory SHALL be recorded and reviewed; unexplained growth
   SHALL block release.
2. WHEN the animation loop runs THEN asset integration SHALL allocate no new
   geometry, material, vector, or loader object per frame.
3. WHEN quality tiers or adaptive degradation change THEN timing, contacts,
   authored-shell transforms, reduced motion, and ghost comparison SHALL remain
   deterministic.
4. WHEN athlete quality changes THEN it SHALL retain the same skinned body,
   semantic pose, and contact solve while providing material/detail differences
   that are visible on the athlete itself, not only a higher device-pixel ratio
   or more distant environment dressing.
5. WHEN authored details do not change the captured desktop or mobile
   silhouette THEN they SHALL be removed rather than consuming web and GPU
   budget.
6. WHEN the GLB is loaded THEN it SHALL remain local to the deployed rowplay
   origin and SHALL make no third-party asset request.

### Requirement 5: Frame-led visual acceptance

**User Story:** As an athlete, I want the authored asset to create a visibly
better replay, not merely satisfy a loader or object-count test.

#### Acceptance Criteria

1. WHEN implementation begins THEN the current RowErg, SkiErg, and BikeErg
   replay SHALL be captured in 2D and 3D at the real desktop and mobile stage
   sizes before visual decisions are changed.
2. WHEN the authored-character pass is reviewed THEN SkiErg SHALL first prove a
   coherent full-body silhouette before RowErg and BikeErg adaptations are
   accepted.
3. WHEN visual iteration runs THEN at least three screenshot-and-critique loops
   SHALL record the three clearest remaining defects and the subsequent fixes.
4. WHEN final QA runs THEN all three sports SHALL be reviewed in 2D and 3D,
   desktop and mobile, light and dark, paused and moving, with representative
   ghost, reduced-motion, and Low/Ultra states.
5. WHEN silhouette QA runs THEN HUD-hidden characteristic poses SHALL remain
   identifiable at 100% size in normal color, grayscale, and dark silhouette.
6. WHEN the change is published THEN a repository visual-QA note SHALL link the
   baseline and final captures, enumerate the matrix, and state remaining known
   compromises.
7. WHEN tests pass THEN they SHALL be presented as evidence for timing,
   contacts, loading, fallback, finite transforms, disposal, and performance,
   not as proof of aesthetic quality.

### Requirement 6: Documentation and release truth

**User Story:** As a user or reviewer, I want product and release documentation
to describe the authored asset accurately.

#### Acceptance Criteria

1. WHEN the authored asset is active THEN `README.md`, `docs/usage.md`, and all
   six localized replay guides SHALL distinguish the authored 3D shells from
   the procedural Canvas fallback.
2. WHEN completed historical specs prohibit imported 3D assets THEN they SHALL
   link to this specification as the narrow superseding policy.
3. WHEN environment provenance is described THEN the existing prohibition on
   imported/generated environment imagery and location models SHALL remain in
   force.
4. WHEN public replay screenshots are replaced THEN only final accepted demo
   captures using synthetic data SHALL be published.
5. WHEN release validation runs THEN the repository gate, focused replay tests,
   locale validation, browser/E2E smoke path, and `git diff --check` SHALL pass.

### Requirement 7: Native handoff without a second athlete

**User Story:** As a RowPlay Studio maintainer, I want a native-friendly V4
derivative and a machine-readable contract, so Studio can consume the canonical
rowplay athlete without remodelling it.

#### Acceptance Criteria

1. WHEN the V4 athlete ships THEN rowplay SHALL keep the GLB as the web
   production runtime artifact.
2. WHEN a native derivative is needed THEN it SHALL be generated from the exact
   canonical GLB by Blender, with no alternative proportions or authoring
   geometry in the conversion script.
3. WHEN the handoff is published THEN a JSON contract SHALL record artifact
   hashes, units/axes, skeleton order, hierarchy, rest transforms, clips, phase
   landmarks, contacts, surface roles, provenance, and validation commands.
4. WHEN RowPlay Studio consumes V4 THEN it SHALL pin this rowplay commit and
   generated contract rather than independently remodelling the athlete.
5. WHEN USDZ byte identity is unavailable THEN the limitation SHALL be
   documented and a deterministic semantic validation SHALL protect the
   skinning, skeleton, geometry, material, and clone-isolation contract.

### Requirement 8: Coherent rowing assembly and artifact-free skin

**User Story:** As a rower, I want to see a complete athlete seated inside a
credible racing shell, not a torso floating above a solid toy deck or a ghost
whose limbs disappear through transparency sorting.

#### Acceptance Criteria

1. WHEN RowErg renders THEN the shell SHALL have an actual open cockpit with
   split fore/aft decks, a recessed tub, visible rails, an angled fixed foot
   stretcher, and a connected wing rigger; no opaque deck SHALL span the leg
   volume.
2. WHEN the athlete slides THEN a shaped seat pad, carriage, guides, and rollers
   SHALL translate with the pelvis while remaining over the shell's fixed rails.
3. WHEN V4 RowErg feet are contact-locked THEN both knees SHALL consume the
   deterministic rowing-rig bend branch and remain above the cockpit throughout
   the stroke instead of folding through the hull.
4. WHEN live or ghost V4 athletes render THEN the skinned human mesh SHALL stay
   fully opaque with depth test/write enabled; ghost identity SHALL use tint or
   other opaque styling rather than per-triangle alpha sorting.
5. WHEN the Blender surface is rebuilt THEN overlapping near-coplanar garment
   decorations that cause moving depth seams SHALL be removed or represented by
   vertex colour, and both leg chains SHALL remain distinguishable from shell
   and cockpit materials.
