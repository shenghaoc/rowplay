import * as THREE from "three";

/**
 * Repository-authored production V4 athlete source.
 *
 * This module owns the stable generic skeleton, reference skin, explicit
 * contact effectors, and deterministic canonical clips for RowErg, SkiErg and
 * BikeErg. The checked production GLB replaces the reference surface with the
 * higher-detail Blender-authored mesh from
 * `scripts/build-replay-athlete-v4-blender.py` before export. No downloaded
 * mesh, scan, likeness, avatar generator, texture, user image, or athlete
 * telemetry contributes to either path.
 *
 * Clips provide the human-performance base pose. The renderer remains
 * responsible for post-clip hand, foot and planted-equipment constraints.
 */

export const V4_ASSET_FILENAME = "rowplay-athlete-v4.glb";
export const V4_ROOT_NAME = "rowplay-v4-athlete-root";
export const V4_RIG_NAME = "v4Athlete";
export const V4_CYCLE_SECONDS = 1;

export const V4_CLIP_NAMES = Object.freeze({
  rower: "rowplay-v4-row-cycle",
  skier: "rowplay-v4-ski-cycle",
  bike: "rowplay-v4-bike-cycle",
} as const);

export type V4Sport = keyof typeof V4_CLIP_NAMES;

export const V4_DRIVE_END = Object.freeze({
  rower: 0.38,
  skier: 0.34,
  bike: 0.5,
} as const satisfies Readonly<Record<V4Sport, number>>);

export const V4_PHASE_SCHEMAS = Object.freeze({
  rower: Object.freeze({
    catch: 0,
    legDrive: 0.08,
    bodyOpen: 0.3,
    finish: V4_DRIVE_END.rower,
    handsAway: 0.54,
    bodyOver: 0.72,
    slide: 0.88,
    loop: 1,
  }),
  skier: Object.freeze({
    reach: 0,
    plant: 0.12,
    loadedPull: 0.24,
    driveEnd: V4_DRIVE_END.skier,
    release: 0.58,
    recover: 0.78,
    loop: 1,
  }),
  bike: Object.freeze({
    leftTop: 0,
    leftPower: 0.25,
    opposed: V4_DRIVE_END.bike,
    rightPower: 0.75,
    loop: 1,
  }),
} as const);

export const V4_CONTACT_OFFSETS = Object.freeze({
  v4LeftHand: [-0.08, -0.01, 0.035],
  v4RightHand: [0.08, -0.01, 0.035],
  v4LeftFoot: [0, -0.055, 0.13],
  v4RightFoot: [0, -0.055, 0.13],
} as const);

export const V4_CONTACT_ROLES = Object.freeze({
  v4LeftHand: "left-hand",
  v4RightHand: "right-hand",
  v4LeftFoot: "left-foot",
  v4RightFoot: "right-foot",
} as const);

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
export type V4ContactBoneName = keyof typeof V4_CONTACT_OFFSETS;
export type V4ContactMarkerName = `${V4ContactBoneName}Contact`;

export interface V4RigMetrics {
  readonly bones: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly clips: number;
  readonly clipTracks: number;
  readonly contactEffectors: number;
  readonly materialSlots: number;
}

export interface V4AthleteAsset {
  /** Root intentionally has no movement: replay course placement owns that. */
  readonly root: THREE.Group;
  /** One unified surface, driven by the hierarchy below rather than limb groups. */
  readonly mesh: THREE.SkinnedMesh;
  readonly skeleton: THREE.Skeleton;
  readonly bones: Readonly<Record<V4BoneName, THREE.Bone>>;
  readonly effectors: Readonly<Record<V4ContactBoneName, THREE.Object3D>>;
  /** Canonical base motion; runtime contact correction remains authoritative. */
  readonly clips: Readonly<Record<V4Sport, THREE.AnimationClip>>;
  /** Compatibility alias for the RowErg clip. */
  readonly clip: THREE.AnimationClip;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Readonly<Record<V4Sport, THREE.AnimationAction>>;
  /** Compatibility alias for the RowErg action. */
  readonly action: THREE.AnimationAction;
  readonly metrics: V4RigMetrics;
}

export type V4BoneDefinition = {
  readonly name: V4BoneName;
  readonly parent?: V4BoneName;
  readonly position: readonly [number, number, number];
};

/**
 * These are joint locations in a neutral, generic adult sports-illustration
 * pose. They are an art-direction baseline, not a claim about a user’s body.
 */
export const V4_BONE_DEFINITIONS: readonly V4BoneDefinition[] = [
  { name: "v4Hips", position: [0, 1.02, 0] },
  { name: "v4Spine", parent: "v4Hips", position: [0, 0.19, 0] },
  { name: "v4Chest", parent: "v4Spine", position: [0, 0.235, 0.012] },
  { name: "v4Neck", parent: "v4Chest", position: [0, 0.145, 0.018] },
  { name: "v4Head", parent: "v4Neck", position: [0, 0.105, 0.02] },
  { name: "v4LeftClavicle", parent: "v4Chest", position: [-0.18, 0.095, 0.01] },
  { name: "v4LeftUpperArm", parent: "v4LeftClavicle", position: [-0.06, -0.02, 0.006] },
  { name: "v4LeftForearm", parent: "v4LeftUpperArm", position: [-0.365, -0.128, 0.051] },
  { name: "v4LeftHand", parent: "v4LeftForearm", position: [-0.354, -0.108, 0.06] },
  { name: "v4RightClavicle", parent: "v4Chest", position: [0.18, 0.095, 0.01] },
  { name: "v4RightUpperArm", parent: "v4RightClavicle", position: [0.06, -0.02, 0.006] },
  { name: "v4RightForearm", parent: "v4RightUpperArm", position: [0.365, -0.128, 0.051] },
  { name: "v4RightHand", parent: "v4RightForearm", position: [0.354, -0.108, 0.06] },
  { name: "v4LeftUpperLeg", parent: "v4Hips", position: [-0.13, -0.025, 0] },
  { name: "v4LeftLowerLeg", parent: "v4LeftUpperLeg", position: [0, -0.49, 0.038] },
  { name: "v4LeftFoot", parent: "v4LeftLowerLeg", position: [0, -0.475, 0.065] },
  { name: "v4RightUpperLeg", parent: "v4Hips", position: [0.13, -0.025, 0] },
  { name: "v4RightLowerLeg", parent: "v4RightUpperLeg", position: [0, -0.49, 0.038] },
  { name: "v4RightFoot", parent: "v4RightLowerLeg", position: [0, -0.475, 0.065] },
];

const MATERIAL_FABRIC = 0;
const MATERIAL_SKIN = 1;
const MATERIAL_FOOTWEAR = 2;
const MATERIAL_HAIR = 3;
const MATERIAL_TRIM = 4;
const MATERIAL_HEADWEAR = 5;
const MATERIAL_SHORTS = 6;

// Vertex colour keeps the production asset as one glTF primitive and one
// loaded SkinnedMesh. Material groups would otherwise be split into many
// discrete SkinnedMeshes by GLTFLoader, recreating the fragmented-figure
// problem this V4 seam is intended to remove.
function linearSurfaceColor(hex: THREE.ColorRepresentation): readonly [number, number, number] {
  // glTF COLOR_0 values are linear. Authoring raw sRGB bytes here made the
  // skin and kit several times too bright once Three converted the final frame
  // back to the display colour space—the chief cause of the pale mannequin
  // read in dark venues.
  const color = new THREE.Color(hex);
  return Object.freeze([color.r, color.g, color.b] as const);
}

const SURFACE_COLORS: readonly (readonly [number, number, number])[] = [
  // Brand-indigo performance kit keeps the moving athlete distinct from the
  // dark teal regatta and asphalt surfaces while sharing the replay UI accent.
  linearSurfaceColor(0x433e91),
  linearSurfaceColor(0xc98f6b),
  linearSurfaceColor(0x17212b),
  linearSurfaceColor(0x1a202b),
  linearSurfaceColor(0x8c7cf0),
  linearSurfaceColor(0x121f2d),
  linearSurfaceColor(0x25235c),
];

const UNIT_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

type ChainRing = {
  readonly center: THREE.Vector3;
  readonly radii: readonly [number, number];
  readonly primaryBone: number;
  readonly primaryWeight: number;
  readonly secondaryBone?: number;
  readonly secondaryWeight?: number;
  readonly surface: number;
};

class SkinnedGeometryBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];
  private readonly skinIndices: number[] = [];
  private readonly skinWeights: number[] = [];
  private readonly colors: number[] = [];

  /**
   * Author one closed, connected surface across a complete anatomical chain.
   * Adjacent rings share triangle indices, so elbows/knees/wrists/ankles are
   * genuine longitudinal topology with spatially varying weights rather than
   * intersecting capsules carrying a single 42/58 joint weight.
   */
  addChain(rings: readonly ChainRing[], radialSegments = 20, preferredNormal = AXIS_X): void {
    if (rings.length < 2) throw new Error("A V4 surface chain needs at least two rings");
    const firstVertex = this.positions.length / 3;
    const tangent = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const bitangent = new THREE.Vector3();
    const previousNormal = new THREE.Vector3();
    const offset = new THREE.Vector3();

    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
      const ring = rings[ringIndex];
      const previous = rings[Math.max(0, ringIndex - 1)].center;
      const next = rings[Math.min(rings.length - 1, ringIndex + 1)].center;
      tangent.copy(next).sub(previous).normalize();
      if (ringIndex === 0) {
        normal.copy(preferredNormal).addScaledVector(tangent, -preferredNormal.dot(tangent));
      } else {
        normal.copy(previousNormal).addScaledVector(tangent, -previousNormal.dot(tangent));
      }
      if (normal.lengthSq() < 1e-8) {
        normal.copy(AXIS_Z).addScaledVector(tangent, -AXIS_Z.dot(tangent));
      }
      normal.normalize();
      bitangent.crossVectors(tangent, normal).normalize();
      previousNormal.copy(normal);
      for (let side = 0; side < radialSegments; side++) {
        const angle = (side / radialSegments) * Math.PI * 2;
        offset
          .copy(normal)
          .multiplyScalar(Math.cos(angle) * ring.radii[0])
          .addScaledVector(bitangent, Math.sin(angle) * ring.radii[1]);
        this.addVertex(
          ring.center.x + offset.x,
          ring.center.y + offset.y,
          ring.center.z + offset.z,
          ring.primaryBone,
          ring.primaryWeight,
          ring.secondaryBone ?? ring.primaryBone,
          ring.secondaryWeight ?? 0,
          ring.surface,
        );
      }
    }
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let side = 0; side < radialSegments; side++) {
        const next = (side + 1) % radialSegments;
        const a = firstVertex + ring * radialSegments + side;
        const b = firstVertex + ring * radialSegments + next;
        const c = firstVertex + (ring + 1) * radialSegments + side;
        const d = firstVertex + (ring + 1) * radialSegments + next;
        this.indices.push(a, c, b, b, c, d);
      }
    }

    const addCap = (ringIndex: number, reverse: boolean): void => {
      const ring = rings[ringIndex];
      const centerIndex = this.positions.length / 3;
      this.addVertex(
        ring.center.x,
        ring.center.y,
        ring.center.z,
        ring.primaryBone,
        ring.primaryWeight,
        ring.secondaryBone ?? ring.primaryBone,
        ring.secondaryWeight ?? 0,
        ring.surface,
      );
      const ringStart = firstVertex + ringIndex * radialSegments;
      for (let side = 0; side < radialSegments; side++) {
        const next = (side + 1) % radialSegments;
        if (reverse) this.indices.push(centerIndex, ringStart + next, ringStart + side);
        else this.indices.push(centerIndex, ringStart + side, ringStart + next);
      }
    };
    addCap(0, true);
    addCap(rings.length - 1, false);
  }

  addEllipsoid(
    center: THREE.Vector3,
    radii: readonly [number, number, number],
    bone: number,
    material: number,
    radialSegments = 22,
    heightSegments = 16,
    secondaryBone = bone,
    secondaryWeight = 0,
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
          1 - secondaryWeight,
          secondaryBone,
          secondaryWeight,
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
    radialSegments = 18,
    rings = 9,
    blendFrom = 0.58,
    blendTo = 0.94,
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
      // Keep most of the segment on its proximal bone, then use a broad
      // smoothstep band into the child. That holds muscle volume through the
      // shaft while giving elbows and knees enough blended rings to bend
      // without the proof asset's rubber-hose taper.
      const rawBlend = THREE.MathUtils.clamp((t - blendFrom) / (blendTo - blendFrom), 0, 1);
      const endWeight = rawBlend * rawBlend * (3 - 2 * rawBlend);
      const startWeight = 1 - endWeight;
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
  readonly effectors: Readonly<Record<V4ContactBoneName, THREE.Object3D>>;
} {
  const mutableBones = {} as Record<V4BoneName, THREE.Bone>;
  const orderedBones: THREE.Bone[] = [];
  for (const definition of V4_BONE_DEFINITIONS) {
    const bone = new THREE.Bone();
    bone.name = definition.name;
    bone.position.fromArray(definition.position);
    mutableBones[definition.name] = bone;
    orderedBones.push(bone);
    if (definition.parent) mutableBones[definition.parent].add(bone);
    else mesh.add(bone);
  }
  const effectors = {} as Record<V4ContactBoneName, THREE.Object3D>;
  for (const boneName of Object.keys(V4_CONTACT_OFFSETS) as V4ContactBoneName[]) {
    const bone = mutableBones[boneName];
    const offset = V4_CONTACT_OFFSETS[boneName];
    const role = V4_CONTACT_ROLES[boneName];
    bone.userData = {
      replayContactRole: role,
      replayContactOffset: [...offset],
    };
    const effector = new THREE.Object3D();
    effector.name = `${boneName}Contact`;
    effector.position.fromArray(offset);
    effector.userData = {
      replayContactRole: role,
      replayContactBone: boneName,
      replayContactOffset: [...offset],
    };
    bone.add(effector);
    effectors[boneName] = effector;
  }
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(orderedBones);
  return {
    skeleton,
    bones: Object.freeze(mutableBones),
    effectors: Object.freeze(effectors),
  };
}

function boneWorldPosition(bone: THREE.Bone): THREE.Vector3 {
  return bone.getWorldPosition(new THREE.Vector3());
}

function boneIndex(name: V4BoneName): number {
  const index = V4_BONE_NAMES.indexOf(name);
  if (index < 0) throw new Error(`V4 athlete has no ${name} bone`);
  return index;
}

function createAthleteGeometry(
  bones: Readonly<Record<V4BoneName, THREE.Bone>>,
): THREE.BufferGeometry {
  const position = (name: V4BoneName): THREE.Vector3 => boneWorldPosition(bones[name]);
  const ellipsoid = (
    center: THREE.Vector3,
    radii: readonly [number, number, number],
    bone: V4BoneName,
    material: number,
    radialSegments = 18,
    heightSegments = 12,
    secondaryBone: V4BoneName = bone,
    secondaryWeight = 0,
  ): void =>
    builder.addEllipsoid(
      center,
      radii,
      boneIndex(bone),
      material,
      radialSegments,
      heightSegments,
      boneIndex(secondaryBone),
      secondaryWeight,
    );
  const builder = new SkinnedGeometryBuilder();

  const hips = position("v4Hips");
  const spine = position("v4Spine");
  const chest = position("v4Chest");
  const neck = position("v4Neck");
  const headBone = position("v4Head");
  const head = headBone.clone().add(new THREE.Vector3(0, 0.075, 0.018));

  // One closed axial loft now owns pelvis, waist, rib cage, collar, neck, jaw
  // and cranium. This replaces the proof asset's pile of intersecting torso
  // capsules with a single indexed component and spatial axial weights.
  builder.addChain(
    [
      {
        center: hips.clone().add(new THREE.Vector3(0, -0.15, 0)),
        radii: [0.18, 0.135],
        primaryBone: boneIndex("v4Hips"),
        primaryWeight: 1,
        surface: MATERIAL_SHORTS,
      },
      {
        center: hips,
        radii: [0.205, 0.155],
        primaryBone: boneIndex("v4Hips"),
        primaryWeight: 1,
        surface: MATERIAL_SHORTS,
      },
      {
        center: hips.clone().lerp(spine, 0.48),
        radii: [0.168, 0.128],
        primaryBone: boneIndex("v4Hips"),
        primaryWeight: 0.58,
        secondaryBone: boneIndex("v4Spine"),
        secondaryWeight: 0.42,
        surface: MATERIAL_SHORTS,
      },
      {
        center: hips.clone().lerp(spine, 0.58),
        radii: [0.166, 0.126],
        primaryBone: boneIndex("v4Hips"),
        primaryWeight: 0.52,
        secondaryBone: boneIndex("v4Spine"),
        secondaryWeight: 0.48,
        surface: MATERIAL_TRIM,
      },
      {
        center: hips.clone().lerp(spine, 0.7),
        radii: [0.168, 0.128],
        primaryBone: boneIndex("v4Spine"),
        primaryWeight: 0.62,
        secondaryBone: boneIndex("v4Hips"),
        secondaryWeight: 0.38,
        surface: MATERIAL_FABRIC,
      },
      {
        center: spine,
        radii: [0.19, 0.14],
        primaryBone: boneIndex("v4Spine"),
        primaryWeight: 0.82,
        secondaryBone: boneIndex("v4Hips"),
        secondaryWeight: 0.18,
        surface: MATERIAL_FABRIC,
      },
      {
        center: spine.clone().lerp(chest, 0.5),
        radii: [0.225, 0.16],
        primaryBone: boneIndex("v4Spine"),
        primaryWeight: 0.52,
        secondaryBone: boneIndex("v4Chest"),
        secondaryWeight: 0.48,
        surface: MATERIAL_FABRIC,
      },
      {
        center: chest,
        radii: [0.245, 0.17],
        primaryBone: boneIndex("v4Chest"),
        primaryWeight: 0.82,
        secondaryBone: boneIndex("v4Spine"),
        secondaryWeight: 0.18,
        surface: MATERIAL_FABRIC,
      },
      {
        center: chest.clone().lerp(neck, 0.46),
        radii: [0.235, 0.16],
        primaryBone: boneIndex("v4Chest"),
        primaryWeight: 0.82,
        secondaryBone: boneIndex("v4Neck"),
        secondaryWeight: 0.18,
        surface: MATERIAL_FABRIC,
      },
      {
        center: chest.clone().lerp(neck, 0.78),
        radii: [0.16, 0.115],
        primaryBone: boneIndex("v4Chest"),
        primaryWeight: 0.48,
        secondaryBone: boneIndex("v4Neck"),
        secondaryWeight: 0.52,
        surface: MATERIAL_FABRIC,
      },
      {
        center: neck.clone().add(new THREE.Vector3(0, -0.025, 0)),
        radii: [0.078, 0.068],
        primaryBone: boneIndex("v4Chest"),
        primaryWeight: 0.3,
        secondaryBone: boneIndex("v4Neck"),
        secondaryWeight: 0.7,
        surface: MATERIAL_SKIN,
      },
      {
        center: neck.clone().lerp(headBone, 0.68),
        radii: [0.064, 0.057],
        primaryBone: boneIndex("v4Neck"),
        primaryWeight: 0.5,
        secondaryBone: boneIndex("v4Head"),
        secondaryWeight: 0.5,
        surface: MATERIAL_SKIN,
      },
      {
        center: head.clone().add(new THREE.Vector3(0, -0.09, 0.026)),
        radii: [0.082, 0.075],
        primaryBone: boneIndex("v4Head"),
        primaryWeight: 1,
        surface: MATERIAL_SKIN,
      },
      {
        center: head.clone().add(new THREE.Vector3(0, -0.025, 0.012)),
        radii: [0.105, 0.095],
        primaryBone: boneIndex("v4Head"),
        primaryWeight: 1,
        surface: MATERIAL_SKIN,
      },
      {
        center: head.clone().add(new THREE.Vector3(0, 0.05, -0.004)),
        radii: [0.112, 0.105],
        primaryBone: boneIndex("v4Head"),
        primaryWeight: 1,
        surface: MATERIAL_SKIN,
      },
      {
        center: head.clone().add(new THREE.Vector3(0, 0.115, -0.014)),
        radii: [0.085, 0.075],
        primaryBone: boneIndex("v4Head"),
        primaryWeight: 1,
        surface: MATERIAL_SKIN,
      },
    ],
    44,
    AXIS_X,
  );
  // Low-relief collar, yoke and waist details break the toy-like monolithic
  // torso while remaining vertex-colour geometry in the same skinned mesh.
  ellipsoid(
    position("v4Chest")
      .clone()
      .add(new THREE.Vector3(0, 0.03, 0.184)),
    [0.16, 0.085, 0.025],
    "v4Chest",
    MATERIAL_TRIM,
    24,
    12,
  );
  // Directional face planes and close-fitting performance headwear make the
  // view direction unambiguous without introducing a likeness.
  ellipsoid(
    head.clone().add(new THREE.Vector3(0, 0.005, 0.118)),
    [0.022, 0.03, 0.04],
    "v4Head",
    MATERIAL_SKIN,
    18,
    12,
  );
  ellipsoid(
    head.clone().add(new THREE.Vector3(0, 0.074, 0.096)),
    [0.052, 0.006, 0.01],
    "v4Head",
    MATERIAL_HAIR,
    22,
    10,
  );
  ellipsoid(
    head.clone().add(new THREE.Vector3(-0.105, -0.005, 0.002)),
    [0.016, 0.031, 0.018],
    "v4Head",
    MATERIAL_SKIN,
    16,
    10,
  );
  ellipsoid(
    head.clone().add(new THREE.Vector3(0.105, -0.005, 0.002)),
    [0.016, 0.031, 0.018],
    "v4Head",
    MATERIAL_SKIN,
    16,
    10,
  );
  ellipsoid(
    head.clone().add(new THREE.Vector3(0, 0.112, -0.018)),
    [0.118, 0.052, 0.115],
    "v4Head",
    MATERIAL_HEADWEAR,
    28,
    16,
  );
  ellipsoid(
    head.clone().add(new THREE.Vector3(0, 0.126, -0.018)),
    [0.012, 0.008, 0.082],
    "v4Head",
    MATERIAL_TRIM,
    20,
    12,
  );

  for (const side of ["Left", "Right"] as const) {
    const clavicle = `v4${side}Clavicle` as V4BoneName;
    const upperArm = `v4${side}UpperArm` as V4BoneName;
    const forearm = `v4${side}Forearm` as V4BoneName;
    const hand = `v4${side}Hand` as V4BoneName;
    const shoulderRoot = position(clavicle);
    const deepShoulderRoot = chest.clone().lerp(shoulderRoot, 0.68);
    const shoulder = position(upperArm);
    const elbow = position(forearm);
    const wrist = position(hand);
    const contact = wrist
      .clone()
      .add(new THREE.Vector3(...V4_CONTACT_OFFSETS[hand as V4ContactBoneName]));
    const fingertip = contact
      .clone()
      .add(contact.clone().sub(wrist).normalize().multiplyScalar(0.03));
    builder.addChain(
      [
        {
          // Start the branch well inside the chest. The cap stays closed for
          // watertight export, but can no longer flash as a shoulder socket.
          center: deepShoulderRoot,
          radii: [0.03, 0.026],
          primaryBone: boneIndex("v4Chest"),
          primaryWeight: 0.7,
          secondaryBone: boneIndex(clavicle),
          secondaryWeight: 0.3,
          surface: MATERIAL_FABRIC,
        },
        {
          // Bury the closed chain cap inside the chest instead of presenting a
          // circular plug to the chase camera.
          center: shoulderRoot,
          radii: [0.05, 0.043],
          primaryBone: boneIndex(clavicle),
          primaryWeight: 0.9,
          secondaryBone: boneIndex(upperArm),
          secondaryWeight: 0.1,
          surface: MATERIAL_FABRIC,
        },
        {
          center: shoulder,
          radii: [0.075, 0.065],
          primaryBone: boneIndex(upperArm),
          primaryWeight: 0.68,
          secondaryBone: boneIndex(clavicle),
          secondaryWeight: 0.32,
          surface: MATERIAL_FABRIC,
        },
        {
          center: shoulder.clone().lerp(elbow, 0.18),
          radii: [0.082, 0.072],
          primaryBone: boneIndex(upperArm),
          primaryWeight: 1,
          surface: MATERIAL_FABRIC,
        },
        {
          center: shoulder.clone().lerp(elbow, 0.52),
          radii: [0.066, 0.058],
          primaryBone: boneIndex(upperArm),
          primaryWeight: 0.96,
          secondaryBone: boneIndex(forearm),
          secondaryWeight: 0.04,
          surface: MATERIAL_SKIN,
        },
        {
          center: shoulder.clone().lerp(elbow, 0.82),
          radii: [0.057, 0.049],
          primaryBone: boneIndex(upperArm),
          primaryWeight: 0.78,
          secondaryBone: boneIndex(forearm),
          secondaryWeight: 0.22,
          surface: MATERIAL_SKIN,
        },
        {
          center: elbow,
          radii: [0.05, 0.045],
          primaryBone: boneIndex(upperArm),
          primaryWeight: 0.48,
          secondaryBone: boneIndex(forearm),
          secondaryWeight: 0.52,
          surface: MATERIAL_SKIN,
        },
        {
          center: elbow.clone().lerp(wrist, 0.22),
          radii: [0.057, 0.048],
          primaryBone: boneIndex(upperArm),
          primaryWeight: 0.18,
          secondaryBone: boneIndex(forearm),
          secondaryWeight: 0.82,
          surface: MATERIAL_SKIN,
        },
        {
          center: elbow.clone().lerp(wrist, 0.55),
          radii: [0.048, 0.04],
          primaryBone: boneIndex(forearm),
          primaryWeight: 0.94,
          secondaryBone: boneIndex(hand),
          secondaryWeight: 0.06,
          surface: MATERIAL_SKIN,
        },
        {
          center: elbow.clone().lerp(wrist, 0.82),
          radii: [0.038, 0.032],
          primaryBone: boneIndex(forearm),
          primaryWeight: 0.72,
          secondaryBone: boneIndex(hand),
          secondaryWeight: 0.28,
          surface: MATERIAL_SKIN,
        },
        {
          center: wrist,
          radii: [0.031, 0.027],
          primaryBone: boneIndex(forearm),
          primaryWeight: 0.28,
          secondaryBone: boneIndex(hand),
          secondaryWeight: 0.72,
          surface: MATERIAL_SKIN,
        },
        {
          center: wrist.clone().lerp(contact, 0.5),
          radii: [0.045, 0.028],
          primaryBone: boneIndex(hand),
          primaryWeight: 1,
          surface: MATERIAL_SKIN,
        },
        {
          center: contact,
          radii: [0.04, 0.024],
          primaryBone: boneIndex(hand),
          primaryWeight: 1,
          surface: MATERIAL_SKIN,
        },
        {
          center: fingertip,
          radii: [0.018, 0.013],
          primaryBone: boneIndex(hand),
          primaryWeight: 1,
          surface: MATERIAL_SKIN,
        },
      ],
      40,
      AXIS_Z,
    );

    const sideSign = side === "Left" ? -1 : 1;
    ellipsoid(
      wrist
        .clone()
        .lerp(contact, 0.58)
        .add(new THREE.Vector3(-sideSign * 0.018, -0.021, 0.018)),
      [0.022, 0.018, 0.028],
      hand,
      MATERIAL_SKIN,
      16,
      10,
    );
  }

  for (const side of ["Left", "Right"] as const) {
    const upperLeg = `v4${side}UpperLeg` as V4BoneName;
    const lowerLeg = `v4${side}LowerLeg` as V4BoneName;
    const foot = `v4${side}Foot` as V4BoneName;
    const hip = position(upperLeg);
    const deepHipRoot = hips.clone().lerp(hip, 0.25);
    const hipRoot = hips.clone().lerp(hip, 0.55);
    const knee = position(lowerLeg);
    const ankle = position(foot);
    const soleOffset = V4_CONTACT_OFFSETS[foot as V4ContactBoneName];
    const cleat = ankle.clone().add(new THREE.Vector3(...soleOffset));
    const heel = ankle.clone().add(new THREE.Vector3(0, -0.04, -0.045));
    const midsole = ankle.clone().add(new THREE.Vector3(0, -0.052, 0.06));
    const toe = ankle.clone().add(new THREE.Vector3(0, -0.045, 0.225));
    builder.addChain(
      [
        {
          // A narrow pelvis-owned root keeps the closed cap inside the shorts
          // and lets the thigh emerge without a visible circular hip plug.
          center: deepHipRoot,
          radii: [0.05, 0.045],
          primaryBone: boneIndex("v4Hips"),
          primaryWeight: 0.82,
          secondaryBone: boneIndex(upperLeg),
          secondaryWeight: 0.18,
          surface: MATERIAL_SHORTS,
        },
        {
          // As with the shoulder, terminate the loft inside the pelvis so the
          // connected thigh emerges without a visible circular hip cap.
          center: hipRoot,
          radii: [0.08, 0.07],
          primaryBone: boneIndex("v4Hips"),
          primaryWeight: 0.76,
          secondaryBone: boneIndex(upperLeg),
          secondaryWeight: 0.24,
          surface: MATERIAL_SHORTS,
        },
        {
          center: hip,
          radii: [0.105, 0.095],
          primaryBone: boneIndex("v4Hips"),
          primaryWeight: 0.28,
          secondaryBone: boneIndex(upperLeg),
          secondaryWeight: 0.72,
          surface: MATERIAL_SHORTS,
        },
        {
          center: hip.clone().lerp(knee, 0.2),
          radii: [0.12, 0.108],
          primaryBone: boneIndex(upperLeg),
          primaryWeight: 1,
          surface: MATERIAL_SHORTS,
        },
        {
          center: hip.clone().lerp(knee, 0.52),
          radii: [0.112, 0.1],
          primaryBone: boneIndex(upperLeg),
          primaryWeight: 0.96,
          secondaryBone: boneIndex(lowerLeg),
          secondaryWeight: 0.04,
          surface: MATERIAL_SHORTS,
        },
        {
          center: hip.clone().lerp(knee, 0.82),
          radii: [0.102, 0.092],
          primaryBone: boneIndex(upperLeg),
          primaryWeight: 0.78,
          secondaryBone: boneIndex(lowerLeg),
          secondaryWeight: 0.22,
          surface: MATERIAL_FABRIC,
        },
        {
          center: knee,
          radii: [0.096, 0.088],
          primaryBone: boneIndex(upperLeg),
          primaryWeight: 0.46,
          secondaryBone: boneIndex(lowerLeg),
          secondaryWeight: 0.54,
          surface: MATERIAL_FABRIC,
        },
        {
          center: knee.clone().lerp(ankle, 0.22),
          radii: [0.096, 0.088],
          primaryBone: boneIndex(upperLeg),
          primaryWeight: 0.16,
          secondaryBone: boneIndex(lowerLeg),
          secondaryWeight: 0.84,
          surface: MATERIAL_FABRIC,
        },
        {
          center: knee.clone().lerp(ankle, 0.55),
          radii: [0.084, 0.077],
          primaryBone: boneIndex(lowerLeg),
          primaryWeight: 0.95,
          secondaryBone: boneIndex(foot),
          secondaryWeight: 0.05,
          surface: MATERIAL_FABRIC,
        },
        {
          center: knee.clone().lerp(ankle, 0.82),
          radii: [0.066, 0.061],
          primaryBone: boneIndex(lowerLeg),
          primaryWeight: 0.74,
          secondaryBone: boneIndex(foot),
          secondaryWeight: 0.26,
          surface: MATERIAL_FABRIC,
        },
        {
          center: ankle,
          radii: [0.059, 0.055],
          primaryBone: boneIndex(lowerLeg),
          primaryWeight: 0.26,
          secondaryBone: boneIndex(foot),
          secondaryWeight: 0.74,
          surface: MATERIAL_FOOTWEAR,
        },
        {
          center: heel,
          radii: [0.09, 0.058],
          primaryBone: boneIndex(foot),
          primaryWeight: 1,
          surface: MATERIAL_FOOTWEAR,
        },
        {
          center: midsole,
          radii: [0.105, 0.064],
          primaryBone: boneIndex(foot),
          primaryWeight: 1,
          surface: MATERIAL_FOOTWEAR,
        },
        {
          center: cleat,
          radii: [0.108, 0.056],
          primaryBone: boneIndex(foot),
          primaryWeight: 1,
          surface: MATERIAL_TRIM,
        },
        {
          center: toe,
          radii: [0.092, 0.045],
          primaryBone: boneIndex(foot),
          primaryWeight: 1,
          surface: MATERIAL_FOOTWEAR,
        },
      ],
      40,
      AXIS_X,
    );
  }

  return builder.build();
}

type EulerKey = readonly [number, number, number];
type PositionKey = readonly [number, number, number];

function rotationTrack(
  times: readonly number[],
  bone: V4BoneName,
  rotations: readonly EulerKey[],
): THREE.QuaternionKeyframeTrack {
  if (rotations.length !== times.length) {
    throw new Error(`${bone} has ${rotations.length} rotations for ${times.length} times`);
  }
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

function positionTrack(
  times: readonly number[],
  bone: V4BoneName,
  positions: readonly PositionKey[],
): THREE.VectorKeyframeTrack {
  if (positions.length !== times.length) {
    throw new Error(`${bone} has ${positions.length} positions for ${times.length} times`);
  }
  return new THREE.VectorKeyframeTrack(
    `${V4_RIG_NAME}.bones[${bone}].position`,
    times,
    positions.flat(),
  );
}

function mirror(keys: readonly EulerKey[]): readonly EulerKey[] {
  return keys.map(([x, y, z]) => [x, -y, -z] as const);
}

function flipPitch(keys: readonly EulerKey[]): readonly EulerKey[] {
  return keys.map(([x, y, z]) => [-x, y, z] as const);
}

function flipYaw(keys: readonly EulerKey[]): readonly EulerKey[] {
  return keys.map(([x, y, z]) => [x, -y, z] as const);
}

function scalePitch(keys: readonly EulerKey[], scale: number): readonly EulerKey[] {
  return keys.map(([x, y, z]) => [x * scale, y, z] as const);
}

function staticKeys(times: readonly number[], key: EulerKey = [0, 0, 0]): readonly EulerKey[] {
  return times.map(() => key);
}

function createSportClip(
  sport: V4Sport,
  times: readonly number[],
  hips: readonly PositionKey[],
  rotations: Readonly<Partial<Record<V4BoneName, readonly EulerKey[]>>>,
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [positionTrack(times, "v4Hips", hips)];
  for (const bone of V4_BONE_NAMES) {
    tracks.push(rotationTrack(times, bone, rotations[bone] ?? staticKeys(times)));
  }
  const clip = new THREE.AnimationClip(V4_CLIP_NAMES[sport], V4_CYCLE_SECONDS, tracks);
  clip.userData = {
    replayRigVersion: 4,
    replaySport: sport,
    replayDriveEnd: V4_DRIVE_END[sport],
    replayPhaseSchema: V4_PHASE_SCHEMAS[sport],
    role: "canonical technique clip; runtime contact-constrains palms and soles (no V3 arm oracle)",
  };
  if (!clip.validate()) throw new Error(`${sport} V4 clip failed Three.js validation`);
  return clip;
}

/**
 * Concept2 / sculling-style row cycle authored from technique sequencing:
 * catch → leg drive (arms DEAD STRAIGHT) → body open (arms still straight) →
 * arm draw begins → finish (elbows aft, deep flexion) → hands-away →
 * body-over → slide.
 *
 * CRITICAL: Real rowing sequencing is legs → body → arms. The arms must stay
 * completely straight (forearm near zero) through the entire leg drive AND the
 * body swing. Elbow bend begins ONLY after the body has opened past ~80%.
 * This eliminates the "premature draw" that makes the stroke look like a
 * shoulder shrug.
 *
 * 14-key clip for smoother interpolation across transition points.
 *
 * Reference sequencing (public coaching material, not mocap clips):
 * - Concept2 technique library (indoor rowing stages)
 * - British Rowing / World Rowing sculling posture stills
 */
function createRowCycleClip(): THREE.AnimationClip {
  // 14 keyframes: catch, early-leg, mid-leg, late-leg, body-open, arm-draw-begin,
  // arm-draw-mid, finish, hands-away, arms-extend, body-over, mid-slide, late-slide, loop
  const times = [
    0, 0.06, 0.12, 0.2, 0.26, 0.3, 0.34, 0.38, 0.48, 0.56, 0.66, 0.78, 0.9, 1,
  ] as const;
  // Clavicle: catch protraction → finish retraction (scapular squeeze at finish).
  // More gradual transition with 14 keys for natural shoulder blade movement.
  const leftClavicle = [
    [0.04, -0.02, -0.1], // catch: protracted, slightly depressed
    [0.04, -0.02, -0.1], // early leg: no change
    [0.04, -0.018, -0.1], // mid leg: minimal
    [0.035, -0.015, -0.095], // late leg: beginning
    [0.02, -0.005, -0.08], // body open: shoulders starting to set
    [0.005, 0.008, -0.065], // draw begin: scapulae engage
    [-0.01, 0.02, -0.055], // draw mid: retracting
    [-0.02, 0.028, -0.045], // finish: scapulae squeezed, not shrugged
    [0.005, 0.01, -0.065], // hands away: releasing
    [0.02, -0.005, -0.08], // arms extend: returning
    [0.03, -0.012, -0.09], // body over
    [0.035, -0.016, -0.095], // mid slide
    [0.04, -0.019, -0.1], // late slide
    [0.04, -0.02, -0.1], // loop
  ] as const;
  // Upper arm: catch at moderate elevation (not shrugged); arms stay long and
  // level through the entire leg drive and body open. Draw only late.
  // Euler order XYZ after flipYaw — x=forward elevation, z=abduction-ish.
  const leftUpperArm = [
    [0.42, -0.1, -0.44], // catch: moderate reach, not shrugged
    [0.43, -0.1, -0.44], // early leg: arms completely still
    [0.42, -0.1, -0.44], // mid leg: still straight, arms hang from shoulders
    [0.4, -0.1, -0.43], // late leg: barely perceptible change
    [0.34, -0.09, -0.42], // body open: arms still straight, moving with body
    [0.18, -0.07, -0.38], // draw begin: upper arm starts traveling aft
    [0.02, -0.05, -0.34], // draw mid: elbows moving behind ribcage
    [-0.1, -0.03, -0.28], // finish: elbows fully aft, not winged out
    [0.12, -0.07, -0.38], // hands away: rapid extension forward
    [0.28, -0.09, -0.42], // arms extend: nearly straight again
    [0.35, -0.1, -0.44], // body over: arms fully extended
    [0.39, -0.1, -0.44], // mid slide: arms still straight
    [0.41, -0.1, -0.44], // late slide: preparing for catch
    [0.42, -0.1, -0.44], // loop
  ] as const;
  // Forearm: ABSOLUTELY STRAIGHT through leg drive and body open.
  // Only begins flexing at arm-draw-begin (t=0.30). Deep flexion at finish only.
  const leftForearm = [
    [-0.06, 0.03, -0.08], // catch: nearly straight, soft not locked
    [-0.06, 0.03, -0.08], // early drive: straight
    [-0.06, 0.03, -0.08], // mid leg: still straight
    [-0.07, 0.03, -0.08], // late leg: STILL STRAIGHT
    [-0.08, 0.03, -0.09], // body open: barely perceptible flex
    [-0.28, 0.03, -0.14], // draw begin: elbows start bending
    [-0.68, 0.035, -0.22], // draw mid: accelerating into draw
    [-1.12, 0.04, -0.28], // finish: deep draw, elbows back
    [-0.48, 0.03, -0.18], // hands away: rapid extension
    [-0.18, 0.03, -0.12], // arms extend: nearly straight
    [-0.1, 0.03, -0.09], // body over: arms fully extended
    [-0.07, 0.03, -0.08], // mid slide: straight
    [-0.06, 0.03, -0.08], // late slide: straight
    [-0.06, 0.03, -0.08], // loop
  ] as const;
  const upperLeg = [
    [-0.95, 0, 0.025],
    [-0.98, 0, 0.025],
    [-0.88, 0, 0.023],
    [-0.62, 0, 0.02],
    [-0.36, 0, 0.016],
    [-0.16, 0, 0.013],
    [0.02, 0, 0.011],
    [0.12, 0, 0.01],
    [0.1, 0, 0.011],
    [0.06, 0, 0.012],
    [-0.08, 0, 0.015],
    [-0.42, 0, 0.02],
    [-0.78, 0, 0.024],
    [-0.95, 0, 0.025],
  ] as const;
  const lowerLeg = [
    [1.58, 0, 0],
    [1.64, 0, 0],
    [1.48, 0, 0],
    [1.12, 0, 0],
    [0.78, 0, 0],
    [0.48, 0, 0],
    [0.28, 0, 0],
    [0.22, 0, 0],
    [0.26, 0, 0],
    [0.35, 0, 0],
    [0.55, 0, 0],
    [0.95, 0, 0],
    [1.38, 0, 0],
    [1.58, 0, 0],
  ] as const;
  return createSportClip(
    "rower",
    times,
    [
      [0, 0.96, -0.27], // catch: low, forward
      [0, 0.955, -0.28], // early leg
      [0, 0.965, -0.24], // mid leg
      [0, 0.99, -0.12], // late leg
      [0, 1.01, 0.0], // body open
      [0, 1.025, 0.08], // draw begin
      [0, 1.033, 0.13], // draw mid
      [0, 1.038, 0.17], // finish
      [0, 1.032, 0.14], // hands away
      [0, 1.02, 0.08], // arms extend
      [0, 1.005, 0.02], // body over
      [0, 0.985, -0.1], // mid slide
      [0, 0.965, -0.22], // late slide
      [0, 0.96, -0.27], // loop
    ],
    {
      v4Hips: flipPitch([
        [-0.1, 0, 0],
        [-0.11, 0, 0],
        [-0.09, 0, 0],
        [-0.04, 0, 0],
        [0.02, 0, 0],
        [0.1, 0, 0],
        [0.15, 0, 0],
        [0.18, 0, 0],
        [0.08, 0, 0],
        [0.02, 0, 0],
        [-0.02, 0, 0],
        [-0.05, 0, 0],
        [-0.08, 0, 0],
        [-0.1, 0, 0],
      ]),
      v4Spine: flipPitch([
        [-0.28, 0, 0],
        [-0.29, 0, 0],
        [-0.27, 0, 0],
        [-0.2, 0, 0],
        [-0.1, 0, 0],
        [0.06, 0, 0],
        [0.16, 0, 0],
        [0.24, 0, 0],
        [0.06, 0, 0],
        [-0.06, 0, 0],
        [-0.14, 0, 0],
        [-0.22, 0, 0],
        [-0.26, 0, 0],
        [-0.28, 0, 0],
      ]),
      v4Chest: flipPitch([
        [-0.09, 0, 0],
        [-0.1, 0, 0],
        [-0.09, 0, 0],
        [-0.07, 0, 0],
        [-0.04, 0, 0],
        [0.03, 0, 0],
        [0.08, 0, 0],
        [0.12, 0, 0],
        [0.04, 0, 0],
        [-0.02, 0, 0],
        [-0.05, 0, 0],
        [-0.08, 0, 0],
        [-0.09, 0, 0],
        [-0.09, 0, 0],
      ]),
      v4Neck: flipPitch([
        [0.08, 0, 0],
        [0.08, 0, 0],
        [0.08, 0, 0],
        [0.06, 0, 0],
        [0.04, 0, 0],
        [0.0, 0, 0],
        [-0.03, 0, 0],
        [-0.06, 0, 0],
        [-0.01, 0, 0],
        [0.02, 0, 0],
        [0.04, 0, 0],
        [0.06, 0, 0],
        [0.07, 0, 0],
        [0.08, 0, 0],
      ]),
      v4Head: flipPitch([
        [0.08, 0, 0],
        [0.08, 0, 0],
        [0.08, 0, 0],
        [0.05, 0, 0],
        [0.03, 0, 0],
        [-0.02, 0, 0],
        [-0.05, 0, 0],
        [-0.08, 0, 0],
        [-0.02, 0, 0],
        [0.01, 0, 0],
        [0.03, 0, 0],
        [0.05, 0, 0],
        [0.07, 0, 0],
        [0.08, 0, 0],
      ]),
      v4LeftClavicle: flipYaw(leftClavicle),
      v4RightClavicle: mirror(flipYaw(leftClavicle)),
      v4LeftUpperArm: flipYaw(leftUpperArm),
      v4RightUpperArm: mirror(flipYaw(leftUpperArm)),
      v4LeftForearm: leftForearm,
      v4RightForearm: mirror(leftForearm),
      v4LeftHand: [
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
        [0, 0.02, -0.04],
        [0, 0.015, -0.03],
        [0, 0.005, -0.01],
        [0, -0.01, 0.015],
        [0, -0.02, 0.03],
        [0, 0, -0.01],
        [0, 0.01, -0.025],
        [0, 0.02, -0.04],
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
      ],
      v4RightHand: mirror([
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
        [0, 0.02, -0.04],
        [0, 0.015, -0.03],
        [0, 0.005, -0.01],
        [0, -0.01, 0.015],
        [0, -0.02, 0.03],
        [0, 0, -0.01],
        [0, 0.01, -0.025],
        [0, 0.02, -0.04],
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
        [0, 0.025, -0.05],
      ]),
      v4LeftUpperLeg: upperLeg,
      v4RightUpperLeg: mirror(upperLeg),
      v4LeftLowerLeg: lowerLeg,
      v4RightLowerLeg: mirror(lowerLeg),
      v4LeftFoot: [
        [-0.14, 0, 0],
        [-0.16, 0, 0],
        [-0.13, 0, 0],
        [-0.08, 0, 0],
        [-0.04, 0, 0],
        [-0.01, 0, 0],
        [0.02, 0, 0],
        [0.04, 0, 0],
        [0.03, 0, 0],
        [0.01, 0, 0],
        [-0.02, 0, 0],
        [-0.06, 0, 0],
        [-0.11, 0, 0],
        [-0.14, 0, 0],
      ],
      v4RightFoot: [
        [-0.14, 0, 0],
        [-0.16, 0, 0],
        [-0.13, 0, 0],
        [-0.08, 0, 0],
        [-0.04, 0, 0],
        [-0.01, 0, 0],
        [0.02, 0, 0],
        [0.04, 0, 0],
        [0.03, 0, 0],
        [0.01, 0, 0],
        [-0.02, 0, 0],
        [-0.06, 0, 0],
        [-0.11, 0, 0],
        [-0.14, 0, 0],
      ],
    },
  );
}

/**
 * Nordic double-pole / SkiErg cycle: high reach → plant → loaded press →
 * release → recovery. Elbows are controlled by this authored arc, not by a
 * world-space lateral oracle or three-point hand spline at runtime.
 *
 * Arms nearly straight at high reach (not T-pose, not deep early flex). Trunk
 * and hip hinge load before the press; elbows flex modestly mid-press then
 * re-extend at release. 14 keys for continuous recovery velocity.
 *
 * Reference sequencing (public technique sources, not third-party mocap files):
 * - FIS / cross-country double-poling coaching stills
 * - Concept2 SkiErg technique library
 */
function createSkiCycleClip(): THREE.AnimationClip {
  // reach, peak, plant, load-start, load, drive-end, deep-press, release-start,
  // release, recover-low, recover-mid, recover-high, pre-reach, loop
  const times = [
    0, 0.05, 0.1, 0.16, 0.22, 0.34, 0.44, 0.52, 0.58, 0.68, 0.78, 0.88, 0.95, 1,
  ] as const;
  // Upper arm: high forward (not lateral T-pose) → extension aft through press.
  const leftArm = [
    [-0.88, -0.16, -0.32], // high reach — soft elevation
    [-0.98, -0.18, -0.34], // peak reach
    [-0.92, -0.16, -0.32], // plant — still high, hands ahead of shoulders
    [-0.72, -0.12, -0.28], // load-start: shoulders load
    [-0.48, -0.1, -0.26], // load
    [0.02, -0.04, -0.18], // drive end — hands dropping
    [0.42, 0, -0.12], // deep press — extension aft (not wing)
    [0.32, -0.02, -0.14], // release-start
    [0.18, -0.04, -0.18], // release
    [-0.05, -0.08, -0.24], // recover-low
    [-0.35, -0.12, -0.28], // recover-mid
    [-0.65, -0.14, -0.3], // recover-high
    [-0.8, -0.15, -0.32], // pre-reach
    [-0.88, -0.16, -0.32], // loop
  ] as const;
  // Near-straight at reach; modest load flex; no snap at release.
  const leftForearm = [
    [-0.14, 0.02, -0.12], // reach: nearly straight
    [-0.12, 0.02, -0.1], // peak
    [-0.16, 0.02, -0.12], // plant
    [-0.42, 0.025, -0.18], // load-start
    [-0.72, 0.03, -0.24], // load
    [-0.98, 0.03, -0.28], // drive end
    [-0.78, 0.02, -0.24], // deep press: re-extending
    [-0.52, 0.02, -0.2], // release-start
    [-0.32, 0.02, -0.16], // release
    [-0.28, 0.02, -0.14], // recover-low
    [-0.22, 0.02, -0.13], // recover-mid
    [-0.16, 0.02, -0.12], // recover-high
    [-0.14, 0.02, -0.12], // pre-reach
    [-0.14, 0.02, -0.12], // loop
  ] as const;
  const leftLeg = [
    [-0.28, 0, 0.04],
    [-0.3, 0, 0.04],
    [-0.36, 0, 0.04],
    [-0.44, 0, 0.038],
    [-0.52, 0, 0.035],
    [-0.58, 0, 0.03],
    [-0.52, 0, 0.028],
    [-0.4, 0, 0.028],
    [-0.28, 0, 0.028],
    [-0.18, 0, 0.03],
    [-0.14, 0, 0.032],
    [-0.2, 0, 0.035],
    [-0.25, 0, 0.038],
    [-0.28, 0, 0.04],
  ] as const;
  const lowerLeg = [
    [0.48, 0, 0],
    [0.5, 0, 0],
    [0.58, 0, 0],
    [0.68, 0, 0],
    [0.8, 0, 0],
    [0.88, 0, 0],
    [0.8, 0, 0],
    [0.68, 0, 0],
    [0.55, 0, 0],
    [0.45, 0, 0],
    [0.4, 0, 0],
    [0.42, 0, 0],
    [0.46, 0, 0],
    [0.48, 0, 0],
  ] as const;
  const clavicleKeys = [
    [-0.1, -0.035, -0.085],
    [-0.12, -0.04, -0.09],
    [-0.1, -0.032, -0.085],
    [-0.05, -0.02, -0.07],
    [0.0, -0.005, -0.06],
    [0.06, 0.012, -0.05],
    [0.1, 0.02, -0.04],
    [0.06, 0.01, -0.05],
    [0.02, 0, -0.06],
    [-0.02, -0.01, -0.07],
    [-0.05, -0.02, -0.075],
    [-0.08, -0.028, -0.08],
    [-0.09, -0.032, -0.085],
    [-0.1, -0.035, -0.085],
  ] as const;
  return createSportClip(
    "skier",
    times,
    [
      [0, 1.03, -0.04],
      [0, 1.035, -0.02],
      [0, 1.032, 0],
      [0, 1.01, 0.04],
      [0, 0.99, 0.08],
      [0, 0.95, 0.13],
      [0, 0.925, 0.17],
      [0, 0.94, 0.15],
      [0, 0.965, 0.12],
      [0, 0.995, 0.07],
      [0, 1.015, 0.03],
      [0, 1.028, -0.01],
      [0, 1.03, -0.03],
      [0, 1.03, -0.04],
    ],
    {
      v4Hips: flipPitch([
        [-0.05, 0, 0],
        [-0.04, 0, 0],
        [-0.055, 0, 0],
        [-0.1, 0, 0],
        [-0.16, 0, 0],
        [-0.24, 0, 0],
        [-0.3, 0, 0],
        [-0.24, 0, 0],
        [-0.16, 0, 0],
        [-0.1, 0, 0],
        [-0.06, 0, 0],
        [-0.05, 0, 0],
        [-0.05, 0, 0],
        [-0.05, 0, 0],
      ]),
      v4Spine: flipPitch([
        [-0.1, 0, 0],
        [-0.08, 0, 0],
        [-0.11, 0, 0],
        [-0.18, 0, 0],
        [-0.28, 0, 0],
        [-0.4, 0, 0],
        [-0.48, 0, 0],
        [-0.38, 0, 0],
        [-0.28, 0, 0],
        [-0.18, 0, 0],
        [-0.12, 0, 0],
        [-0.1, 0, 0],
        [-0.1, 0, 0],
        [-0.1, 0, 0],
      ]),
      v4Chest: flipPitch([
        [-0.03, 0, 0],
        [-0.02, 0, 0],
        [-0.035, 0, 0],
        [-0.08, 0, 0],
        [-0.14, 0, 0],
        [-0.2, 0, 0],
        [-0.24, 0, 0],
        [-0.18, 0, 0],
        [-0.12, 0, 0],
        [-0.07, 0, 0],
        [-0.04, 0, 0],
        [-0.03, 0, 0],
        [-0.03, 0, 0],
        [-0.03, 0, 0],
      ]),
      v4Neck: flipPitch([
        [0.06, 0, 0],
        [0.05, 0, 0],
        [0.065, 0, 0],
        [0.1, 0, 0],
        [0.14, 0, 0],
        [0.18, 0, 0],
        [0.2, 0, 0],
        [0.16, 0, 0],
        [0.12, 0, 0],
        [0.08, 0, 0],
        [0.06, 0, 0],
        [0.06, 0, 0],
        [0.06, 0, 0],
        [0.06, 0, 0],
      ]),
      v4Head: flipPitch([
        [0.03, 0, 0],
        [0.02, 0, 0],
        [0.035, 0, 0],
        [0.06, 0, 0],
        [0.09, 0, 0],
        [0.12, 0, 0],
        [0.14, 0, 0],
        [0.11, 0, 0],
        [0.08, 0, 0],
        [0.05, 0, 0],
        [0.03, 0, 0],
        [0.03, 0, 0],
        [0.03, 0, 0],
        [0.03, 0, 0],
      ]),
      v4LeftClavicle: flipYaw(clavicleKeys),
      v4RightClavicle: mirror(flipYaw(clavicleKeys)),
      v4LeftUpperArm: flipYaw(leftArm),
      v4RightUpperArm: mirror(flipYaw(leftArm)),
      v4LeftForearm: leftForearm,
      v4RightForearm: mirror(leftForearm),
      v4LeftHand: [
        [0.03, 0.015, -0.04],
        [0.025, 0.015, -0.035],
        [0.02, 0.01, -0.03],
        [0, 0.005, -0.01],
        [-0.03, 0, 0.02],
        [-0.06, -0.01, 0.04],
        [-0.08, -0.015, 0.05],
        [-0.05, -0.005, 0.03],
        [-0.02, 0, 0.01],
        [0, 0.005, -0.01],
        [0.015, 0.01, -0.025],
        [0.025, 0.012, -0.035],
        [0.03, 0.015, -0.04],
        [0.03, 0.015, -0.04],
      ],
      v4RightHand: mirror([
        [0.03, 0.015, -0.04],
        [0.025, 0.015, -0.035],
        [0.02, 0.01, -0.03],
        [0, 0.005, -0.01],
        [-0.03, 0, 0.02],
        [-0.06, -0.01, 0.04],
        [-0.08, -0.015, 0.05],
        [-0.05, -0.005, 0.03],
        [-0.02, 0, 0.01],
        [0, 0.005, -0.01],
        [0.015, 0.01, -0.025],
        [0.025, 0.012, -0.035],
        [0.03, 0.015, -0.04],
        [0.03, 0.015, -0.04],
      ]),
      v4LeftUpperLeg: leftLeg,
      v4RightUpperLeg: mirror(leftLeg),
      v4LeftLowerLeg: lowerLeg,
      v4RightLowerLeg: mirror(lowerLeg),
      v4LeftFoot: [
        [-0.04, 0, 0],
        [-0.045, 0, 0],
        [-0.055, 0, 0],
        [-0.07, 0, 0],
        [-0.085, 0, 0],
        [-0.1, 0, 0],
        [-0.09, 0, 0],
        [-0.07, 0, 0],
        [-0.05, 0, 0],
        [-0.04, 0, 0],
        [-0.03, 0, 0],
        [-0.035, 0, 0],
        [-0.038, 0, 0],
        [-0.04, 0, 0],
      ],
      v4RightFoot: [
        [-0.04, 0, 0],
        [-0.045, 0, 0],
        [-0.055, 0, 0],
        [-0.07, 0, 0],
        [-0.085, 0, 0],
        [-0.1, 0, 0],
        [-0.09, 0, 0],
        [-0.07, 0, 0],
        [-0.05, 0, 0],
        [-0.04, 0, 0],
        [-0.03, 0, 0],
        [-0.035, 0, 0],
        [-0.038, 0, 0],
        [-0.04, 0, 0],
      ],
    },
  );
}

function createBikeCycleClip(): THREE.AnimationClip {
  const times = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;
  const leftUpperLeg = [
    [-0.86, 0, 0.02],
    [-0.62, 0, 0.015],
    [-0.18, 0, 0.01],
    [0.18, 0, 0.005],
    [0.36, 0, 0],
    [0.16, 0, 0.005],
    [-0.2, 0, 0.01],
    [-0.64, 0, 0.015],
    [-0.86, 0, 0.02],
  ] as const;
  const rightUpperLeg = [
    [0.36, 0, 0],
    [0.16, 0, -0.005],
    [-0.2, 0, -0.01],
    [-0.64, 0, -0.015],
    [-0.86, 0, -0.02],
    [-0.62, 0, -0.015],
    [-0.18, 0, -0.01],
    [0.18, 0, -0.005],
    [0.36, 0, 0],
  ] as const;
  const leftLowerLeg = [
    [1.3, 0, 0],
    [1.08, 0, 0],
    [0.62, 0, 0],
    [0.28, 0, 0],
    [0.16, 0, 0],
    [0.32, 0, 0],
    [0.7, 0, 0],
    [1.12, 0, 0],
    [1.3, 0, 0],
  ] as const;
  const rightLowerLeg = [
    [0.16, 0, 0],
    [0.32, 0, 0],
    [0.7, 0, 0],
    [1.12, 0, 0],
    [1.3, 0, 0],
    [1.08, 0, 0],
    [0.62, 0, 0],
    [0.28, 0, 0],
    [0.16, 0, 0],
  ] as const;
  const leftArm = [
    [0.42, -0.12, -0.46],
    [0.43, -0.11, -0.45],
    [0.44, -0.1, -0.44],
    [0.43, -0.09, -0.45],
    [0.42, -0.1, -0.46],
    [0.41, -0.11, -0.47],
    [0.4, -0.12, -0.48],
    [0.41, -0.13, -0.47],
    [0.42, -0.12, -0.46],
  ] as const;
  return createSportClip(
    "bike",
    times,
    [
      [-0.018, 1.015, 0],
      [-0.013, 1.02, 0],
      [0, 1.025, 0],
      [0.013, 1.02, 0],
      [0.018, 1.015, 0],
      [0.013, 1.02, 0],
      [0, 1.025, 0],
      [-0.013, 1.02, 0],
      [-0.018, 1.015, 0],
    ],
    {
      v4Hips: scalePitch(
        flipPitch([
          [-0.06, 0.025, -0.02],
          [-0.055, 0.018, -0.014],
          [-0.05, 0, 0],
          [-0.055, -0.018, 0.014],
          [-0.06, -0.025, 0.02],
          [-0.055, -0.018, 0.014],
          [-0.05, 0, 0],
          [-0.055, 0.018, -0.014],
          [-0.06, 0.025, -0.02],
        ]),
        1.6,
      ),
      v4Spine: scalePitch(
        flipPitch([
          [-0.28, -0.018, 0],
          [-0.27, -0.012, 0],
          [-0.26, 0, 0],
          [-0.27, 0.012, 0],
          [-0.28, 0.018, 0],
          [-0.27, 0.012, 0],
          [-0.26, 0, 0],
          [-0.27, -0.012, 0],
          [-0.28, -0.018, 0],
        ]),
        1.6,
      ),
      v4Chest: scalePitch(
        flipPitch([
          [-0.12, 0.012, 0],
          [-0.115, 0.008, 0],
          [-0.11, 0, 0],
          [-0.115, -0.008, 0],
          [-0.12, -0.012, 0],
          [-0.115, -0.008, 0],
          [-0.11, 0, 0],
          [-0.115, 0.008, 0],
          [-0.12, 0.012, 0],
        ]),
        1.6,
      ),
      v4Neck: flipPitch([
        [0.12, 0.006, 0],
        [0.115, 0.004, 0],
        [0.11, 0, 0],
        [0.115, -0.004, 0],
        [0.12, -0.006, 0],
        [0.115, -0.004, 0],
        [0.11, 0, 0],
        [0.115, 0.004, 0],
        [0.12, 0.006, 0],
      ]),
      v4Head: flipPitch([
        [0.08, -0.004, 0],
        [0.075, -0.002, 0],
        [0.07, 0, 0],
        [0.075, 0.002, 0],
        [0.08, 0.004, 0],
        [0.075, 0.002, 0],
        [0.07, 0, 0],
        [0.075, -0.002, 0],
        [0.08, -0.004, 0],
      ]),
      v4LeftClavicle: flipYaw([
        [0.02, -0.02, -0.08],
        [0.018, -0.018, -0.078],
        [0.015, -0.015, -0.075],
        [0.018, -0.012, -0.078],
        [0.02, -0.015, -0.08],
        [0.022, -0.018, -0.082],
        [0.025, -0.02, -0.085],
        [0.022, -0.022, -0.082],
        [0.02, -0.02, -0.08],
      ]),
      v4RightClavicle: mirror(
        flipYaw([
          [0.02, -0.02, -0.08],
          [0.018, -0.018, -0.078],
          [0.015, -0.015, -0.075],
          [0.018, -0.012, -0.078],
          [0.02, -0.015, -0.08],
          [0.022, -0.018, -0.082],
          [0.025, -0.02, -0.085],
          [0.022, -0.022, -0.082],
          [0.02, -0.02, -0.08],
        ]),
      ),
      v4LeftUpperArm: flipYaw(leftArm),
      v4RightUpperArm: mirror(flipYaw(leftArm)),
      v4LeftForearm: [
        [-0.62, 0.02, -0.28],
        [-0.61, 0.018, -0.275],
        [-0.6, 0.015, -0.27],
        [-0.61, 0.012, -0.275],
        [-0.62, 0.015, -0.28],
        [-0.63, 0.018, -0.285],
        [-0.64, 0.02, -0.29],
        [-0.63, 0.022, -0.285],
        [-0.62, 0.02, -0.28],
      ],
      v4RightForearm: mirror([
        [-0.62, 0.02, -0.28],
        [-0.61, 0.018, -0.275],
        [-0.6, 0.015, -0.27],
        [-0.61, 0.012, -0.275],
        [-0.62, 0.015, -0.28],
        [-0.63, 0.018, -0.285],
        [-0.64, 0.02, -0.29],
        [-0.63, 0.022, -0.285],
        [-0.62, 0.02, -0.28],
      ]),
      v4LeftHand: staticKeys(times, [0, 0.02, -0.04]),
      v4RightHand: staticKeys(times, [0, -0.02, 0.04]),
      v4LeftUpperLeg: leftUpperLeg,
      v4RightUpperLeg: rightUpperLeg,
      v4LeftLowerLeg: leftLowerLeg,
      v4RightLowerLeg: rightLowerLeg,
      v4LeftFoot: [
        [-0.24, 0, 0],
        [-0.12, 0, 0],
        [0.04, 0, 0],
        [0.14, 0, 0],
        [0.22, 0, 0],
        [0.1, 0, 0],
        [-0.06, 0, 0],
        [-0.18, 0, 0],
        [-0.24, 0, 0],
      ],
      v4RightFoot: [
        [0.22, 0, 0],
        [0.1, 0, 0],
        [-0.06, 0, 0],
        [-0.18, 0, 0],
        [-0.24, 0, 0],
        [-0.12, 0, 0],
        [0.04, 0, 0],
        [0.14, 0, 0],
        [0.22, 0, 0],
      ],
    },
  );
}

function createV4Clips(): Readonly<Record<V4Sport, THREE.AnimationClip>> {
  return Object.freeze({
    rower: createRowCycleClip(),
    skier: createSkiCycleClip(),
    bike: createBikeCycleClip(),
  });
}

function createV4Material(): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    // Vertex colour carries the semantic skin/kit palette; a white base avoids
    // multiplying every region by the jersey colour before lane styling.
    color: 0xffffff,
    vertexColors: true,
    // Matte performance kit: high/ultra VSM rim light should soften seams, not
    // polish every loft join into a shiny hard edge.
    roughness: 0.78,
    metalness: 0,
    sheen: 0.02,
    sheenColor: new THREE.Color(0x6e8496),
    sheenRoughness: 0.95,
    clearcoat: 0,
    clearcoatRoughness: 1,
    flatShading: false,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
}

/** Build the self-contained, repository-authored V4 generic athlete asset. */
export function createV4AthleteAsset(): V4AthleteAsset {
  const root = new THREE.Group();
  root.name = V4_ROOT_NAME;
  root.userData = {
    replayRigVersion: 4,
    replayAssetRole: "production-skinned-athlete",
    source: "repository-authored Blender 5 parametric skinned athlete",
    licence: "MIT",
    genericCanonicalTechnique: true,
    replayClipNames: V4_CLIP_NAMES,
    replayDriveEnd: V4_DRIVE_END,
    replayPhaseSchemas: V4_PHASE_SCHEMAS,
    replayContactOffsets: V4_CONTACT_OFFSETS,
  };

  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), createV4Material());
  mesh.name = V4_RIG_NAME;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The analytic post-clip contact pass can move hands/feet beyond bind-pose
  // bounds. A future pose-aware bound may replace this conservative policy.
  mesh.frustumCulled = false;
  root.add(mesh);

  const { skeleton, bones, effectors } = buildBones(mesh);
  mesh.geometry.dispose();
  mesh.geometry = createAthleteGeometry(bones);
  mesh.bind(skeleton);
  mesh.normalizeSkinWeights();

  const clips = createV4Clips();
  const mixer = new THREE.AnimationMixer(root);
  const actions = {} as Record<V4Sport, THREE.AnimationAction>;
  for (const sport of Object.keys(clips) as V4Sport[]) {
    const action = mixer.clipAction(clips[sport]);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.enabled = true;
    action.setEffectiveWeight(sport === "rower" ? 1 : 0);
    action.play();
    actions[sport] = action;
  }

  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.getIndex();
  if (!index) throw new Error("V4 athlete must remain indexed");
  const metrics: V4RigMetrics = Object.freeze({
    bones: skeleton.bones.length,
    vertices: position.count,
    triangles: index.count / 3,
    clips: Object.keys(clips).length,
    clipTracks: Object.values(clips).reduce((count, clip) => count + clip.tracks.length, 0),
    contactEffectors: Object.keys(effectors).length,
    materialSlots: Array.isArray(mesh.material) ? mesh.material.length : 1,
  });

  const asset: V4AthleteAsset = {
    root,
    mesh,
    skeleton,
    bones,
    effectors,
    clips,
    clip: clips.rower,
    mixer,
    actions: Object.freeze(actions),
    action: actions.rower,
    metrics,
  };
  return sampleV4AthleteAsset(asset, "rower", 0);
}

/**
 * Sample an exact clip time without integrating a frame delta. This is the
 * replay seam: the caller owns wall-clock/stroke phase and can always seek to
 * the same pose, including after pause/scrub/ghost comparison.
 */
export function sampleV4AthleteAsset(
  asset: V4AthleteAsset,
  sport: V4Sport,
  seconds: number,
): V4AthleteAsset {
  if (!Number.isFinite(seconds)) throw new Error("V4 athlete sample time must be finite");
  for (const key of Object.keys(asset.actions) as V4Sport[]) {
    asset.actions[key].setEffectiveWeight(key === sport ? 1 : 0);
  }
  asset.mixer.setTime(seconds);
  asset.root.updateMatrixWorld(true);
  asset.skeleton.update();
  return asset;
}

/** Dispose an authoring/test instance. Runtime clones own their own lifecycle. */
export function disposeV4AthleteAsset(asset: V4AthleteAsset): void {
  asset.mixer.stopAllAction();
  for (const sport of Object.keys(asset.clips) as V4Sport[]) {
    asset.mixer.uncacheAction(asset.clips[sport]);
    asset.mixer.uncacheClip(asset.clips[sport]);
  }
  asset.mixer.uncacheRoot(asset.root);
  asset.mesh.geometry.dispose();
  const materials = Array.isArray(asset.mesh.material)
    ? asset.mesh.material
    : [asset.mesh.material];
  for (const material of materials) material.dispose();
  asset.skeleton.dispose();
  asset.root.removeFromParent();
}
