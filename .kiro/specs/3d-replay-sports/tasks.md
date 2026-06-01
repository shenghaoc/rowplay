# Implementation Plan: Sport-Aware 3D Replay

Spec: `.kiro/specs/3d-replay-sports/`  
Requirements: Req 1–3  
Follow-up to: `.kiro/specs/3d-replay-view/` (PR #48)

- [x] **1. `Avatar` + `SportProfile` abstractions** in `renderer3d.ts`
- [x] **2. Refactor the rowing scull** into `makeRowerAvatar` (behaviour-preserving)
- [x] **3. SkiErg avatar** — skier on skis, double-poling (`makeSkierAvatar`)
- [x] **4. BikeErg avatar** — cyclist with rolling wheels + pedalling (`makeBikeAvatar`)
- [x] **5. `SPORT_PROFILES`** — ground colour/opacity, waves, roll, bob, cadence, trail
- [x] **6. Generalise the scene** — `water` → `ground` mesh; wave/wake/cadence gated by profile; per-sport theme recolour
- [x] **7. Replay page wiring** — pass `detail.sport` to `CourseRenderer3D`
- [x] **8. E2E coverage** — SkiErg + BikeErg 3D-toggle cases
- [x] **9. Verification** — `check`, `test`, `build` all green; `three` stays lazy
