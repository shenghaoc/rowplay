# Implementation Plan: 3D Replay View

- [ ] 1. Extract the `ReplayRenderer` interface
  - Add `ReplayRenderer` interface (`render` / `resize` / `destroy`) to `src/lib/replay/renderer.ts`
  - Mark `CourseRenderer implements ReplayRenderer`; add a no-op `destroy()`
  - _Requirements: 1.6, 4.5, 5.4_

- [ ] 2. Renderer preference helper
  - Create `src/lib/replay/replayRenderer.ts` with `RendererKind`, `loadRendererPref()` (default `'2d'`), `saveRendererPref()`
  - Add `src/lib/replay/replayRenderer.test.ts` (default + round-trip)
  - _Requirements: 6.1, 6.3_

- [ ] 3. WebGL probe and lazy loader
  - Create `src/lib/replay/renderer3dLoader.ts` with SSR-safe `webglSupported()` and cached `loadRenderer3D()`
  - Add `src/lib/replay/renderer3dLoader.test.ts` (probe false without context; loader caches)
  - _Requirements: 2.1, 2.5, 3.1, 7.2, 7.4_

- [ ] 4. Add Three.js dependency (lazy-only)
  - Add `three` (and `@types/three` dev) to `package.json`
  - Confirm `three` is imported only inside the future `renderer3d.ts` (no static imports elsewhere)
  - _Requirements: 2.1, 2.2_

- [ ] 5. `CourseRenderer3D` scene and rendering
  - Create `src/lib/replay/renderer3d.ts` (sole module importing `three`); `implements ReplayRenderer`
  - Build course geometry once; live + optional ghost avatars; finish marker; chase camera
  - Map `RenderState` → positions; pace/ghost labels as sprites updated only on text change
  - Read shared `COLORS_*` palette; recolour on theme; one draw per `render()` (no idle loop)
  - _Requirements: 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3_

- [ ] 6. Reduced-motion, dpr cap, and disposal in `CourseRenderer3D`
  - Suppress decorative water/wake under `prefers-reduced-motion` (reuse `renderer.ts` matchMedia pattern); keep data-driven avatar motion
  - Cap dpr at `min(devicePixelRatio, 2)` in `resize`; honour ghost-active heights
  - Dispose geometries/materials/textures and the WebGL context in `destroy()`
  - _Requirements: 3.3, 3.4, 5.2, 5.4, 5.5_

- [ ] 7. Replay page wiring and renderer swap
  - Change `renderer` type to `ReplayRenderer`; add `$state` for kind, `loading3d`, `webglOk`, cached ctor
  - Add `setRenderer(kind)`: destroy current, build 2D synchronously or lazy-load + build 3D; on failure revert to 2D
  - Preserve time/playing/speed across swaps; construct active kind in the workout-change `$effect`
  - On mount apply persisted preference subject to WebGL/reduced-motion fallbacks
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.3, 2.4, 3.2, 3.6, 6.2, 6.4_

- [ ] 8. Renderer toggle UI
  - Add a 2D/3D segmented control near the canvas; `aria-pressed`, keyboard operable
  - Disable 3D with tooltip when `!webglOk`; show spinner while `loading3d`
  - _Requirements: 1.2, 2.3, 3.2, 3.5_

- [ ] 9. Internationalization
  - Add `replay.view2d`, `replay.view3d`, `replay.view3dUnsupported`, `replay.view3dLoading`, `replay.view3dError` to all locale files (`en`, `zh`, `de`, `es`, `fr`, `ja`)
  - Run `npm run validate:locales`
  - _Requirements: 8.1, 8.2, 8.4_

- [ ] 10. End-to-end coverage
  - Keep existing replay e2e on 2D (unchanged); add a spec toggling to 3D (canvas present, toggle state) with no pixel assertions
  - Where WebKit lacks WebGL, assert the 3D option is disabled (fallback path)
  - _Requirements: 7.1, 7.3, 7.4_

- [ ] 11. Verification
  - Run `npm run check` → 0 errors, `npm run build` → succeeds, `npm run test` → green
  - Verify in demo mode: `/replay/1001` toggle 2D↔3D, play, ghost lane, theme switch
  - Confirm `three` is absent from the initial replay/dashboard bundles (lazy chunk only)
  - Update PR test plan checklist
  - _Requirements: all_
