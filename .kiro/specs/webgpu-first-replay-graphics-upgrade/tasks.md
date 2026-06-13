# Implementation Tasks: WebGPU-First Replay Graphics Upgrade

Spec: `.kiro/specs/webgpu-first-replay-graphics-upgrade/`
Requirements: Req 1-6
Follow-up to: `.kiro/specs/replay-animation-upgrade/` (PR #114)

## Tasks

- [x] **1. Concept2 stroke model** - `src/lib/replay/strokeModel.ts`
  - Build `StrokePose` from Concept2 stroke rows using `t`, `d`, `pace`, `spm`,
    `hr`, and `watts`
  - Normalize irregular intervals and interval resets into a monotonic replay
    timeline
  - Infer drive/recovery timing, catch/finish accents, amplitude, intensity, and
    fatigue without claiming force-curve or handle-position reconstruction
  - Keep synthetic split fallback for workouts without stroke rows

- [x] **2. Stroke model tests** - `src/lib/replay/strokeModel.test.ts`
  - Irregular stroke intervals
  - Interval resets
  - Synthetic split fallback
  - High/low-rate pose envelopes
  - Exact catch transition detection

- [x] **3. Renderer state wiring**
  - Add `strokePose?: StrokePose` and `ghostStrokePose?: StrokePose` to
    `RenderState`
  - Build live and ghost stroke timelines in `src/routes/replay/[id]/+page.svelte`
  - Pass sampled poses into the active renderer on every frame

- [x] **4. 2D renderer pose consumption** - `src/lib/replay/renderer.ts`
  - Use recorded stroke pose for avatar phase and surge when available
  - Trigger splash from stroke-index catch transitions instead of generic phase
    wrap
  - Preserve reduced-motion behavior and existing fallback animation

- [x] **5. 3D renderer pose consumption** - `src/lib/replay/renderer3d.ts`
  - Use live and ghost `StrokePose` values for row, ski, and bike avatar
    mechanics
  - Align catch spray, blade puddles, pole plants, and pedal accents to recorded
    stroke boundaries
  - Preserve governor coverage and reduced-motion suppression

- [x] **6. WebGPU-first 3D factory** - `src/lib/replay/renderer3dLoader.ts`
  - Detect WebGPU at runtime and remain SSR-safe
  - Lazy-load the `three/webgpu` chunk only for WebGPU attempts
  - Await WebGPU renderer initialization
  - Fall back to the existing WebGL renderer on unsupported browsers or init
    failure

- [x] **7. WebGPU renderer entry** - `src/lib/replay/renderer3dWebGPU.ts`
  - Keep the WebGPU import boundary small
  - Reuse `CourseRenderer3D` scene graph, environments, camera, and governor
  - Surface backend diagnostics to the replay page

- [x] **8. Ultra quality tier and stage upgrade**
  - Add `ultra` to replay quality persistence and controls
  - Use higher DPR, shadows, denser geometry, wake samples, buoys, and spray on
    WebGPU-capable devices
  - Add richer sport-specific course surfaces: RowErg water lanes, SkiErg
    groomed snow, and BikeErg velodrome/asphalt markings
  - Demote `ultra` to `high` on WebGL fallback
  - Increase the 3D replay stage height, including ghost replay layouts
  - Replace toy-like 3D marker bodies with segmented human-scale athletes and a
    closer chase camera for legible posture

- [x] **9. Documentation, locales, and steering**
  - Update `README.md`
  - Update `docs/usage.md`
  - Update replay guide text in all locale dictionaries
  - Update `.kiro/steering/structure.md`
  - Add this spec to `AGENTS.md`

- [x] **10. Test coverage**
  - `strokeModel.test.ts`
  - 2D renderer tests consuming `StrokePose`
  - 3D renderer tests consuming `StrokePose`
  - Replay quality persistence tests for `ultra`
  - WebGPU loader/factory tests for success, init failure, WebGL fallback, and
    SSR-safe false

- [x] **11. Verification**
  - `pnpm run check` - passed
  - `git diff --check` - passed
  - Chrome DOM QA on `pnpm preview:wrangler`: `/replay/1001`, `/replay/1003`,
    `/replay/1004`, all toggled to 3D with WebGPU backend when available
  - Headless Chromium pixel QA: 2D nonblank, 3D nonblank, forced WebGL fallback,
    mobile viewport, dark theme, and reduced motion
