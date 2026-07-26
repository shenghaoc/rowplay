# Design Document: Replay Premium Environments

> Scope clarification (July 2026):
> [Replay authored athlete assets](../replay-authored-athlete-assets/design.md)
> applies only to 3D athlete and sport-equipment shells. Environment composition
> remains repository-local; documented CC0 surface maps may supplement High and
> Ultra materials without becoming venue imagery.

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

Surface, scenery, sky, atmosphere, and venue architecture are one art-directed
unit. A new water or snow material must not be placed inside an unchanged
generic background. RowErg therefore composes a continuous river valley from
water through reeds, banks, woodland, docks, and regatta buildings. SkiErg
composes one winter bowl from groomed track through snow shoulders, race
fencing, forest, lodge forms, and blue-shadowed alpine terrain.
BikeErg completes the same system as an indoor timber velodrome under an
evening-session light story: a dim roof cavity and skylights, two authored
seating straights, multi-use infield, service pit, track boards with the full
black/red/blue plus côte d'azur line grammar, scoreboard, and tier-gated
hospitality architecture.

Each venue commits to one light story rather than a generic day/night flip:
RowErg is morning glass over a temperate basin, SkiErg is blue-hour dusk over a
lit piste, and BikeErg is an evening session under one warm cone. Light and dark
themes are two hours of the same story, not unrelated palettes.

## Environment art direction

Each sport uses its own Environment_Profile across 2D and 3D. The renderers do
not need identical geometry, but they share the same material and composition
language.

| Sport   | Primary material           | Horizon and venue language                                     | Accent restraint                          |
| ------- | -------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| RowErg  | Deep layered water         | Morning-glass basin, banks, woodland, campus, finish tower     | Warm morning light and sparse buoy cues   |
| SkiErg  | Groomed blue-shadowed snow | Blue-hour dusk piste, forest clusters, Nordic lodge, floods    | Warm flood pools on cool snow, safety red |
| BikeErg | Warm matte timber          | Evening velodrome roof, seating bowl, infield pit, hospitality | Single warm cone; black/red/blue/azure    |

Foreground contrast is reserved for the athlete, equipment, course edge, and
important contact effects. Background scenery uses simpler silhouettes, lower
contrast, atmospheric perspective, and restrained repetition.

## Canvas 2D composition

Renderer_2D builds every frame back-to-front:

1. a theme-aware outdoor sky and horizon, or BikeErg roof/evening shell;
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
with WebGPU and WebGL. Smooth compound silhouettes, shallow vertex-colour
terrain variation, roughness, opacity, clearcoat, fabric sheen, and restrained
emissive accents provide material character without a custom shader dependency.
High-resolution viewing must not merely expose enlarged cubes, faceted trees, or
pyramid mountains: close-enough venue forms use rounded, lathed, or bevelled
geometry while the most distant forms remain deliberately simple. Static
geometry and materials are allocated during scene construction, tracked for
disposal, and only transformed or recolored when state actually changes.

Generic spherical markers are not a universal detail system. RowErg may use
disciplined lane or distance buoys; SkiErg and BikeErg receive their own course
edge language. Contact shadows or equivalent local contrast keep athletes and
equipment visually grounded even when expensive cast shadows are unavailable.

## Lighting, themes, and material separation

Environment_Profile owns sky, horizon/fog, key/fill light, ground, course edge,
and venue-detail colors for light and dark themes. Theme changes update the
whole visual system, not only the page background or lane accent.

The lighting stack keeps one stable world key plus soft ambient/fill support for
the environment and the existing camera-relative athlete lights. At High and
Ultra, one VSM directional map follows the athlete in texel-snapped light-space
increments within a sport-specific envelope; the same key vector positions the
visible sun disc or flood cone. Native shadows land only on the authoritative
opaque ground receiver, while live contact marks are suppressed so they cannot
double or contradict that shadow.

Per-sport light stories stay coherent with the materials:

- **RowErg (morning glass):** cool depth water with a per-material dimmed sky
  radiance map for Fresnel sheen at grazing angles while steep angles keep
  saturated teal (WebGPU ignores `envMapIntensity`, so the gain is baked into
  the texture). Mist hugs the wooded far shore; the finish tower is the campus
  destination vertical.
- **SkiErg (blue-hour dusk):** deep blue-grey dome, near-black spruce, and the
  groomed course as the brightest surface under a warm floodlight key. Warm
  normal-blend floodlight pools at the masts' course angles tint cool snow by
  hue (additive light cannot read on near-white under ACES). Light/dark themes
  read as dusk/night rather than day/night.
- **BikeErg (evening session):** one warm cone shapes the enclosed bowl; the
  timber track is the lit subject, seating falls toward shadow, and the roof
  cavity stays dim. Timber is matte enough for the diffuse oak response to
  read instead of mirroring the dark roof; the track carries black/red/blue
  plus the côte d'azur apron band.

Fog and lower-contrast distant materials create outdoor depth without hiding
the course; the indoor venue uses enclosure and a single cone instead of a
second bright roof surface competing with the timber.

## Quality and performance

Environment quality is additive:

- **Low:** a deliberately graphic, complete scene with the fewest silhouettes:
  Row has the island, sector banks, one clubhouse, and no far-valley ring; Ski
  has a clean snow bowl, one lodge, sparse forest clusters, and no far-valley
  layer; Bike has a roof shell, two seating straights, and a clean timber lap
  without skylights or race-day architecture.
- **Medium:** a new spatial layer rather than denser copies. Outdoor venues add
  the far horizon; Row adds boathouse and broad sky reflections, Ski adds the
  valley, course orientation, and restrained lights, and Bike adds skylights,
  roof lighting, infield keys, staging pads, and an information ribbon.
- **High:** authored event infrastructure plus local PBR response. Row adds the
  timing campus, launch dock and overhead bridge; Ski adds the timing arch,
  rock shoulder and wax hut; Bike adds the finish gantry, scoreboard, service
  building, team pit, brushed-concrete slab, and tangentially unwrapped CC0 oak
  course.
- **Ultra:** an additional destination zone, not only normal maps or density.
  Row adds a wetland boardwalk and hide; Ski adds a spectator terrace and
  mountain-rescue shelter; Bike adds a hospitality deck. Ultra also adds the
  corresponding normal maps and restrained water/snow highlights.

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

Venue art is local procedural code: Canvas paths, gradients, and fills in 2D;
Three.js geometry and standard materials in 3D. Seamless CC0 surface maps may be
bundled as material inputs when provenance and shipped digests are recorded.
They cannot depict or identify a venue. Generated environment imagery, stock
backplates, scanned locations, and imported location models remain excluded.

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
