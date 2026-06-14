/**
 * Rigged humanoid avatar builder.
 *
 * Creates a proper SkinnedMesh with a Skeleton so the body deforms smoothly
 * under bone transforms instead of using separately-positioned primitive meshes.
 *
 * Bone hierarchy (17 bones):
 *
 *   Hips ─ Spine ─ Chest ─ Neck ─ Head
 *            │
 *            ├─ LeftUpLeg ─ LeftLeg ─ LeftFoot
 *            ├─ RightUpLeg ─ RightLeg ─ RightFoot
 *            ├─ LeftArm ─ LeftForeArm ─ LeftHand
 *            └─ RightArm ─ RightForeArm ─ RightHand
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ── Bone index enum ─────────────────────────────────────────────────────────

export const enum BoneIdx {
  Hips,
  Spine,
  Chest,
  Neck,
  Head,
  LeftUpLeg,
  LeftLeg,
  LeftFoot,
  RightUpLeg,
  RightLeg,
  RightFoot,
  LeftArm,
  LeftForeArm,
  LeftHand,
  RightArm,
  RightForeArm,
  RightHand,
}

/** Total number of bones in the skeleton. */
export const BONE_COUNT = 17;

// ── Bone definitions (bind pose / T-pose) ───────────────────────────────────

interface BoneDef {
  name: string;
  parent: number; // -1 for root
  pos: [number, number, number]; // local position relative to parent
}

const BONES: BoneDef[] = [
  /*  0 Hips        */ { name: "Hips", parent: -1, pos: [0, 0.95, 0] },
  /*  1 Spine       */ { name: "Spine", parent: 0, pos: [0, 0.15, 0] },
  /*  2 Chest       */ { name: "Chest", parent: 1, pos: [0, 0.2, 0] },
  /*  3 Neck        */ { name: "Neck", parent: 2, pos: [0, 0.15, 0] },
  /*  4 Head        */ { name: "Head", parent: 3, pos: [0, 0.1, 0] },
  /*  5 LeftUpLeg   */ { name: "LeftUpLeg", parent: 0, pos: [-0.12, 0, 0] },
  /*  6 LeftLeg     */ { name: "LeftLeg", parent: 5, pos: [0, -0.42, 0] },
  /*  7 LeftFoot    */ { name: "LeftFoot", parent: 6, pos: [0, -0.4, 0] },
  /*  8 RightUpLeg  */ { name: "RightUpLeg", parent: 0, pos: [0.12, 0, 0] },
  /*  9 RightLeg    */ { name: "RightLeg", parent: 8, pos: [0, -0.42, 0] },
  /* 10 RightFoot   */ { name: "RightFoot", parent: 9, pos: [0, -0.4, 0] },
  /* 11 LeftArm     */ { name: "LeftArm", parent: 2, pos: [-0.24, 0.05, 0] },
  /* 12 LeftForeArm */ { name: "LeftForeArm", parent: 11, pos: [-0.28, 0, 0] },
  /* 13 LeftHand    */ { name: "LeftHand", parent: 12, pos: [-0.25, 0, 0] },
  /* 14 RightArm    */ { name: "RightArm", parent: 2, pos: [0.24, 0.05, 0] },
  /* 15 RightForeArm*/ { name: "RightForeArm", parent: 14, pos: [0.28, 0, 0] },
  /* 16 RightHand   */ { name: "RightHand", parent: 15, pos: [0.25, 0, 0] },
];

// ── Body part geometry specs ────────────────────────────────────────────────

interface BodyPart {
  geo: THREE.BufferGeometry;
  /** Bones whose line segments are relevant for distance-based weighting. */
  weightBones: number[];
}

// Reusable vectors for geometry transforms
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _forward = new THREE.Vector3(0, 1, 0);

/**
 * Build a capsule geometry oriented so its cylinder spans from `start` to `end`
 * in world space. The result is a BufferGeometry whose vertices live in world
 * space (ready to be merged).
 */
function capsuleSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  lengthSegments = 5,
  radialSegments = 10,
): THREE.BufferGeometry {
  const len = start.distanceTo(end);
  const geo = new THREE.CapsuleGeometry(
    radius,
    Math.max(0.001, len - radius * 2),
    lengthSegments,
    radialSegments,
  );
  if (len < 0.001) return geo;

  const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
  const dir = new THREE.Vector3().subVectors(end, start).normalize();
  _quat.setFromUnitVectors(_forward, dir);
  _mat4.compose(mid, _quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(_mat4);
  geo.computeVertexNormals();
  return geo;
}

/** Build all body-part geometries positioned in T-pose world space. */
function buildBodyParts(boneWorldPos: THREE.Vector3[]): BodyPart[] {
  const parts: BodyPart[] = [];

  // ── T-pose anchor points ──────────────────────────────────────────────
  const L_SHOULDER = new THREE.Vector3(-0.24, 1.47, 0);
  const R_SHOULDER = new THREE.Vector3(0.24, 1.47, 0);
  const L_ELBOW = new THREE.Vector3(-0.52, 1.47, 0);
  const R_ELBOW = new THREE.Vector3(0.52, 1.47, 0);
  const L_WRIST = new THREE.Vector3(-0.77, 1.47, 0);
  const R_WRIST = new THREE.Vector3(0.77, 1.47, 0);

  // ── Torso ─────────────────────────────────────────────────────────────
  const torsoGeo = capsuleSegment(
    boneWorldPos[BoneIdx.Hips],
    boneWorldPos[BoneIdx.Chest],
    0.24,
    5,
    12,
  );
  parts.push({
    geo: torsoGeo,
    weightBones: [BoneIdx.Hips, BoneIdx.Spine, BoneIdx.Chest],
  });

  // Shoulder bridge
  const shoulderGeo = capsuleSegment(L_SHOULDER, R_SHOULDER, 0.06, 4, 8);
  parts.push({
    geo: shoulderGeo,
    weightBones: [BoneIdx.Chest, BoneIdx.LeftArm, BoneIdx.RightArm],
  });

  // ── Head ──────────────────────────────────────────────────────────────
  const headGeo = new THREE.SphereGeometry(0.125, 16, 12);
  headGeo.translate(
    boneWorldPos[BoneIdx.Head].x,
    boneWorldPos[BoneIdx.Head].y,
    boneWorldPos[BoneIdx.Head].z,
  );
  headGeo.computeVertexNormals();
  parts.push({ geo: headGeo, weightBones: [BoneIdx.Head, BoneIdx.Neck] });

  // ── Left leg ──────────────────────────────────────────────────────────
  const lThighGeo = capsuleSegment(
    boneWorldPos[BoneIdx.LeftUpLeg],
    boneWorldPos[BoneIdx.LeftLeg],
    0.1,
    5,
    10,
  );
  parts.push({
    geo: lThighGeo,
    weightBones: [BoneIdx.LeftUpLeg, BoneIdx.LeftLeg],
  });

  const lShinGeo = capsuleSegment(
    boneWorldPos[BoneIdx.LeftLeg],
    boneWorldPos[BoneIdx.LeftFoot],
    0.08,
    5,
    10,
  );
  parts.push({
    geo: lShinGeo,
    weightBones: [BoneIdx.LeftLeg, BoneIdx.LeftFoot],
  });

  // Left knee sphere
  const lKneeGeo = new THREE.SphereGeometry(0.1, 10, 8);
  lKneeGeo.translate(
    boneWorldPos[BoneIdx.LeftLeg].x,
    boneWorldPos[BoneIdx.LeftLeg].y,
    boneWorldPos[BoneIdx.LeftLeg].z,
  );
  lKneeGeo.computeVertexNormals();
  parts.push({
    geo: lKneeGeo,
    weightBones: [BoneIdx.LeftUpLeg, BoneIdx.LeftLeg],
  });

  // ── Right leg (mirror) ────────────────────────────────────────────────
  const rThighGeo = capsuleSegment(
    boneWorldPos[BoneIdx.RightUpLeg],
    boneWorldPos[BoneIdx.RightLeg],
    0.1,
    5,
    10,
  );
  parts.push({
    geo: rThighGeo,
    weightBones: [BoneIdx.RightUpLeg, BoneIdx.RightLeg],
  });

  const rShinGeo = capsuleSegment(
    boneWorldPos[BoneIdx.RightLeg],
    boneWorldPos[BoneIdx.RightFoot],
    0.08,
    5,
    10,
  );
  parts.push({
    geo: rShinGeo,
    weightBones: [BoneIdx.RightLeg, BoneIdx.RightFoot],
  });

  const rKneeGeo = new THREE.SphereGeometry(0.1, 10, 8);
  rKneeGeo.translate(
    boneWorldPos[BoneIdx.RightLeg].x,
    boneWorldPos[BoneIdx.RightLeg].y,
    boneWorldPos[BoneIdx.RightLeg].z,
  );
  rKneeGeo.computeVertexNormals();
  parts.push({
    geo: rKneeGeo,
    weightBones: [BoneIdx.RightUpLeg, BoneIdx.RightLeg],
  });

  // ── Left arm ──────────────────────────────────────────────────────────
  const lUpperGeo = capsuleSegment(L_SHOULDER, L_ELBOW, 0.08, 4, 8);
  parts.push({
    geo: lUpperGeo,
    weightBones: [BoneIdx.LeftArm, BoneIdx.LeftForeArm],
  });

  const lForeGeo = capsuleSegment(L_ELBOW, L_WRIST, 0.065, 4, 8);
  parts.push({
    geo: lForeGeo,
    weightBones: [BoneIdx.LeftForeArm, BoneIdx.LeftHand],
  });

  // Left elbow sphere
  const lElbowGeo = new THREE.SphereGeometry(0.07, 8, 6);
  lElbowGeo.translate(L_ELBOW.x, L_ELBOW.y, L_ELBOW.z);
  lElbowGeo.computeVertexNormals();
  parts.push({
    geo: lElbowGeo,
    weightBones: [BoneIdx.LeftArm, BoneIdx.LeftForeArm],
  });

  // ── Right arm (mirror) ────────────────────────────────────────────────
  const rUpperGeo = capsuleSegment(R_SHOULDER, R_ELBOW, 0.08, 4, 8);
  parts.push({
    geo: rUpperGeo,
    weightBones: [BoneIdx.RightArm, BoneIdx.RightForeArm],
  });

  const rForeGeo = capsuleSegment(R_ELBOW, R_WRIST, 0.065, 4, 8);
  parts.push({
    geo: rForeGeo,
    weightBones: [BoneIdx.RightForeArm, BoneIdx.RightHand],
  });

  const rElbowGeo = new THREE.SphereGeometry(0.07, 8, 6);
  rElbowGeo.translate(R_ELBOW.x, R_ELBOW.y, R_ELBOW.z);
  rElbowGeo.computeVertexNormals();
  parts.push({
    geo: rElbowGeo,
    weightBones: [BoneIdx.RightArm, BoneIdx.RightForeArm],
  });

  // ── Hands ─────────────────────────────────────────────────────────────
  for (const [wrist, bone] of [
    [L_WRIST, BoneIdx.LeftHand],
    [R_WRIST, BoneIdx.RightHand],
  ] as const) {
    const handGeo = new THREE.SphereGeometry(0.04, 6, 6);
    handGeo.scale(1, 0.6, 1.2);
    handGeo.translate(wrist.x, wrist.y, wrist.z);
    handGeo.computeVertexNormals();
    parts.push({ geo: handGeo, weightBones: [bone, bone] });
  }

  // ── Feet ──────────────────────────────────────────────────────────────
  for (const [footIdx, bone] of [
    [BoneIdx.LeftFoot, BoneIdx.LeftFoot],
    [BoneIdx.RightFoot, BoneIdx.RightFoot],
  ] as const) {
    const fp = boneWorldPos[footIdx];
    const footGeo = new THREE.BoxGeometry(0.08, 0.04, 0.16);
    _mat4.compose(
      new THREE.Vector3(fp.x, fp.y - 0.02, fp.z + 0.04),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    footGeo.applyMatrix4(_mat4);
    footGeo.computeVertexNormals();
    parts.push({ geo: footGeo, weightBones: [bone, bone] });
  }

  // ── Shoulder spheres ──────────────────────────────────────────────────
  for (const [pos, bone] of [
    [L_SHOULDER, BoneIdx.LeftArm],
    [R_SHOULDER, BoneIdx.RightArm],
  ] as const) {
    const geo = new THREE.SphereGeometry(0.09, 8, 6);
    geo.translate(pos.x, pos.y, pos.z);
    geo.computeVertexNormals();
    parts.push({ geo, weightBones: [BoneIdx.Chest, bone] });
  }

  // ── Hip spheres ───────────────────────────────────────────────────────
  for (const [legBone, pos] of [
    [BoneIdx.LeftUpLeg, new THREE.Vector3(-0.12, 0.95, 0)],
    [BoneIdx.RightUpLeg, new THREE.Vector3(0.12, 0.95, 0)],
  ] as const) {
    const geo = new THREE.SphereGeometry(0.11, 8, 6);
    geo.translate(pos.x, pos.y, pos.z);
    geo.computeVertexNormals();
    parts.push({ geo, weightBones: [BoneIdx.Hips, legBone] });
  }

  return parts;
}

// ── Skin weight helpers ─────────────────────────────────────────────────────

/**
 * Minimum distance from point `p` to the line segment `a → b`.
 */
function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = _tmpV1.subVectors(b, a);
  const ap = _tmpV2.subVectors(p, a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
  return p.distanceTo(_tmpV3.copy(a).addScaledVector(ab, t));
}

const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();

/**
 * Assign per-vertex skin indices and weights using distance-based blending.
 *
 * Each vertex is influenced by the two nearest bones (among `weightBones`),
 * with inverse-distance-squared weighting and normalisation so weights sum to 1.
 */
function assignSkinWeights(
  positions: THREE.BufferAttribute,
  skinIndex: THREE.Uint16BufferAttribute,
  skinWeight: THREE.Float32BufferAttribute,
  parts: BodyPart[],
  boneWorldPos: THREE.Vector3[],
): void {
  let offset = 0;
  const p = new THREE.Vector3();

  for (const part of parts) {
    const partCount = part.geo.attributes.position.count;
    const bones = part.weightBones;
    // Deduplicate bones so the fallback logic picks correctly
    const uniqueBones = [...new Set(bones)];

    for (let i = 0; i < partCount; i++) {
      p.fromBufferAttribute(positions, offset + i);

      // Compute inverse-distance-squared weights against each unique bone
      let bestBone = uniqueBones[0];
      let bestDist = Infinity;
      let secondBone = uniqueBones.length > 1 ? uniqueBones[1] : uniqueBones[0];
      let secondDist = Infinity;

      for (const bi of uniqueBones) {
        // For single-point bones (e.g. Head), distance is point-to-point
        const a = boneWorldPos[bi];
        // Heuristic: bones with children use a short segment to their child;
        // leaf bones are treated as points.  The segment direction adds a
        // small amount of extent that prevents sharp weight boundaries.
        const parentIdx = BONES[bi].parent;
        const d = parentIdx >= 0 ? distToSegment(p, boneWorldPos[parentIdx], a) : p.distanceTo(a);

        if (d < bestDist) {
          secondBone = bestBone;
          secondDist = bestDist;
          bestBone = bi;
          bestDist = d;
        } else if (d < secondDist) {
          secondBone = bi;
          secondDist = d;
        }
      }

      // Inverse-distance-squared weighting
      const w1 = 1 / (bestDist * bestDist + 1e-10);
      const w2 = bestBone === secondBone ? 0 : 1 / (secondDist * secondDist + 1e-10);
      const sum = w1 + w2;

      const vi = offset + i;
      skinIndex.setX(vi, bestBone);
      skinIndex.setY(vi, secondBone);
      skinIndex.setZ(vi, 0);
      skinIndex.setW(vi, 0);

      skinWeight.setX(vi, w1 / sum);
      skinWeight.setY(vi, w2 / sum);
      skinWeight.setZ(vi, 0);
      skinWeight.setW(vi, 0);
    }

    offset += partCount;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a rigged humanoid avatar as a `THREE.SkinnedMesh`.
 *
 * The returned mesh is ready to add to a scene.  Drive animation by
 * manipulating `mesh.skeleton.bones[i].position` / `.quaternion` directly.
 *
 * @param material - Material shared by every body part.
 * @param segments - Radial segments for capsule / sphere geometries (default
 *   matches the spec's ~10 for limbs, 16 for head).
 */
export function createRiggedAvatar(material: THREE.Material): THREE.SkinnedMesh {
  // ── 1. Build bones ────────────────────────────────────────────────────
  const bones: THREE.Bone[] = [];
  const boneWorldPos: THREE.Vector3[] = [];

  for (let i = 0; i < BONES.length; i++) {
    const def = BONES[i];
    const bone = new THREE.Bone();
    bone.name = def.name;
    bone.position.set(def.pos[0], def.pos[1], def.pos[2]);
    if (def.parent >= 0) {
      bones[def.parent].add(bone);
    }
    bone.updateMatrixWorld(true);
    bones.push(bone);
    boneWorldPos.push(bone.getWorldPosition(new THREE.Vector3()));
  }

  // ── 2. Build body-part geometries ─────────────────────────────────────
  const parts = buildBodyParts(boneWorldPos);

  // ── 3. Merge into a single geometry ───────────────────────────────────
  const merged = mergeGeometries(parts.map((p) => p.geo))!;

  // ── 4. Assign skin weights ────────────────────────────────────────────
  const posAttr = merged.attributes.position as THREE.BufferAttribute;
  const vCount = posAttr.count;
  const skinIndex = new THREE.Uint16BufferAttribute(vCount * 4, 4);
  const skinWeight = new THREE.Float32BufferAttribute(vCount * 4, 4);
  assignSkinWeights(posAttr, skinIndex, skinWeight, parts, boneWorldPos);

  merged.setAttribute("skinIndex", skinIndex);
  merged.setAttribute("skinWeight", skinWeight);

  // ── 5. Create skeleton and bind ───────────────────────────────────────
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.add(bones[0]);
  mesh.bind(skeleton);

  return mesh;
}
