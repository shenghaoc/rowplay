# Design Document: Replay Premium Environments

## Overview

This pass treats environment art as part of the replay product rather than as a
floor beneath the athlete. It preserves the replay engine, recorded/synthetic
stroke model, sport kinematics, athlete rigs, equipment contacts, ghost model,
WebGPU-first factory, WebGL fallback, and performance governor. The rebuild is
concentrated in the visual composition around those systems.

The target is premium stylized sports visualization: authored silhouettes,
controlled palettes, convincing material separation, and enough venue context
to establish scale. It is not photorealism and does not reconstruct a real
route. A coherent scene at replay scale is more valuable than dense detail that
turns into noise.

## Environment art direction

Each sport uses its own Environment_Profile across 2D and 3D. The renderers do
not need identical geometry, but they share the same material and composition
language.

| Sport   | Primary material           | Horizon and venue language                                      | Accent restraint                    |
| ------- | -------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| RowErg  | Deep layered water         | Wooded shoreline, low regatta structures, disciplined markers   | Warm light and lane/buoy highlights |
| SkiErg  | Groomed blue-shadowed snow | Snowbanks, alpine silhouettes, evergreens, Nordic-stadium forms  | Cool light with sparse safety color |
| BikeErg | Dark asphalt/track surface | Barriers, infield/apron, pavilion or training-circuit structures | Warm floodlights and curb markings  |

Foreground contrast is reserved for the athlete, equipment, course edge, and
important contact effects. Background scenery uses simpler silhouettes, lower
contrast, atmospheric perspective, and restrained repetition.

## Canvas 2D composition

Renderer_2D builds every frame back-to-front:

1. a theme-aware sky gradient and atmospheric horizon;
2. distant terrain or built-venue silhouettes;
3. middle-distance vegetation, snowbanks, barriers, or regatta infrastructure;
4. the sport-specific course material and perspective markings;
5. contact effects, live and ghost athletes, labels, and finish cues; and
6. restrained foreground texture or vignette that frames rather than covers the
   action.

Distance-based offsets provide course travel and limited parallax. They reuse
the replay's measured progress so seek, pause, playback speed, and reduced
motion remain deterministic. Repeating texture is clipped to the course instead
of extending a grid through the sky. The environment is painted once per frame
at full opacity; ghost opacity is applied only around the ghost's own athlete,
effects, and label.

The 2D stage receives enough vertical space for a readable horizon and venue
silhouette while remaining shorter than the 3D chase stage. Layout uses canvas
dimensions rather than desktop-only constants so the same hierarchy survives a
narrow phone viewport.

## Three.js environment construction

Renderer_3D builds one static sport scene and reuses it throughout playback. Its
composition has four layers:

- a theme-aware sky/background shell and atmospheric fog for a real horizon;
- a broad sport material plane or apron that fills the camera's ground view;
- the authored replay course, edges, start/finish treatment, and restrained
  sport-specific markers; and
- distant low-poly terrain, vegetation, snowbanks, barriers, lights, or venue
  structures arranged to establish scale without entering the athlete's lane.

Standard Three.js geometries and materials keep the shared scene compatible
with WebGPU and WebGL. Vertex color, flat shading, roughness, opacity, and
emissive accents provide material character without a custom shader dependency.
Static geometry and materials are allocated during scene construction, tracked
for disposal, and only transformed or recolored when state actually changes.

Generic spherical markers are not a universal detail system. RowErg may use
disciplined lane or distance buoys; SkiErg and BikeErg receive their own course
edge language. Contact shadows or equivalent local contrast keep athletes and
equipment visually grounded even when expensive cast shadows are unavailable.

## Lighting, themes, and material separation

Environment_Profile owns sky, horizon/fog, key/fill light, ground, course edge,
and venue-detail colors for light and dark themes. Theme changes update the
whole visual system, not only the page background or lane accent.

The lighting stack keeps one stable world key plus soft ambient/fill support for
the environment and the existing camera-relative athlete lights. Water uses
cool depth and controlled highlights, snow uses high diffuse value with blue
shadow separation, and asphalt remains dark enough for lane paint, equipment,
and athlete footwear to survive. Fog and lower-contrast distant materials create
depth without hiding the course.

## Quality and performance

Environment quality is additive:

- **Low:** complete sky, horizon, course material, and one clear venue
  silhouette per sport.
- **Medium:** additional edge forms and moderate background repetition.
- **High:** denser but still restrained scenery, stronger material detail, and
  the normal shadow/effect budget.
- **Ultra:** the richest supported geometry and atmosphere, subject to the same
  performance governor as the rest of the replay.

The governor may lower pixel ratio and decorative effects during a session.
Optional environment density is chosen at scene build time rather than being
allocated during animation. No quality decision changes stroke timing,
distance, ghost state, or equipment contacts.

## Reduced motion and ghost comparison

Reduced motion keeps the full static illustration while freezing decorative
parallax, waves, spray, speed-responsive lens changes, and secondary chase
easing. The essential follow camera remains locked to the athlete so the
horizon and course do not disappear, flash, or flatten when motion is reduced.

Live and ghost athletes occupy one shared venue. Course framing continues to use
their actual progress and midpoint, while background forms stay outside the
lane and below the visual weight of the two figures. Ghost transparency never
fades or double-renders the environment.

## Asset provenance and truthfulness

All shipped environment art is local procedural code: Canvas paths, gradients,
and fills in 2D; Three.js geometry and standard materials in 3D. Visual concept
work may guide art direction, but no generated environment bitmap, stock photo,
scanned venue, or imported location model is included in the runtime bundle.

The scene is intentionally generic. Documentation states that Concept2 data
drives timing and progress while scenery, weather, time of day, and venue forms
are illustrative presentation choices.

## Verification

Renderer tests check semantic sport objects and material/theme invariants,
quality-density bounds, reduced-motion safety, disposal, and that RowErg-only
markers do not leak into SkiErg or BikeErg. Existing kinematic, contact, camera,
fallback, and performance tests remain authoritative.

Browser QA captures `/replay/1001`, `/replay/1003`, and `/replay/1004` in 2D and
3D, then checks a representative matrix of paused and moving playback, light and
dark themes, ghost comparison, and low/ultra quality. Final replay screenshots
are replaced only after the implemented scene has passed that review.

## Out of scope

- Real-world route, venue, weather, season, or time-of-day reconstruction.
- Satellite imagery, map data, photogrammetry, imported GLTF venues, or generated
  runtime environment images.
- Changes to Concept2 data interpretation, athlete likeness, controls, replay
  timing, or ghost selection.
- Expensive post-processing or shader effects that compromise WebGL fallback or
  the adaptive performance contract.
