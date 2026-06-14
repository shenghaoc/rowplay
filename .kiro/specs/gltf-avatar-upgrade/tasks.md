# Implementation Tasks: 3D Avatar Geometry Upgrade

Spec: `.kiro/specs/gltf-avatar-upgrade/`
Requirements: Req 1-6

## Tasks

- [x] **1. Body geometry helpers** - `src/lib/replay/renderer3d.ts`
  - `taperedCapsule()` — lathe-based muscle-shaped limbs
  - `makeHand()` — palm + 4 fingers + thumb
  - `makeFoot()` — sole + toe box + heel
  - `makeTorso()` — shaped chest + shoulder caps + back + neck + accent stripe
  - `makeHead()` — cranium + jaw + ears + hair cap
  - `makeHips()` — pelvic shape + accent bib

- [x] **2. Refactor rower avatar** - `src/lib/replay/renderer3d.ts`
  - Replace box/sphere body with upgraded helpers
  - Keep procedural hull, deck, oars unchanged
  - Accept `detail` parameter for quality gating

- [x] **3. Refactor skier avatar** - `src/lib/replay/renderer3d.ts`
  - Tapered legs with feet planted on skis
  - Upgraded upper body with torso, head, arms with hands
  - Keep procedural skis, poles unchanged

- [x] **4. Refactor cyclist avatar** - `src/lib/replay/renderer3d.ts`
  - Aero-tuck torso with shoulder caps
  - Head with helmet accent
  - Tapered arms and pedaling thighs
  - Keep procedural bike frame, wheels, cranks unchanged

- [x] **5. Quality-gated avatar detail** - `src/lib/replay/renderer3d.ts`
  - `avatarDetail: "low" | "high"` in QualityConfig
  - Low/Medium → 8 segments, High/Ultra → 12 segments

- [x] **6. Verification**
  - `vp run typecheck` — 0 errors
  - `vp test` — 1078 tests pass
  - Visual QA in browser at all quality tiers
