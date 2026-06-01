# Implementation Plan: 3D Replay View

Spec: `.kiro/specs/3d-replay-view/`  
Requirements: Req 1–8

- [x] **1. Extract the `ReplayRenderer` interface**
- [x] **2. Renderer preference helper** (+ test)
- [x] **3. WebGL probe and lazy loader** (+ test; cache cleared on import failure)
- [x] **4. Add Three.js dependency** (lazy-only in `renderer3d.ts`)
- [x] **5. `CourseRenderer3D` scene and rendering**
- [x] **6. Reduced-motion, dpr cap, and disposal**
- [x] **7. Replay page wiring** (`setRenderer`, race guard after await, `safeRender` try/catch, workout `$effect` calls `setRenderer(rendererKind)`)
- [x] **8. Renderer toggle UI**
- [x] **9. Internationalization** (all 6 locales)
- [x] **10. E2E coverage** (`tests/e2e/replay-3d.spec.ts`)
- [x] **11. Verification** (`check`, `test`, `build`, `validate:locales`)
