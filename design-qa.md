# Replay higher-ceiling design QA

## Comparison target

- Source visual truth:
  [replay art direction](docs/visual-qa/higher-ceiling/reference/replay-art-direction.png)
- Browser-rendered implementation: `http://127.0.0.1:5173/replay/1001`,
  `/replay/1003`, and `/replay/1004` in deterministic demo mode
- Primary desktop evidence:
  [RowErg comparison](docs/visual-qa/higher-ceiling/iteration-3/row-reference-comparison.png),
  [SkiErg comparison](docs/visual-qa/higher-ceiling/iteration-3/ski-reference-comparison.png),
  and
  [BikeErg comparison](docs/visual-qa/higher-ceiling/iteration-3/bike-reference-comparison.png)
- Focused athlete evidence:
  [SkiErg silhouette comparison](docs/visual-qa/higher-ceiling/iteration-1/ski-reference-comparison.png)
- Responsive evidence:
  [RowErg mobile](docs/visual-qa/higher-ceiling/final/row-3d-mobile-light-low-paused.jpg),
  [SkiErg mobile](docs/visual-qa/higher-ceiling/final/ski-3d-mobile-light-low-paused.jpg),
  and
  [BikeErg mobile](docs/visual-qa/higher-ceiling/final/bike-3d-mobile-light-low-paused.jpg)
- Release-gate evidence:
  [capture manifest](docs/visual-qa/higher-ceiling/release-gate/manifest.json)
- Viewports: 1440×1024 browser / 1112×300 Canvas or 1112×420 3D stage and
  390×844 browser / 365×260 Canvas or 365×360 3D stage
- Captured states: 2D desktop dark; 3D desktop light/dark Ultra; 3D mobile
  light Low; Canvas mobile light; 3D mobile dark High/WebGL; representative
  paused/moving, live/ghost, operating-system reduced-motion, and HUD-hidden
  normal/grayscale/dark-silhouette states

The source is an aspirational art-direction triptych rather than a pixel-exact
screen specification. It establishes subject scale, silhouette, venue identity,
negative space, horizon hierarchy, and lighting direction. The implementation
intentionally retains rowplay's generic athlete, recorded-data UI, circular
course mechanics, texture-free web asset budget, and procedural venue policy.

## Findings

No actionable P0, P1, or P2 **visual implementation or release-evidence**
findings remain. The remaining findings are accepted follow-up constraints.

- [P3] Procedural skies and ground materials remain flatter than the painted
  reference.
  Location: all three 3D venue backdrops.
  Evidence: the paired comparisons show the same venue and value hierarchy,
  but the reference includes cloud, water, snow, and asphalt micro-detail that
  the texture-free runtime deliberately omits.
  Impact: close inspection remains illustrative rather than cinematic.
  Follow-up: a future, separately authorized environment-asset contract could
  add provenance-reviewed texture/compression work without changing this rig.

- [P3] RowErg's athlete is smaller than the SkiErg/BikeErg athlete in frame.
  Location: RowErg 3D chase view.
  Evidence: the full oar span remains visible in desktop and mobile captures,
  which necessarily uses more horizontal and vertical air than the compact
  SkiErg/BikeErg equipment.
  Impact: body detail is less prominent, but hands, blades, hull, seat, and
  foot contacts remain readable and unclipped.
  Follow-up: keep the current equipment-safe framing unless a future view can
  crop or independently inspect the athlete.

- [P3] Close poses can still expose mesh/equipment interpenetration.
  Location: all three V4 sports at contact-heavy pose extremes.
  Evidence: the release frames preserve complete limbs and equipment, while
  dense motion review still finds occasional cloth/body/equipment overlap at
  oblique angles.
  Impact: contacts remain mechanically correct, but close inspection can reveal
  surfaces passing through one another.
  Follow-up: the requester explicitly scoped this to the next PR; keep it
  visible as a known limitation rather than presenting V4 as collision solved.

- [P3] Athlete anatomy remains a compact stylized approximation.
  Location: the repository-owned V4 skinned surface in every 3D sport.
  Evidence: the figure has continuous skinned form and authored clothing planes,
  but muscle definition, facial anatomy, hands, and body-shape nuance remain
  well below a photoreal production character.
  Impact: the athlete is identifiable and no longer block-built, but physical
  features remain the clearest visual-quality ceiling.
  Follow-up: the requester explicitly scoped the next character-surface pass to
  a separate PR without weakening this PR's motion/contact contracts.

## Required fidelity surfaces

- Fonts and typography: existing Source Sans 3 / Source Code Pro hierarchy,
  weights, labels, and telemetry pills remain unchanged and readable in both
  themes and at mobile width.
- Spacing and layout rhythm: the measured 1112×300/420 and 365×260/360 stages
  retain their real responsive layouts, controls remain outside the canvas, and
  no stage or persistent control overlaps at either breakpoint.
- Colors and visual tokens: live purple, ghost cyan, theme surfaces, course
  safety colors, and semantic labels remain consistent. Athlete kit, skin,
  footwear, equipment, and course values remain separated in light and dark.
- Image quality and asset fidelity: the source and implementation were judged
  from combined images. The runtime uses a real repository-owned GLB rather
  than a placeholder, CSS drawing, SVG substitute, scan, likeness, or downloaded
  avatar. WebGPU captures are sharp at Ultra; Low preserves composition.
- Copy and content: demo workout, comparison, quality, backend, and transport
  labels remain accurate and localized; no art-direction prompt language leaks
  into the product UI.
- Icons and controls: 2D/3D, theme, quality, play/pause, seek, comparison, and
  mobile navigation controls retain their existing icon family and states.
- Accessibility and behavior: keyboard-backed play/seek controls, mobile tap
  targets, focus treatment, reduced-motion mechanics, and Canvas fallback remain
  covered by the existing UI and focused replay tests.

## Comparison history

### Baseline

Evidence: [baseline captures](docs/visual-qa/higher-ceiling/baseline/).

- [P1] Ball-joint mannequin bodies and primitive equipment dominated all 3D
  sports.
- [P1] Complete concentric scenery rings made three nominally different venues
  read as one toy diorama.
- [P2] One generic contact ellipse and downward-biased cameras weakened
  grounding, skyline, and landmark visibility.

### Iteration 1 — SkiErg vertical slice

Evidence: [iteration 1 captures](docs/visual-qa/higher-ceiling/iteration-1/).

- Fixed double-scaled limb shells, removed visible elbow/knee balls after asset
  validation, overlapped torso/pelvis/limbs, retained exact pole/ski contacts,
  and tightened the chase composition.
- Post-fix comparison established one coherent athlete and approved the shell
  contract for RowErg and BikeErg.

### Iteration 2 — cross-sport adaptation

Evidence: [iteration 2 captures](docs/visual-qa/higher-ceiling/iteration-2/).

- Fitted authored hull, blade, ski, tyre, frame, saddle, pedal, helmet, hand,
  and shoe forms to the existing contact geometry.
- Preserved signed clockwise Canvas wheel/crank motion and asymmetric direction
  cues so the BikeErg no longer implies backwards pedalling.
- Post-fix comparison approved all sport silhouettes; venue composition remained
  the explicit blocker.

### Iteration 3 — composed venues and grounding

Evidence: [iteration 3 captures](docs/visual-qa/higher-ceiling/iteration-3/).

- Replaced complete rings with authored sectors, landmark clusters, gaps,
  asymmetric horizon centers, partial berms/stands, and selective practical
  lighting.
- Replaced the generic ellipse with hull, ski, and tyre-specific contact
  footprints that follow independent live/ghost surge.
- Opened the Row/Ski skyline and reduced the first Alpine massif after the
  combined comparison showed it consuming the sky.
- Post-fix desktop and mobile captures have no clipped critical equipment,
  overlapping controls, shared donut composition, or mannequin joint artifacts.

## Primary interactions tested

- Switched 2D ↔ 3D on all three demo routes.
- Changed Ultra ↔ Low quality and confirmed the WebGPU diagnostic.
- Sought to characteristic poses, played and paused moving replays.
- Enabled and removed a past-session ghost comparison.
- Switched light ↔ dark theme.
- Resized between desktop and mobile stages.
- Captured real `prefers-reduced-motion: reduce` contexts before application
  initialization in both Canvas and Three.js for every sport.
- Cropped only the world-space telemetry strip, without scaling the stage, then
  captured normal, grayscale, and high-contrast dark-silhouette variants.
- Observed no error notification, blank replay, or renderer fallback during the
  browser passes. The interactive in-app browser exposed WebGPU; the automated
  release context deliberately records WebGL High as the real fallback selected
  when its headless Chromium process reports no WebGPU adapter.

## Implementation checklist

- [x] Source and implementation opened and compared in combined images.
- [x] Three P0/P1/P2 screenshot-fix-comparison iterations completed.
- [x] Representative desktop/mobile, light/dark, 2D/3D, Low/Ultra,
      paused/moving, and ghost states captured.
- [x] Complete Canvas light/mobile, 3D mobile dark, HUD-hidden silhouette, and
      reduced-motion evidence captured.
- [x] Athlete/equipment provenance and asset contract documented.
- [x] Residual differences classified as non-blocking P3 constraints.

final result: visual pass; release-evidence pass
