# Design Document: 3D Avatar Geometry Upgrade

## Overview

The 3D avatar was a ball-and-stick skeleton of ~20 meshes (plain boxes and
spheres) that looked identical at every quality tier. This upgrade replaces the
primitive body parts with shaped procedural geometry: tapered limbs with muscle
definition, a torso with shoulder caps and chest/back shape, hands with fingers,
feet with shoes, a head with jaw and ears, and visible neck. Quality tiers now
control avatar geometry detail (segment count) in addition to environment
settings.

Sport-specific equipment (boat hull, oars, skis, poles, bike frame, wheels)
remains procedural Three.js geometry — those shapes are simple and look fine.

## Body Part Upgrades

### Torso (`makeTorso`)
- Shaped ellipsoid for chest (wider at shoulders, narrower at waist)
- Shoulder cap spheres for visible deltoids
- Back plate for rear definition
- Accent jersey stripe across the chest
- Visible neck cylinder

### Head (`makeHead`)
- Cranium (slightly elongated sphere)
- Jaw/chin (smaller sphere below for definition)
- Ears (small flattened spheres on each side)
- Hair cap on top

### Hips (`makeHips`)
- Shaped ellipsoid for pelvic region
- Accent bib/shorts band

### Arms
- Upper arm: tapered capsule with muscle belly (proximal wider, distal narrower)
- Forearm: tapered capsule
- Hand: palm ellipsoid + 4 finger capsules + thumb

### Legs
- Thigh: tapered capsule with quadricep shape
- Shin: tapered capsule
- Foot: shoe shape with sole, toe box bulge, and heel

## Quality Gating

`QualityConfig` gains `avatarDetail: "low" | "high"`:

| Tier   | avatarDetail | Body Segments |
| ------ | ------------ | ------------- |
| Low    | "low"        | 8             |
| Medium | "low"        | 8             |
| High   | "high"       | 12            |
| Ultra  | "high"       | 12            |

Higher segment counts produce smoother curves on tapered limbs, rounder
shoulder caps, and more defined head features. The geometry structure is
identical — only the tessellation resolution changes.

## Shared Materials

| Part       | Color    | Roughness |
| ---------- | -------- | --------- |
| Skin       | 0xd8b48a | 0.7       |
| Kit dark   | 0x2a2f36 | 0.8       |
| Shoe       | 0x1a1c1e | 0.6       |
| Hair       | 0x241c18 | 0.8       |

Accent materials (per-lane color) are applied to jersey stripes, bibs,
equipment, and oar/ski/bike parts via `userData.accent = true`.

## Sport-Specific Construction

### Rower
- Body: hips + torso + head + tapered arms with hands + tapered legs with feet
- Equipment: hull, deck, stripe, foot plate, oars (unchanged)
- Arms pivot at shoulders for oar reach animation

### Skier
- Body: hips + torso + head + tapered arms with hands + planted legs with feet
- Equipment: skis, poles with baskets (unchanged)
- Upper body pivots from hips for double-pole crunch

### Cyclist
- Body: aero-tuck torso + head with helmet + tapered arms + pedaling thighs
- Equipment: wheels, frame, cranks, pedals (unchanged)
- Thighs animate with crank rotation

## Files Changed

| File                           | Change                                       |
| ------------------------------ | -------------------------------------------- |
| `src/lib/replay/renderer3d.ts` | New body helpers, rebuilt 3 avatar functions |
| `src/lib/replay/renderer3d.test.ts` | Updated tests for new avatar paths     |
