# GLTF Avatar Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural ball-and-stick 3D avatar with rigged GLTF humanoid models driven by the existing IK animation system.

**Architecture:** A model cache loads and clones GLTF models (Mixamo-sourced). A bone mapper converts IK target positions (shoulder, elbow, hand, hip, knee, foot) into skeleton bone rotations via two-bone IK. Sport-specific equipment (boat, skis, bike) remains procedural.

**Tech Stack:** Three.js GLTFLoader, Two-bone IK, Mixamo GLB models, existing `SportProfile.make()` interface

---

## File Structure

| New File | Responsibility |
|---|---|
| `src/lib/replay/modelCache.ts` | GLTF loading, caching by URL, scene cloning |
| `src/lib/replay/modelCache.test.ts` | Cache hit/miss, clone independence, error handling |
| `src/lib/replay/boneMapper.ts` | Skeleton traversal, two-bone IK, spine/head rotation |
| `src/lib/replay/boneMapper.test.ts` | IK solver correctness, bone mapping |
| `static/models/athlete.glb` | Full-detail rigged humanoid (Mixamo) |
| `static/models/athlete-low.glb` | Low-poly rigged humanoid |

| Modified File | Change |
|---|---|
| `src/lib/replay/renderer3d.ts` | `makeRowerAvatar`, `makeSkierAvatar`, `makeBikeAvatar` use GLTF + BoneMapper; `QualityConfig` gains `avatarModel` |
| `src/lib/replay/renderer3d.test.ts` | Updated tests for GLTF avatar path |
| `.kiro/steering/structure.md` | New file inventory |

---

### Task 1: Model Cache

**Files:**
- Create: `src/lib/replay/modelCache.ts`
- Test: `src/lib/replay/modelCache.test.ts`

- [ ] **Step 1: Create modelCache.ts with ModelCache class**

```ts
// src/lib/replay/modelCache.ts
import type { Group, Scene } from "three";

/**
 * Minimal GLTF result — only the parts we need (scene graph).
 */
interface GLTFResult {
  scene: Group;
}

type LoaderFactory = () => {
  loadAsync(url: string): Promise<GLTFResult>;
};

/** In-memory GLTF cache keyed by URL. */
export class ModelCache {
  private cache = new Map<string, GLTFResult>();
  private loading = new Map<string, Promise<GLTFResult>>();
  private createLoader: LoaderFactory;

  constructor(createLoader: LoaderFactory) {
    this.createLoader = createLoader;
  }

  /** Load a GLTF model. Returns cached result if already loaded. */
  async load(url: string): Promise<GLTFResult> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const pending = this.loading.get(url);
    if (pending) return pending;

    const promise = this.createLoader()
      .loadAsync(url)
      .then((result) => {
        this.cache.set(url, result);
        this.loading.delete(url);
        return result;
      })
      .catch((err) => {
        this.loading.delete(url);
        throw err;
      });

    this.loading.set(url, promise);
    return promise;
  }

  /** Clone the scene from a loaded model for independent avatar instances. */
  cloneScene(url: string): Group | null {
    const cached = this.cache.get(url);
    if (!cached) return null;
    return cached.scene.clone(true);
  }

  /** Check if a model is loaded (for testing). */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /** Clear the cache (for testing). */
  clear(): void {
    this.cache.clear();
    this.loading.clear();
  }
}
```

- [ ] **Step 2: Write modelCache.test.ts**

```ts
// src/lib/replay/modelCache.test.ts
import { describe, it, expect, vi } from "vitest";
import { ModelCache } from "./modelCache";
import * as THREE from "three";

function makeMockLoader() {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry()));
  return () => ({
    loadAsync: vi.fn().mockResolvedValue({ scene }),
  });
}

describe("ModelCache", () => {
  it("loads and caches a model", async () => {
    const factory = makeMockLoader();
    const cache = new ModelCache(factory);
    const r1 = await cache.load("model.glb");
    const r2 = await cache.load("model.glb");
    expect(r1).toBe(r2);
    expect(factory().loadAsync).toHaveBeenCalledTimes(1);
  });

  it("cloneScene returns an independent group", async () => {
    const factory = makeMockLoader();
    const cache = new ModelCache(factory);
    await cache.load("model.glb");
    const c1 = cache.cloneScene("model.glb");
    const c2 = cache.cloneScene("model.glb");
    expect(c1).not.toBe(c2);
    expect(c1).toBeInstanceOf(THREE.Group);
  });

  it("cloneScene returns null for unloaded model", () => {
    const cache = new ModelCache(makeMockLoader());
    expect(cache.cloneScene("missing.glb")).toBeNull();
  });

  it("propagates load errors", async () => {
    const cache = new ModelCache(() => ({
      loadAsync: vi.fn().mockRejectedValue(new Error("404")),
    }));
    await expect(cache.load("bad.glb")).rejects.toThrow("404");
    // Should allow retry after failure
    expect(cache.has("bad.glb")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `vp test -- --run src/lib/replay/modelCache.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/replay/modelCache.ts src/lib/replay/modelCache.test.ts
git commit -m "feat(replay): add GLTF model cache for avatar loading"
```

---

### Task 2: Bone Mapper — Two-Bone IK Solver

**Files:**
- Create: `src/lib/replay/boneMapper.ts`
- Test: `src/lib/replay/boneMapper.test.ts`

- [ ] **Step 1: Create boneMapper.ts with two-bone IK solver**

```ts
// src/lib/replay/boneMapper.ts
import * as THREE from "three";

type Point3 = readonly [number, number, number];

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Solve two-bone IK: given a root joint, a mid joint hint, and an end
 * effector target, compute rotations for the upper and lower bones.
 *
 * @param root      Position of the root joint (e.g., shoulder/hip)
 * @param midHint   Position hint for the mid joint (e.g., elbow/knee)
 * @param target    Target position for the end effector (e.g., hand/foot)
 * @param upperLen  Length of the upper bone (root → mid)
 * @param lowerLen  Length of the lower bone (mid → end)
 * @returns         [upperRotation, lowerRotation] as Euler angles in local space
 */
export function solveTwoBoneIK(
  root: Point3,
  midHint: Point3,
  target: Point3,
  upperLen: number,
  lowerLen: number,
): { midPos: THREE.Vector3; upperQuat: THREE.Quaternion; lowerQuat: THREE.Quaternion } {
  const rootV = _vA.set(root[0], root[1], root[2]);
  const targetV = _vB.set(target[0], target[1], target[2]);
  const hintV = _vC.set(midHint[0], midHint[1], midHint[2]);

  const rootToTarget = targetV.clone().sub(rootV);
  const dist = rootToTarget.length();

  // Clamp: if target is beyond reach, stretch fully
  const maxReach = upperLen + lowerLen - 0.001;
  if (dist > maxReach) {
    rootToTarget.normalize().multiplyScalar(maxReach);
    targetV.copy(rootV).add(rootToTarget);
  }

  // Law of cosines: angle at root for the upper bone
  const a = upperLen;
  const b = lowerLen;
  const c = rootToTarget.length();
  const cosAngleAtRoot = (a * a + c * c - b * b) / (2 * a * c);
  const angleAtRoot = Math.acos(Math.max(-1, Math.min(1, cosAngleAtRoot)));

  // Direction from root to target
  const dir = _dir.copy(rootToTarget).normalize();

  // Compute the plane of the IK chain using the mid hint
  const rootToHint = hintV.clone().sub(rootV);
  const planeNormal = new THREE.Vector3().crossVectors(dir, rootToHint);
  if (planeNormal.lengthSq() < 0.0001) {
    // Hint is collinear with root→target; use a fallback up vector
    planeNormal.crossVectors(dir, _up);
    if (planeNormal.lengthSq() < 0.0001) {
      planeNormal.crossVectors(dir, new THREE.Vector3(1, 0, 0));
    }
  }
  planeNormal.normalize();

  // Rotate the direction by angleAtRoot around the plane normal to get
  // the upper bone direction
  const upperDir = dir.clone().applyAxisAngle(planeNormal, -angleAtRoot).normalize();

  // Mid joint position
  const midPos = rootV.clone().add(upperDir.multiplyScalar(upperLen));

  // Lower bone direction: mid → target
  const lowerDir = targetV.clone().sub(midPos).normalize();

  // Compute quaternions: rotate from default forward (+Z) to bone direction
  const defaultDir = new THREE.Vector3(0, 1, 0); // bones point up by default in Mixamo
  const upperQuat = _qA.setFromUnitVectors(defaultDir, upperDir);
  const lowerQuat = _qB.setFromUnitVectors(defaultDir, lowerDir);

  return {
    midPos,
    upperQuat: upperQuat.clone(),
    lowerQuat: lowerQuat.clone(),
  };
}

/**
 * Compute a look-at quaternion for a bone that should face a target direction.
 * Assumes the bone's default forward is +Z.
 */
export function lookAtRotation(
  from: Point3,
  to: Point3,
  up: Point3 = [0, 1, 0],
): THREE.Quaternion {
  const pos = _vA.set(from[0], from[1], from[2]);
  const tgt = _vB.set(to[0], to[1], to[2]);
  const upV = _vC.set(up[0], up[1], up[2]);
  const mat = new THREE.Matrix4().lookAt(pos, tgt, upV);
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}

/**
 * Map from standard bone names (without mixamorig prefix) to traversal lookup.
 */
export function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  // Try with and without mixamorig prefix
  const prefixed = `mixamorig:${name}`;
  let found: THREE.Bone | null = null;
  root.traverse((obj) => {
    if (found) return;
    if (obj instanceof THREE.Bone && (obj.name === name || obj.name === prefixed)) {
      found = obj;
    }
  });
  return found;
}

/**
 * Per-frame bone targets extracted from the existing IK system.
 */
export interface BoneTargets {
  /** Hip/root position */
  hip: Point3;
  /** Torso layback angle (radians, 0 = upright) */
  torsoLayback: number;
  /** Per-side arm targets */
  arms: {
    side: number;
    shoulder: Point3;
    elbow: Point3;
    hand: Point3;
  }[];
  /** Per-side leg targets */
  legs: {
    side: number;
    hip: Point3;
    knee: Point3;
    foot: Point3;
  }[];
  /** Head look-at direction (optional) */
  headTarget?: Point3;
}

/**
 * Drives a GLTF skeleton from IK target positions each frame.
 */
export class BoneMapper {
  private bones = new Map<string, THREE.Bone>();

  constructor(root: THREE.Object3D) {
    // Cache standard Mixamo bone names
    const names = [
      "Hips", "Spine", "Spine1", "Spine2",
      "LeftArm", "LeftForeArm", "LeftHand",
      "RightArm", "RightForeArm", "RightHand",
      "LeftUpLeg", "LeftLeg", "LeftFoot",
      "RightUpLeg", "RightLeg", "RightFoot",
      "Neck", "Head",
    ];
    for (const name of names) {
      const bone = findBone(root, name);
      if (bone) this.bones.set(name, bone);
    }
  }

  /** Get a cached bone by name (for testing). */
  getBone(name: string): THREE.Bone | null {
    return this.bones.get(name) ?? null;
  }

  /** Apply IK targets to the skeleton bones. */
  applyPose(targets: BoneTargets): void {
    // Hips: direct position
    const hips = this.bones.get("Hips");
    if (hips) {
      hips.position.set(targets.hip[0], targets.hip[1], targets.hip[2]);
    }

    // Spine: distribute layback across spine bones
    const spine = this.bones.get("Spine");
    const spine1 = this.bones.get("Spine1");
    if (spine) spine.rotation.x = targets.torsoLayback * 0.5;
    if (spine1) spine1.rotation.x = targets.torsoLayback * 0.5;

    // Arms: two-bone IK per side
    for (const arm of targets.arms) {
      const prefix = arm.side < 0 ? "Left" : "Right";
      const upperBone = this.bones.get(`${prefix}Arm`);
      const lowerBone = this.bones.get(`${prefix}ForeArm`);
      if (!upperBone || !lowerBone) continue;

      const result = solveTwoBoneIK(
        arm.shoulder,
        arm.elbow,
        arm.hand,
        0.28, // approximate upper arm length
        0.26, // approximate forearm length
      );
      upperBone.quaternion.copy(result.upperQuat);
      lowerBone.quaternion.copy(result.lowerQuat);
    }

    // Legs: two-bone IK per side
    for (const leg of targets.legs) {
      const prefix = leg.side < 0 ? "Left" : "Right";
      const upperBone = this.bones.get(`${prefix}UpLeg`);
      const lowerBone = this.bones.get(`${prefix}Leg`);
      if (!upperBone || !lowerBone) continue;

      const result = solveTwoBoneIK(
        leg.hip,
        leg.knee,
        leg.foot,
        0.40, // approximate thigh length
        0.38, // approximate shin length
      );
      upperBone.quaternion.copy(result.upperQuat);
      lowerBone.quaternion.copy(result.lowerQuat);
    }

    // Head: look-at
    if (targets.headTarget) {
      const head = this.bones.get("Head");
      if (head) {
        const headPos: Point3 = [head.position.x, head.position.y, head.position.z];
        head.quaternion.copy(lookAtRotation(headPos, targets.headTarget));
      }
    }
  }
}
```

- [ ] **Step 2: Write boneMapper.test.ts**

```ts
// src/lib/replay/boneMapper.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { solveTwoBoneIK, lookAtRotation, BoneMapper, findBone } from "./boneMapper";

describe("solveTwoBoneIK", () => {
  it("produces a valid mid joint position for a straight reach", () => {
    const result = solveTwoBoneIK(
      [0, 0, 0],   // root
      [0, -0.3, 0], // mid hint (hanging down)
      [0, -0.5, 0], // target straight down
      0.28,          // upper len
      0.26,          // lower len
    );
    // Mid position should be between root and target
    expect(result.midPos.y).toBeLessThan(0);
    expect(result.midPos.y).toBeGreaterThan(-0.5);
    // Quaternions should be valid (not NaN)
    expect(result.upperQuat.length()).toBeCloseTo(1, 3);
    expect(result.lowerQuat.length()).toBeCloseTo(1, 3);
  });

  it("clamps when target is beyond reach", () => {
    const result = solveTwoBoneIK(
      [0, 0, 0],
      [0, -0.3, 0],
      [0, -2, 0],  // way beyond reach
      0.28,
      0.26,
    );
    // Should not produce NaN
    expect(result.midPos.length()).toBeFinite();
    expect(result.upperQuat.length()).toBeCloseTo(1, 3);
  });

  it("handles collinear root-target-hint", () => {
    const result = solveTwoBoneIK(
      [0, 0, 0],
      [0, -0.3, 0],
      [0, -0.5, 0],
      0.28,
      0.26,
    );
    expect(result.midPos.length()).toBeFinite();
  });
});

describe("lookAtRotation", () => {
  it("produces a valid quaternion", () => {
    const q = lookAtRotation([0, 0, 0], [0, 0, 1]);
    expect(q.length()).toBeCloseTo(1, 3);
  });
});

describe("BoneMapper", () => {
  function makeFakeSkeleton(): THREE.Object3D {
    const root = new THREE.Group();
    const bones = [
      "Hips", "Spine", "Spine1", "Spine2",
      "LeftArm", "LeftForeArm", "LeftHand",
      "RightArm", "RightForeArm", "RightHand",
      "LeftUpLeg", "LeftLeg", "LeftFoot",
      "RightUpLeg", "RightLeg", "RightFoot",
      "Neck", "Head",
    ];
    for (const name of bones) {
      const bone = new THREE.Bone();
      bone.name = `mixamorig:${name}`;
      root.add(bone);
    }
    return root;
  }

  it("finds bones by name", () => {
    const root = makeFakeSkeleton();
    const mapper = new BoneMapper(root);
    expect(mapper.getBone("Hips")).toBeInstanceOf(THREE.Bone);
    expect(mapper.getBone("LeftArm")).toBeInstanceOf(THREE.Bone);
    expect(mapper.getBone("Nonexistent")).toBeNull();
  });

  it("applyPose does not throw", () => {
    const root = makeFakeSkeleton();
    const mapper = new BoneMapper(root);
    expect(() => {
      mapper.applyPose({
        hip: [0, 0.9, 0],
        torsoLayback: -0.2,
        arms: [
          { side: -1, shoulder: [-0.26, 0.8, 0.02], elbow: [-0.24, 0.6, 0.06], hand: [-0.18, 0.72, 0.58] },
          { side: 1, shoulder: [0.26, 0.8, 0.02], elbow: [0.24, 0.6, 0.06], hand: [0.18, 0.72, 0.58] },
        ],
        legs: [
          { side: -1, hip: [-0.12, 0.38, -0.14], knee: [-0.14, 0.3, 0.1], foot: [-0.12, 0.28, 0.7] },
          { side: 1, hip: [0.12, 0.38, -0.14], knee: [0.14, 0.3, 0.1], foot: [0.12, 0.28, 0.7] },
        ],
      });
    }).not.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `vp test -- --run src/lib/replay/boneMapper.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/replay/boneMapper.ts src/lib/replay/boneMapper.test.ts
git commit -m "feat(replay): add bone mapper with two-bone IK for GLTF avatar"
```

---

### Task 3: Mixamo Model Acquisition

**Files:**
- Create: `static/models/athlete.glb`
- Create: `static/models/athlete-low.glb`

- [ ] **Step 1: Download a rigged humanoid from Mixamo**

Go to https://www.mixamo.com and download:
- Character: "Y Bot" (standard, clean topology)
- Pose: T-pose or A-pose (no animation)
- Format: FBX

- [ ] **Step 2: Convert FBX to GLB and strip animations**

Using Blender (or `npx fbx2gltf -i input.fbx -o athlete.glb`):
- Import the FBX
- Delete all keyframe animations (NLA strips / action editor)
- Export as GLB with these settings:
  - Format: glTF Binary (.glb)
  - Include: Selected Objects
  - Transform: +Y Up
  - Animation: unchecked

- [ ] **Step 3: Create low-poly variant**

In Blender:
- Select the mesh
- Add Decimate modifier, ratio 0.3–0.4
- Apply modifier
- Export as `athlete-low.glb`

- [ ] **Step 4: Place models in static directory**

```bash
cp athlete.glb static/models/athlete.glb
cp athlete-low.glb static/models/athlete-low.glb
```

- [ ] **Step 5: Verify models load in Three.js**

Quick sanity check: load each model in a test script and verify `scene` has bones.

- [ ] **Step 6: Commit**

```bash
git add static/models/athlete.glb static/models/athlete-low.glb
git commit -m "feat(replay): add Mixamo rigged humanoid GLB models"
```

---

### Task 4: Refactor Rower Avatar to Use GLTF

**Files:**
- Modify: `src/lib/replay/renderer3d.ts:368-571` (`makeRowerAvatar`)

- [ ] **Step 1: Update SportProfile.make signature to accept ModelCache**

Add `modelCache` and `avatarModel` parameters to `SportProfile.make()`:

```ts
// In SportProfile interface (line ~242):
make(accent: number, castShadow: boolean, opacity: number, modelUrl?: string): Avatar;
```

- [ ] **Step 2: Refactor makeRowerAvatar to use GLTF model**

Replace the body construction (lines 399-450) with:

```ts
async function makeRowerAvatar(
  accent: number,
  castShadow: boolean,
  opacity: number,
  modelCache?: ModelCache,
  modelUrl?: string,
): Promise<Avatar> {
  const group = new THREE.Group();
  const accentMat = () => accentMaterial(accent);

  // --- Procedural equipment (unchanged) ---
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 3.0, 4, 8), accentMat());
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(0.5, 0.42, 1);
  hull.position.y = 0.16;
  hull.userData.accent = true;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 2.6), accentMat());
  deck.position.y = 0.3;
  deck.userData.accent = true;
  group.add(deck);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.015, 2.2),
    humanMat(0xf8fafc, 0.4, 0.08),
  );
  stripe.name = "rower-deck-stripe";
  stripe.position.y = 0.335;
  group.add(stripe);

  const footPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.05, 0.12),
    humanMat(HUMAN_KIT_DARK),
  );
  footPlate.position.set(0, 0.34, 0.72);
  group.add(footPlate);

  // --- GLTF athlete model ---
  let boneMapper: BoneMapper | null = null;
  let athlete: THREE.Group | null = null;

  if (modelCache && modelUrl) {
    // Ensure model is loaded
    await modelCache.load(modelUrl);
    athlete = modelCache.cloneScene(modelUrl);
    if (athlete) {
      // Scale and position the model to fit the rower seated position
      athlete.scale.setScalar(1.0); // adjust after testing
      athlete.position.set(0, 0.3, -0.1);
      group.add(athlete);
      boneMapper = new BoneMapper(athlete);
    }
  }

  // Fallback: if no model loaded, use minimal placeholder
  if (!athlete) {
    const placeholder = ellipsoid([0.2, 0.5, 0.15], humanMat(HUMAN_KIT));
    placeholder.position.set(0, 0.6, 0);
    group.add(placeholder);
  }

  // --- Handle (unchanged) ---
  const handle = capsulePart(0.026, 0.44, humanMat(0x262c31), "x");
  handle.position.set(0, 0.72, 0.58);
  group.add(handle);

  // --- Oars (unchanged) ---
  const oars: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const oar = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xe7eef0, roughness: 0.6 }),
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = side * 1.2;
    oar.add(shaft);
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.015, 6, 10),
      humanMat(0x8a9097, 0.5),
    );
    collar.name = "rower-oar-collar";
    collar.position.set(side * 1.9, 0, 0);
    collar.rotation.y = Math.PI / 2;
    oar.add(collar);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.26), accentMat());
    blade.position.set(side * 2.4, -0.05, 0);
    blade.userData.accent = true;
    oar.add(blade);
    oar.position.y = 0.24;
    oar.userData.side = side;
    group.add(oar);
    oars.push(oar);
  }

  // --- Animation ---
  // Keep the same IK target computation, but route to BoneMapper when available
  const placeArms = (handleY: number, handleZ: number, amp: number): void => {
    handle.position.set(0, handleY, handleZ);
    if (boneMapper) {
      // Bone mapper drives the skeleton; IK targets computed below
    }
    // For now, keep the old mesh-based positioning as fallback
    // (will be removed once GLTF is fully wired)
  };

  const placeLegs = (drive: number, amp: number): void => {
    if (boneMapper) {
      // Bone mapper drives the skeleton
    }
  };

  const animate = (phase: number, reduce: boolean, pose?: StrokePose): void => {
    if (reduce) {
      if (boneMapper) {
        // Apply a neutral standing/seated pose
      }
      handle.rotation.x = 0;
      for (const oar of oars) oar.rotation.set(0, 0, 0);
      return;
    }
    const w = pose?.warpedPhase ?? warpStrokePhase(phase);
    const drive = Math.cos(w);
    const recovery = Math.max(0, -Math.sin(w));
    const amp = pose?.amplitude ?? 1;

    if (boneMapper) {
      // Compute IK targets and apply via bone mapper
      const handleY = 0.7 + recovery * 0.04;
      const handleZ = 0.58 - drive * 0.08 * amp;

      boneMapper.applyPose({
        hip: [0, 0.38, -0.1 - drive * 0.22 * amp],
        torsoLayback: -0.08 - drive * 0.2 * amp,
        arms: [-1, 1].map((side) => ({
          side,
          shoulder: [side * 0.26, 0.8, 0.02],
          elbow: [side * 0.24, (0.8 + handleY) / 2 - 0.08 * amp, (0.02 + handleZ) / 2 - 0.04],
          hand: [side * 0.18, handleY, handleZ],
        })),
        legs: [-1, 1].map((side) => {
          const footTarget: Point3 = [side * 0.12, 0.28 + drive * 0.02 * amp, 0.7 - drive * 0.04 * amp];
          const extension = -drive;
          return {
            side,
            hip: [side * 0.12, 0.38, -0.14],
            knee: [side * 0.14, (0.38 + footTarget[1]) / 2 + 0.08 + extension * 0.06, (-0.14 + footTarget[2]) / 2 - 0.06 * amp - drive * 0.08 * amp],
            foot: footTarget,
          };
        }),
      });
    }

    // Oar motion (unchanged — procedural equipment)
    handle.rotation.x = recovery * 0.16;
    for (const oar of oars) {
      const side = (oar.userData.side as number) ?? 1;
      oar.rotation.y = -side * drive * 0.5 * amp;
      oar.rotation.z = side * (recovery * 0.26 - 0.06);
    }
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}
```

- [ ] **Step 3: Update SPORT_PROFILES to pass model info**

In `SPORT_PROFILES` (line ~896), update the `make` function to accept model parameters. The page-level code that calls `profile.make()` will need to pass the model cache and URL from quality config.

- [ ] **Step 4: Run existing 3D renderer tests**

Run: `vp test -- --run src/lib/replay/renderer3d.test.ts`
Expected: Tests pass (with fallback placeholder when no model is provided).

- [ ] **Step 5: Commit**

```bash
git add src/lib/replay/renderer3d.ts
git commit -m "refactor(replay): wire rower avatar to GLTF model + bone mapper"
```

---

### Task 5: Refactor Skier and Cyclist Avatars

**Files:**
- Modify: `src/lib/replay/renderer3d.ts:578-717` (`makeSkierAvatar`)
- Modify: `src/lib/replay/renderer3d.ts:724-894` (`makeBikeAvatar`)

- [ ] **Step 1: Refactor makeSkierAvatar**

Same pattern as rower: replace procedural body (ellipsoids/capsules for torso, limbs, head) with GLTF model + BoneMapper. Keep procedural skis, boots, poles, baskets.

Wire IK targets:
- Skier upper body pivots from hips for double-pole crunch
- Arms reach forward to pole grips
- Legs are relatively static (standing on skis)

- [ ] **Step 2: Refactor makeBikeAvatar**

Same pattern: GLTF body + procedural bike frame, wheels, cranks, pedals, helmet.

Wire IK targets:
- Aero tuck (torso rotated ~42°)
- Legs pedal via IK driven by crank phase
- Subtle upper-body sway

- [ ] **Step 3: Run tests**

Run: `vp test -- --run src/lib/replay/renderer3d.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/replay/renderer3d.ts
git commit -m "refactor(replay): wire skier and cyclist avatars to GLTF model + bone mapper"
```

---

### Task 6: Quality Config and Model Selection

**Files:**
- Modify: `src/lib/replay/renderer3d.ts` (QualityConfig, QUALITY map)

- [ ] **Step 1: Add avatarModel to QualityConfig**

```ts
interface QualityConfig {
  // ... existing fields ...
  avatarModel: "low" | "high";
}
```

Update all 4 quality tiers:
- `low`: `avatarModel: "low"`
- `medium`: `avatarModel: "low"`
- `high`: `avatarModel: "high"`
- `ultra`: `avatarModel: "high"`

- [ ] **Step 2: Select model URL in SportProfile.make()**

The model URL is derived from `avatarModel`:
- `"low"` → `/models/athlete-low.glb`
- `"high"` → `/models/athlete.glb`

Pass this through from `CourseRenderer3D` constructor where quality is known.

- [ ] **Step 3: Run tests**

Run: `vp test -- --run src/lib/replay/renderer3d.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/replay/renderer3d.ts
git commit -m "feat(replay): quality-gated avatar model selection"
```

---

### Task 7: Shadow, Accent, and Ghost Wiring

**Files:**
- Modify: `src/lib/replay/renderer3d.ts` (finalizeAvatar, accent application)

- [ ] **Step 1: Ensure GLTF meshes get shadows**

The existing `finalizeAvatar` function (line 264) already traverses all meshes and sets `castShadow`. This should work on GLTF meshes automatically. Verify by checking that GLTF meshes have `castShadow = true` when `castShadow` param is `true`.

- [ ] **Step 2: Apply accent color to GLTF clothing materials**

Override the color of specific materials on the GLTF model. Strategy:
- Traverse the cloned GLTF scene
- For materials named "Kit" or "Jersey" (Mixamo naming), override `color` to the accent
- For skin materials, keep the default skin tone
- For shoe materials, keep HUMAN_SHOE

- [ ] **Step 3: Verify ghost lane translucency**

`finalizeAvatar` already handles opacity < 1 by setting `transparent = true` and `opacity`. This should work on GLTF materials.

- [ ] **Step 4: Commit**

```bash
git add src/lib/replay/renderer3d.ts
git commit -m "feat(replay): wire GLTF avatar shadows, accents, and ghost translucency"
```

---

### Task 8: Update Tests and Documentation

**Files:**
- Modify: `src/lib/replay/renderer3d.test.ts`
- Modify: `.kiro/steering/structure.md`

- [ ] **Step 1: Update 3D renderer tests**

Add test cases:
- Avatar construction with mock GLTF model
- Quality-gated model selection (low vs high)
- Fallback to placeholder when model unavailable
- Shadow casting on GLTF meshes
- No-throw and governor coverage (existing tests should still pass)

- [ ] **Step 2: Update structure.md**

Add new files to the replay module inventory:
- `src/lib/replay/modelCache.ts`
- `src/lib/replay/boneMapper.ts`
- `static/models/athlete.glb`
- `static/models/athlete-low.glb`

- [ ] **Step 3: Run full quality gate**

Run: `vp check`
Expected: format, lint, typecheck, test, build all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/replay/renderer3d.test.ts .kiro/steering/structure.md
git commit -m "test(replay): update 3D tests for GLTF avatar; update steering docs"
```

---

### Task 9: Verification

- [ ] **Step 1: Build and check**

Run: `vp check`
Expected: All pass.

- [ ] **Step 2: Visual QA in browser**

Run: `vp run preview`

Test these pages in 3D mode:
- `/replay/1001` — rower
- `/replay/1003` — skier
- `/replay/1004` — cyclist

For each:
- Toggle through Low → Medium → High → Ultra quality
- Verify avatar looks like a human (not a stick figure)
- Verify equipment (oar/ski/bike) still renders correctly
- Verify hands/feet are attached to equipment
- Verify light and dark themes
- Verify reduced motion mode
- Verify ghost lane (translucent avatar)
- Verify mobile viewport (resize browser)

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore(replay): GLTF avatar upgrade verification complete"
```
