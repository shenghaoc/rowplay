# Implementation Tasks: GLTF Avatar Upgrade

Spec: `.kiro/specs/gltf-avatar-upgrade/`
Requirements: Req 1-6
Follow-up to: `.kiro/specs/webgpu-first-replay-graphics-upgrade/` (PR #122)

## Tasks

- [ ] **1. Model cache** - `src/lib/replay/modelCache.ts`
  - Create `ModelCache` class with `load(url): Promise<GLTF>` and `clone(url): Group`
  - Use Three.js `GLTFLoader` for loading
  - Cache loaded GLTF by URL, clone scene for each avatar instance
  - SSR-safe: no-op or reject when `window` is absent

- [ ] **2. Model cache tests** - `src/lib/replay/modelCache.test.ts`
  - Load returns cached result on second call
  - Clone returns independent scene instances
  - Error handling for missing/corrupt models
  - SSR-safe behavior

- [ ] **3. Bone mapper** - `src/lib/replay/boneMapper.ts`
  - Create `BoneMapper` class that traverses a GLTF scene and caches bone refs
  - Implement `applyPose(targets: BoneTargets)` method
  - Two-bone IK solver for arm and leg chains
  - Spine rotation distributed across spine bones
  - Head look-at from torso direction

- [ ] **4. Bone mapper tests** - `src/lib/replay/boneMapper.test.ts`
  - Two-bone IK produces valid rotations for known input positions
  - Spine distributes rotation across bones
  - Head look-at faces correct direction
  - Graceful handling of missing bones

- [ ] **5. Mixamo model acquisition and conversion**
  - Download rigged humanoid from Mixamo (standard character, T-pose or A-pose)
  - Convert FBX to GLB using Blender or fbx2gltf
  - Strip Mixamo keyframe animations
  - Create low-poly variant (decimate in Blender)
  - Place in `static/models/athlete.glb` and `static/models/athlete-low.glb`

- [ ] **6. Refactor rower avatar** - `src/lib/replay/renderer3d.ts:368-571`
  - Replace procedural body construction with GLTF model loading via ModelCache
  - Keep procedural hull, deck, foot plate, oars, blades
  - Wire BoneMapper to existing IK target positions in `placeArms` and `placeLegs`
  - Preserve `animate()` function interface and StrokePose consumption

- [ ] **7. Refactor skier avatar** - `src/lib/replay/renderer3d.ts:578-717`
  - Same pattern as rower: GLTF body + procedural skis, poles, boots
  - Wire BoneMapper to skier IK targets

- [ ] **8. Refactor cyclist avatar** - `src/lib/replay/renderer3d.ts:724-894`
  - Same pattern: GLTF body + procedural bike frame, wheels, cranks
  - Wire BoneMapper to cyclist IK targets (pedal circles, aero tuck)

- [ ] **9. Quality config update** - `src/lib/replay/renderer3d.ts`
  - Add `avatarModel: "low" | "high"` to `QualityConfig`
  - Set `low`/`medium` → `"low"`, `high`/`ultra` → `"high"`
  - Use `avatarModel` to select which GLB to load in `SportProfile.make()`

- [ ] **10. Shadow and accent wiring**
  - Ensure `finalizeAvatar` casts shadows on GLTF meshes
  - Apply accent color to clothing materials via material override
  - Preserve ghost lane translucency path

- [ ] **11. Update 3D renderer tests** - `src/lib/replay/renderer3d.test.ts`
  - Avatar construction with GLTF model
  - Quality-gated model selection
  - Shadow casting on GLTF meshes
  - No-throw and governor coverage

- [ ] **12. Documentation and steering**
  - Update `.kiro/steering/structure.md` with new files
  - Update `docs/usage.md` if avatar visuals are mentioned
  - Update locale files if avatar-related strings exist

- [ ] **13. Verification**
  - `vp check` - format, lint, typecheck, test, build
  - Manual visual QA: `/replay/1001`, `/replay/1003`, `/replay/1004` in 3D
  - Verify all 3 sports at Low, Medium, High, Ultra quality
  - Verify ghost lane translucency
  - Verify reduced motion suppression
  - Verify mobile viewport
