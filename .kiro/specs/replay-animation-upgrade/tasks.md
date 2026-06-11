# Implementation Tasks: Replay Animation Upgrade

Spec: `.kiro/specs/replay-animation-upgrade/`
Requirements: Req 1–6
Follow-up to: `.kiro/specs/2d-replay-upgrade/` (PR #50),
`.kiro/specs/3d-replay-sports/` (PR #48)

## Tasks

- [x] **1. Shared motion module** — `src/lib/replay/motion.ts`
  - `clampDt`, `dampFactor`, `warpStrokePhase`, `strokeSurge`, `catchEvents`
  - `METERS_PER_CYCLE` per sport
  - `ParticlePool` (SoA, swap-remove, gravity)
  - `PerfGovernor` (calibration, grace, sticky levels)

- [x] **2. Motion unit tests** — `src/lib/replay/motion.test.ts`
  - All pure helpers, ParticlePool lifecycle, PerfGovernor degradation/calibration

- [x] **3. 2D renderer — stroke-synced animation** (`renderer.ts`)
  - Hull surge via `strokeSurge`
  - Splash particles via `ParticlePool` at catch events
  - Three parallax ripple layers
  - Layered strokes replacing `shadowBlur` glows

- [x] **4. 3D renderer — arms and mechanics** (`renderer3d.ts`)
  - Rower arms with sweeping oars, blades bury at waterline
  - Skier arms with double-pole plant-and-pull
  - Corrected pre-existing oar/pole direction bugs

- [x] **5. 3D renderer — water and wake effects**
  - Three interfering wave trains with sun glint
  - Dispersing V-wake with seek/backward guards
  - Instanced catch spray (one draw call)
  - Instanced buoy lines (one draw call)

- [x] **6. 3D renderer — chase camera**
  - Frame-rate-independent damping via `dampFactor`
  - Three-quarter framing, speed-aware FOV
  - Camera pop at pause eliminated

- [x] **7. Performance governor integration**
  - `PerfGovernor` in 3D renderer watching frame deltas
  - Degradation ladder: pixel ratio → water displacement → spray
  - Calibration against device refresh interval

- [x] **8. Reduced motion audit**
  - All decorative effects suppressed under `prefers-reduced-motion`
  - Scene stays legible with static elements

- [x] **9. Documentation and locales**
  - `docs/usage.md` replay section updated
  - In-app guide updated in all 6 locales (en, zh, de, es, fr, ja)

- [x] **10. Verification**
  - `npm run check` — 0 errors
  - `npm run test` — green (motion + renderer tests)
  - `npm run build` — succeeds
  - Manual demo: all 3 sports, 2D + 3D, light + dark, reduced motion
