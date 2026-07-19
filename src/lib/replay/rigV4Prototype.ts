import * as THREE from "three";

/**
 * V4 is intentionally an isolated proof of the rendering/animation seam that
 * the production replay does not use yet. It is a repository-authored generic
 * athlete: there are no downloaded meshes, scans, avatar-generator outputs,
 * textures, or athlete data in this file.
 *
 * The prototype proves three narrow facts:
 *
 * 1. A single `SkinnedMesh` can carry a coherent athlete surface instead of
 *    independently transformed primitive segments.
 * 2. The current Three.js version can sample a deterministic `AnimationClip`
 *    from replay wall-clock time via `AnimationMixer.setTime()`.
 * 3. The same graph exports to a conventional animated glTF/GLB without a
 *    third-party authoring asset.
 *
 * It deliberately does *not* replace the production contact solver. A future
 * adapter must map its exact RowErg/SkiErg/BikeErg hand, foot and equipment
 * contacts to these bones before this can be wired into `renderer3d.ts`.
 */

export const V4_RIG_NAME = "v4Athlete";
export const V4_CLIP_NAME = "v4-row-cycle-prototype";
export const V4_CYCLE_SECONDS = 1.2;

export const V4_BONE_NAMES = [
  "v4Hips",
  "v4Spine",
  "v4Chest",
  "v4Neck",
  "v4Head",
  "v4LeftClavicle",
  "v4LeftUpperArm",
  "v4LeftForearm",
  "v4LeftHand",
  "v4RightClavicle",
  "v4RightUpperArm",
  "v4RightForearm",
  "v4RightHand",
  "v4LeftUpperLeg",
  "v4LeftLowerLeg",
  "v4LeftFoot",
  "v4RightUpperLeg",
  "v4RightLowerLeg",
  "v4RightFoot",
] as const;

export type V4BoneName = (typeof V4_BONE_NAMES)[number];

export interface V4RigMetrics {
  readonly bones: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly clipTracks: number;
  readonly materialSlots: number;
}

export interface V4AthletePrototype {
  /** Root intentionally has no movement: replay course placement owns that. */
  readonly root: THREE.Group;
  /** One unified surface, driven by the hierarchy below rather than limb groups. */
  readonly mesh: THREE.SkinnedMesh;
  readonly skeleton: THREE.Skeleton;
  readonly bones: Readonly<Record<V4BoneName, THREE.Bone>>;
  /** A visual baseline only; exact sport contacts remain future runtime input. */
  readonly clip: THREE.AnimationClip;
  readonly mixer: THREE.AnimationMixer;
  readonly action: THREE.AnimationAction;
  readonly metrics: V4RigMetrics;
}

type BoneDefinition = {
  readonly name: V4BoneName;
  readonly parent?: V4BoneName;
  readonly position: readonly [number, number, number];
};

/**
 * These are joint locations in a neutral, generic adult sports-illustration
 * pose. They are an art-direction baseline, not a claim about a user’s body.
 */
const BONE_DEFINITIONS: readonly BoneDefinition[] = [
  { name: "v4Hips", position: [0, 1.02, 0] },
  { name: "v4Spine", parent: "v4Hips", position: [0, 0.22, 0] },
  { name: "v4Chest", parent: "v4Spine", position: [0, 0.27, 0.012] },
  { name: "v4Neck", parent: "v4Chest", position: [0, 0.2, 0.018] },
  { name: "v4Head", parent: "v4Neck", position: [0, 0.145, 0.02] },
  { name: "v4LeftClavicle", parent: "v4Chest", position: [-0.205, 0.13, 0.01] },
  { name: "v4LeftUpperArm", parent: "v4LeftClavicle", position: [0, 0, 0] },
  { name: "v4LeftForearm", parent: "v4LeftUpperArm", position: [-0.305, -0.115, 0.04] },
  { name: "v4LeftHand", parent: "v4LeftForearm", position: [-0.245, -0.09, 0.055] },
  { name: "v4RightClavicle", parent: "v4Chest", position: [0.205, 0.13, 0.01] },
  { name: "v4RightUpperArm", parent: "v4RightClavicle", position: [0, 0, 0] },
  { name: "v4RightForearm", parent: "v4RightUpperArm", position: [0.305, -0.115, 0.04] },
  { name: "v4RightHand", parent: "v4RightForearm", position: [0.245, -0.09, 0.055] },
  { name: "v4LeftUpperLeg", parent: "v4Hips", position: [-0.13, -0.025, 0] },
  { name: "v4LeftLowerLeg", parent: "v4LeftUpperLeg", position: [0, -0.47, 0.035] },
  { name: "v4LeftFoot", parent: "v4LeftLowerLeg", position: [0, -0.455, 0.06] },
  { name: "v4RightUpperLeg", parent: "v4Hips", position: [0.13, -0.025, 0] },
  { name: "v4RightLowerLeg", parent: "v4RightUpperLeg", position: [0, -0.47, 0.035] },
  { name: "v4RightFoot", parent: "v4RightLowerLeg", position: [0, -0.455, 0.06] },
];

const MATERIAL_FABRIC = 0;
const MATERIAL_SKIN = 1;
const MATERIAL_FOOTWEAR = 2;
const MATERIAL_HAIR = 3;

// Vertex colour keeps the exported prototype as one glTF primitive and one
// loaded SkinnedMesh. Material groups would otherwise be split into many
// discrete SkinnedMeshes by GLTFLoader, recreating the fragmented-figure
// problem this V4 seam is intended to remove.
const SURFACE_COLORS: readonly (readonly [number, number, number])[] = [
  [29 / 255, 78 / 255, 104 / 255],
  [201 / 255, 143 / 255, 107 / 255],
  [23 / 255, 33 / 255, 43 / 255],
  [26 / 255, 32 / 255, 43 / 255],
];

const UNIT_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

class SkinnedGeometryBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];
  private readonly skinIndices: number[] = [];
  private readonly skinWeights: number[] = [];
  private readonly colors: number[] = [];

  addEllipsoid(
    center: THREE.Vector3,
    radii: readonly [number, number, number],
    bone: number,
    material: number,
    radialSegments = 14,
    heightSegments = 10,
  ): void {
    const firstVertex = this.positions.length / 3;
    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments;
      const theta = v * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const phi = u * Math.PI * 2;
        this.addVertex(
          center.x + Math.cos(phi) * sinTheta * radii[0],
          center.y + cosTheta * radii[1],
          center.z + Math.sin(phi) * sinTheta * radii[2],
          bone,
          1,
          bone,
          0,
          material,
        );
      }
    }
    const width = radialSegments + 1;
    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < radialSegments; x++) {
        const a = firstVertex + y * width + x;
        const b = a + width;
        this.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  addTube(
    start: THREE.Vector3,
    end: THREE.Vector3,
    startBone: number,
    endBone: number,
    startRadius: readonly [number, number],
    endRadius: readonly [number, number],
    material: number,
    radialSegments = 14,
    rings = 6,
  ): void {
    const direction = end.clone().sub(start);
    if (direction.lengthSq() < 1e-10) return;
    direction.normalize();
    const tangent = new THREE.Vector3().crossVectors(direction, UNIT_Y);
    if (tangent.lengthSq() < 1e-8) tangent.crossVectors(direction, AXIS_X);
    tangent.normalize();
    const bitangent = new THREE.Vector3().crossVectors(tangent, direction).normalize();
    const firstVertex = this.positions.length / 3;
    const offset = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (let ring = 0; ring < rings; ring++) {
      const t = ring / (rings - 1);
      center.lerpVectors(start, end, t);
      // Linear two-bone weights are deliberate. The vertex strips are authored
      // densely around elbows/knees so a future production pass can replace
      // these baseline weights with sport-specific twist/corrective weights.
      const startWeight = 1 - t;
      const endWeight = t;
      const radiusX = THREE.MathUtils.lerp(startRadius[0], endRadius[0], t);
      const radiusY = THREE.MathUtils.lerp(startRadius[1], endRadius[1], t);
      for (let side = 0; side < radialSegments; side++) {
        const angle = (side / radialSegments) * Math.PI * 2;
        offset
          .copy(tangent)
          .multiplyScalar(Math.cos(angle) * radiusX)
          .addScaledVector(bitangent, Math.sin(angle) * radiusY);
        this.addVertex(
          center.x + offset.x,
          center.y + offset.y,
          center.z + offset.z,
          startBone,
          startWeight,
          endBone,
          endWeight,
          material,
        );
      }
    }
    for (let ring = 0; ring < rings - 1; ring++) {
      for (let side = 0; side < radialSegments; side++) {
        const next = (side + 1) % radialSegments;
        const a = firstVertex + ring * radialSegments + side;
        const b = firstVertex + ring * radialSegments + next;
        const c = firstVertex + (ring + 1) * radialSegments + side;
        const d = firstVertex + (ring + 1) * radialSegments + next;
        this.indices.push(a, c, b, b, c, d);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.skinIndices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.skinWeights, 4));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute("normal");
    // Degenerate pole triangles in the authored ellipsoid patches can leave a
    // zero normal. glTF requires a unit normal, and normalizing here keeps the
    // source deterministic instead of making GLTFExporter mutate it later.
    for (let index = 0; index < normals.count; index++) {
      const x = normals.getX(index);
      const y = normals.getY(index);
      const z = normals.getZ(index);
      const length = Math.hypot(x, y, z);
      if (length > 1e-8) normals.setXYZ(index, x / length, y / length, z / length);
      else normals.setXYZ(index, 0, 1, 0);
    }
    normals.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private addVertex(
    x: number,
    y: number,
    z: number,
    primaryBone: number,
    primaryWeight: number,
    secondaryBone = primaryBone,
    secondaryWeight = 0,
    surface = MATERIAL_FABRIC,
  ): void {
    this.positions.push(x, y, z);
    this.skinIndices.push(primaryBone, secondaryBone, 0, 0);
    this.skinWeights.push(primaryWeight, secondaryWeight, 0, 0);
    const color = SURFACE_COLORS[surface] ?? SURFACE_COLORS[MATERIAL_FABRIC];
    this.colors.push(color[0], color[1], color[2]);
  }
}

function buildBones(mesh: THREE.SkinnedMesh): {
  readonly skeleton: THREE.Skeleton;
  readonly bones: Readonly<Record<V4BoneName, THREE.Bone>>;
} {
  const mutableBones = {} as Record<V4BoneName, THREE.Bone>;
  const orderedBones: THREE.Bone[] = [];
  for (const definition of BONE_DEFINITIONS) {
    const bone = new THREE.Bone();
    bone.name = definition.name;
    bone.position.fromArray(definition.position);
    mutableBones[definition.name] = bone;
    orderedBones.push(bone);
    if (definition.parent) mutableBones[definition.parent].add(bone);
    else mesh.add(bone);
  }
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(orderedBones);
  return { skeleton, bones: Object.freeze(mutableBones) };
}

function boneWorldPosition(bone: THREE.Bone): THREE.Vector3 {
  return bone.getWorldPosition(new THREE.Vector3());
}

function boneIndex(name: V4BoneName): number {
  const index = V4_BONE_NAMES.indexOf(name);
  if (index < 0) throw new Error(`V4 prototype has no ${name} bone`);
  return index;
}

function createAthleteGeometry(
  bones: Readonly<Record<V4BoneName, THREE.Bone>>,
): THREE.BufferGeometry {
  const position = (name: V4BoneName): THREE.Vector3 => boneWorldPosition(bones[name]);
  const tube = (
    start: V4BoneName,
    end: V4BoneName,
    startRadius: readonly [number, number],
    endRadius: readonly [number, number],
    material: number,
  ): void => {
    builder.addTube(
      position(start),
      position(end),
      boneIndex(start),
      boneIndex(end),
      startRadius,
      endRadius,
      material,
    );
  };
  const ellipsoid = (
    center: THREE.Vector3,
    radii: readonly [number, number, number],
    bone: V4BoneName,
    material: number,
  ): void => builder.addEllipsoid(center, radii, boneIndex(bone), material);
  const builder = new SkinnedGeometryBuilder();

  // Pelvis, torso and shoulders establish a single continuous silhouette. The
  // pieces overlap in the bind pose because this is a source-only proof; a
  // production mesh would weld those rings and add corrective shapes.
  ellipsoid(position("v4Hips"), [0.22, 0.15, 0.17], "v4Hips", MATERIAL_FABRIC);
  tube("v4Hips", "v4Spine", [0.2, 0.17], [0.235, 0.18], MATERIAL_FABRIC);
  tube("v4Spine", "v4Chest", [0.235, 0.18], [0.275, 0.19], MATERIAL_FABRIC);
  tube("v4Chest", "v4LeftClavicle", [0.22, 0.16], [0.14, 0.12], MATERIAL_FABRIC);
  tube("v4Chest", "v4RightClavicle", [0.22, 0.16], [0.14, 0.12], MATERIAL_FABRIC);
  tube("v4Chest", "v4Neck", [0.11, 0.105], [0.075, 0.072], MATERIAL_SKIN);
  tube("v4Neck", "v4Head", [0.08, 0.078], [0.1, 0.1], MATERIAL_SKIN);

  const head = position("v4Head").add(new THREE.Vector3(0, 0.115, 0.02));
  ellipsoid(head, [0.145, 0.18, 0.14], "v4Head", MATERIAL_SKIN);
  ellipsoid(
    head.clone().add(new THREE.Vector3(0, 0.075, -0.012)),
    [0.151, 0.11, 0.147],
    "v4Head",
    MATERIAL_HAIR,
  );

  for (const side of ["Left", "Right"] as const) {
    const clavicle = `v4${side}Clavicle` as V4BoneName;
    const upperArm = `v4${side}UpperArm` as V4BoneName;
    const forearm = `v4${side}Forearm` as V4BoneName;
    const hand = `v4${side}Hand` as V4BoneName;
    tube(clavicle, upperArm, [0.105, 0.1], [0.1, 0.095], MATERIAL_FABRIC);
    tube(upperArm, forearm, [0.09, 0.082], [0.068, 0.062], MATERIAL_FABRIC);
    tube(forearm, hand, [0.066, 0.06], [0.047, 0.044], MATERIAL_SKIN);
    ellipsoid(position(forearm), [0.075, 0.07, 0.07], forearm, MATERIAL_SKIN);
    ellipsoid(
      position(hand).add(new THREE.Vector3(side === "Left" ? -0.04 : 0.04, -0.015, 0.035)),
      [0.075, 0.055, 0.09],
      hand,
      MATERIAL_SKIN,
    );
  }

  for (const side of ["Left", "Right"] as const) {
    const upperLeg = `v4${side}UpperLeg` as V4BoneName;
    const lowerLeg = `v4${side}LowerLeg` as V4BoneName;
    const foot = `v4${side}Foot` as V4BoneName;
    tube(upperLeg, lowerLeg, [0.125, 0.115], [0.092, 0.084], MATERIAL_FABRIC);
    tube(lowerLeg, foot, [0.09, 0.082], [0.057, 0.052], MATERIAL_FABRIC);
    ellipsoid(position(lowerLeg), [0.1, 0.092, 0.09], lowerLeg, MATERIAL_FABRIC);
    ellipsoid(
      position(foot).add(new THREE.Vector3(0, -0.03, 0.115)),
      [0.095, 0.065, 0.2],
      foot,
      MATERIAL_FOOTWEAR,
    );
  }

  return builder.build();
}

function rotationTrack(
  bone: V4BoneName,
  rotations: readonly (readonly [number, number, number])[],
): THREE.QuaternionKeyframeTrack {
  const times = [0, 0.18, 0.5, 0.82, V4_CYCLE_SECONDS];
  const values: number[] = [];
  for (const [x, y, z] of rotations) {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
    values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  return new THREE.QuaternionKeyframeTrack(
    `${V4_RIG_NAME}.bones[${bone}].quaternion`,
    times,
    values,
  );
}

/**
 * A deliberately restrained, loop-safe rowing baseline. This is only a
 * deterministic visual source for `AnimationMixer.setTime()`: production
 * integration must overwrite the contact-critical bones from actual solver
 * output instead of attempting to infer athlete biomechanics from the clip.
 */
function createRowCycleClip(): THREE.AnimationClip {
  const catchPose: readonly [number, number, number] = [-0.16, 0, 0];
  const finishPose: readonly [number, number, number] = [0.18, 0, 0];
  const tracks = [
    rotationTrack("v4Hips", [catchPose, [-0.07, 0, 0], finishPose, [0.03, 0, 0], catchPose]),
    rotationTrack("v4Spine", [
      [-0.34, 0, 0],
      [-0.48, 0, 0],
      [0.28, 0, 0],
      [0.08, 0, 0],
      [-0.34, 0, 0],
    ]),
    rotationTrack("v4Chest", [
      [-0.14, 0, 0],
      [-0.19, 0, 0],
      [0.13, 0, 0],
      [0.05, 0, 0],
      [-0.14, 0, 0],
    ]),
    rotationTrack("v4LeftClavicle", [
      [0, -0.03, -0.1],
      [0, -0.04, -0.12],
      [0, 0.02, -0.06],
      [0, -0.01, -0.08],
      [0, -0.03, -0.1],
    ]),
    rotationTrack("v4RightClavicle", [
      [0, 0.03, 0.1],
      [0, 0.04, 0.12],
      [0, -0.02, 0.06],
      [0, 0.01, 0.08],
      [0, 0.03, 0.1],
    ]),
    rotationTrack("v4LeftUpperArm", [
      [0.64, -0.16, -0.58],
      [0.7, -0.17, -0.62],
      [-0.08, -0.08, -0.38],
      [0.32, -0.12, -0.5],
      [0.64, -0.16, -0.58],
    ]),
    rotationTrack("v4RightUpperArm", [
      [0.64, 0.16, 0.58],
      [0.7, 0.17, 0.62],
      [-0.08, 0.08, 0.38],
      [0.32, 0.12, 0.5],
      [0.64, 0.16, 0.58],
    ]),
    rotationTrack("v4LeftForearm", [
      [-0.12, 0, -0.22],
      [-0.16, 0, -0.25],
      [-1.22, 0, -0.38],
      [-0.58, 0, -0.3],
      [-0.12, 0, -0.22],
    ]),
    rotationTrack("v4RightForearm", [
      [-0.12, 0, 0.22],
      [-0.16, 0, 0.25],
      [-1.22, 0, 0.38],
      [-0.58, 0, 0.3],
      [-0.12, 0, 0.22],
    ]),
    rotationTrack("v4LeftUpperLeg", [
      [-0.88, 0, 0.03],
      [-1.02, 0, 0.03],
      [0.17, 0, 0.03],
      [-0.36, 0, 0.03],
      [-0.88, 0, 0.03],
    ]),
    rotationTrack("v4RightUpperLeg", [
      [-0.88, 0, -0.03],
      [-1.02, 0, -0.03],
      [0.17, 0, -0.03],
      [-0.36, 0, -0.03],
      [-0.88, 0, -0.03],
    ]),
    rotationTrack("v4LeftLowerLeg", [
      [1.52, 0, 0],
      [1.7, 0, 0],
      [0.24, 0, 0],
      [0.78, 0, 0],
      [1.52, 0, 0],
    ]),
    rotationTrack("v4RightLowerLeg", [
      [1.52, 0, 0],
      [1.7, 0, 0],
      [0.24, 0, 0],
      [0.78, 0, 0],
      [1.52, 0, 0],
    ]),
  ];
  const clip = new THREE.AnimationClip(V4_CLIP_NAME, V4_CYCLE_SECONDS, tracks);
  clip.userData = {
    replayRigPrototype: 4,
    role: "deterministic visual baseline; solver contacts override before render",
  };
  if (!clip.validate()) throw new Error("V4 prototype clip failed Three.js validation");
  return clip;
}

function createPrototypeMaterial(): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    color: 0x1d4e68,
    vertexColors: true,
    roughness: 0.62,
    sheen: 0.12,
    sheenColor: new THREE.Color(0x78b8dc),
    sheenRoughness: 0.72,
  });
}

/** Build a self-contained, repository-authored V4 generic athlete. */
export function createV4AthletePrototype(): V4AthletePrototype {
  const root = new THREE.Group();
  root.name = "v4-rig-prototype-root";
  root.userData = {
    replayRigPrototype: 4,
    source: "repository-authored procedural skinned mesh",
    notProductionRuntime: true,
  };

  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), createPrototypeMaterial());
  mesh.name = V4_RIG_NAME;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // A skinned box is not automatically recomputed each frame. Keep this
  // standalone test asset visible while a real runtime supplies a pose-aware
  // bound or an approved culling policy.
  mesh.frustumCulled = false;
  root.add(mesh);

  const { skeleton, bones } = buildBones(mesh);
  mesh.geometry.dispose();
  mesh.geometry = createAthleteGeometry(bones);
  mesh.bind(skeleton);
  mesh.normalizeSkinWeights();

  const clip = createRowCycleClip();
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = false;
  action.enabled = true;
  action.setEffectiveWeight(1);
  action.play();

  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.getIndex();
  if (!index) throw new Error("V4 prototype must remain indexed");
  const metrics: V4RigMetrics = Object.freeze({
    bones: skeleton.bones.length,
    vertices: position.count,
    triangles: index.count / 3,
    clipTracks: clip.tracks.length,
    materialSlots: Array.isArray(mesh.material) ? mesh.material.length : 1,
  });

  const prototype = { root, mesh, skeleton, bones, clip, mixer, action, metrics };
  return sampleV4AthletePrototype(prototype, 0);
}

/**
 * Sample an exact clip time without integrating a frame delta. This is the
 * replay seam: the caller owns wall-clock/stroke phase and can always seek to
 * the same pose, including after pause/scrub/ghost comparison.
 */
export function sampleV4AthletePrototype(
  prototype: V4AthletePrototype,
  seconds: number,
): V4AthletePrototype {
  if (!Number.isFinite(seconds)) throw new Error("V4 prototype sample time must be finite");
  prototype.mixer.setTime(seconds);
  prototype.root.updateMatrixWorld(true);
  prototype.skeleton.update();
  return prototype;
}

/** Dispose the isolated artifact after a test, exporter run, or future preview. */
export function disposeV4AthletePrototype(prototype: V4AthletePrototype): void {
  prototype.action.stop();
  prototype.mixer.stopAllAction();
  prototype.mixer.uncacheAction(prototype.clip);
  prototype.mixer.uncacheClip(prototype.clip);
  prototype.mixer.uncacheRoot(prototype.root);
  prototype.mesh.geometry.dispose();
  const materials = Array.isArray(prototype.mesh.material)
    ? prototype.mesh.material
    : [prototype.mesh.material];
  for (const material of materials) material.dispose();
  prototype.skeleton.dispose();
  prototype.root.removeFromParent();
}
