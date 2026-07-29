import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const DEFAULT_ASSET = "static/replay-assets/rowplay-athlete-v4.glb";
// Hard surface rebuild: athletic form language needs denser remesh and
// continuous facial planes. Ceiling stays bounded for live+ghost clone
// delivery on Workers static assets, but no longer forces mannequin density.
const MAX_FILE_BYTES = 24_000 * 1024;
const MIN_VERTICES = 4_500;
const MAX_VERTICES = 220_000;
const MIN_TRIANGLES = 8_500;
const MAX_TRIANGLES = 450_000;
// A production surface may keep deliberate detail parts (eyes, hair, fingers,
// shoes), so exact component counts are inventory rather than an art-quality
// proxy. Core continuity is checked by skin role below.
const MIN_COMPONENTS = 1;
const MAX_COMPONENTS = 256;
const SOURCE_DESCRIPTION =
  "RowPlay-authored Blender 5 athlete derived from Blender Human Base Meshes v1.4.1 (CC0)";
const LICENCE_DESCRIPTION = "MIT AND CC0-1.0";
const CORE_CONTINUITY_BONES = [
  "v4LeftUpperArm",
  "v4LeftForearm",
  "v4RightUpperArm",
  "v4RightForearm",
  "v4LeftUpperLeg",
  "v4LeftLowerLeg",
  "v4RightUpperLeg",
  "v4RightLowerLeg",
];
const CORE_WEIGHT_THRESHOLD = 0.08;
const CORE_CONNECTED_FRACTION = 0.6;
const MIN_CORE_INFLUENCED_VERTICES = 80;
const MIN_GRIP_HELPER_INFLUENCED_VERTICES = 18;
const MIN_FOREARM_DEFORMATION_INFLUENCED_VERTICES = 80;

const BONE_NAMES = [
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
];

const CLIPS = [
  { sport: "rower", name: "rowplay-v4-row-cycle", driveEnd: 0.38 },
  { sport: "skierg", name: "rowplay-v4-ski-cycle", driveEnd: 0.34 },
  { sport: "bike", name: "rowplay-v4-bike-cycle", driveEnd: 0.5 },
];

const CONTACTS = new Map([
  ["v4LeftHand", { role: "left-hand", offset: [-0.08, -0.01, 0.035] }],
  ["v4RightHand", { role: "right-hand", offset: [0.08, -0.01, 0.035] }],
  ["v4LeftFoot", { role: "left-foot", offset: [0, -0.055, 0.13] }],
  ["v4RightFoot", { role: "right-foot", offset: [0, -0.055, 0.13] }],
]);

const FOREARM_DEFORMATION_HELPER_PARENTS = new Map([
  ["v4LeftForearmTwistProximal", "v4LeftForearm"],
  ["v4LeftForearmTwistDistal", "v4LeftForearm"],
  ["v4LeftWristCorrective", "v4LeftForearm"],
  ["v4RightForearmTwistProximal", "v4RightForearm"],
  ["v4RightForearmTwistDistal", "v4RightForearm"],
  ["v4RightWristCorrective", "v4RightForearm"],
]);

function expectedGripHelperParent(name) {
  const match = /^v4(Left|Right)(.+)$/.exec(name);
  if (!match) return null;
  const [, side, suffix] = match;
  if (suffix === "Fingers" || suffix === "Thumb") return `v4${side}Hand`;
  if (suffix === "ThumbIntermediate") return `v4${side}Thumb`;
  if (suffix === "ThumbDistal") return `v4${side}ThumbIntermediate`;
  const digit = /^(Index|Middle|Pinky|Ring)(Proximal|Intermediate|Distal)$/.exec(suffix);
  if (!digit) return null;
  const [, digitName, stage] = digit;
  if (stage === "Proximal") return `v4${side}Fingers`;
  if (stage === "Intermediate") return `v4${side}${digitName}Proximal`;
  return `v4${side}${digitName}Intermediate`;
}

function expectedHelperParent(name) {
  return FOREARM_DEFORMATION_HELPER_PARENTS.get(name) ?? expectedGripHelperParent(name);
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sameNumberArray(actual, expected, epsilon = 1e-6) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(
      (value, index) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value - expected[index]) <= epsilon,
    )
  );
}

function finiteNumberArray(value, components, description) {
  invariant(
    Array.isArray(value) &&
      value.length === components &&
      value.every((component) => typeof component === "number" && Number.isFinite(component)),
    `V4 ${description} must contain ${components} finite components`,
  );
  return value;
}

function restLocalTransform(node, description) {
  return {
    translation: finiteNumberArray(node.translation ?? [0, 0, 0], 3, `${description} translation`),
    rotationQuaternion: finiteNumberArray(
      node.rotation ?? [0, 0, 0, 1],
      4,
      `${description} rotation`,
    ),
    scale: finiteNumberArray(node.scale ?? [1, 1, 1], 3, `${description} scale`),
  };
}

function readGlb(bytes) {
  invariant(bytes.byteLength >= 20, "V4 file is too short to be a GLB");
  invariant(bytes.readUInt32LE(0) === 0x46546c67, "V4 GLB has invalid magic");
  invariant(bytes.readUInt32LE(4) === 2, "V4 asset must use glTF 2.0");
  invariant(bytes.readUInt32LE(8) === bytes.byteLength, "V4 GLB length mismatch");
  const jsonLength = bytes.readUInt32LE(12);
  invariant(bytes.readUInt32LE(16) === 0x4e4f534a, "V4 first GLB chunk must be JSON");
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  invariant(jsonEnd + 8 <= bytes.byteLength, "V4 GLB JSON chunk is truncated");
  const binaryLength = bytes.readUInt32LE(jsonEnd);
  invariant(bytes.readUInt32LE(jsonEnd + 4) === 0x004e4942, "V4 second chunk must be binary");
  const binaryStart = jsonEnd + 8;
  invariant(binaryStart + binaryLength === bytes.byteLength, "V4 GLB has trailing data");
  const document = JSON.parse(bytes.subarray(jsonStart, jsonEnd).toString("utf8").trim());
  return { document, binary: bytes.subarray(binaryStart) };
}

const TYPE_COMPONENTS = new Map([
  ["SCALAR", 1],
  ["VEC2", 2],
  ["VEC3", 3],
  ["VEC4", 4],
  ["MAT4", 16],
]);

const COMPONENT_BYTES = new Map([
  [5121, 1],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);

function readComponent(binary, componentType, offset) {
  if (componentType === 5121) return binary.readUInt8(offset);
  if (componentType === 5123) return binary.readUInt16LE(offset);
  if (componentType === 5125) return binary.readUInt32LE(offset);
  if (componentType === 5126) return binary.readFloatLE(offset);
  throw new Error(`V4 accessor uses unsupported component type ${componentType}`);
}

function readAccessor(document, binary, accessorIndex) {
  const accessor = document.accessors?.[accessorIndex];
  invariant(accessor, `V4 accessor ${accessorIndex} is missing`);
  invariant(accessor.sparse === undefined, `V4 accessor ${accessorIndex} must not be sparse`);
  invariant(accessor.normalized !== true, `V4 accessor ${accessorIndex} must not be normalized`);
  const view = document.bufferViews?.[accessor.bufferView];
  invariant(view, `V4 accessor ${accessorIndex} has no buffer view`);
  invariant(view.buffer === 0, `V4 accessor ${accessorIndex} must use embedded buffer 0`);
  const components = TYPE_COMPONENTS.get(accessor.type);
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType);
  invariant(components && componentBytes, `V4 accessor ${accessorIndex} has invalid type`);
  const packedBytes = components * componentBytes;
  const stride = view.byteStride ?? packedBytes;
  invariant(stride >= packedBytes, `V4 accessor ${accessorIndex} has an invalid stride`);
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  invariant(
    start + (accessor.count - 1) * stride + packedBytes <= binary.byteLength,
    `V4 accessor ${accessorIndex} exceeds the binary chunk`,
  );
  const values = [];
  for (let item = 0; item < accessor.count; item++) {
    const tuple = [];
    for (let component = 0; component < components; component++) {
      tuple.push(
        readComponent(
          binary,
          accessor.componentType,
          start + item * stride + component * componentBytes,
        ),
      );
    }
    values.push(tuple);
  }
  return { accessor, values };
}

function connectedComponents(vertexCount, indices, positions) {
  const parent = Array.from({ length: vertexCount }, (_, vertex) => vertex);
  const find = (vertex) => {
    let root = vertex;
    while (parent[root] !== root) root = parent[root];
    while (parent[vertex] !== vertex) {
      const next = parent[vertex];
      parent[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  // glTF splits otherwise identical vertices at UV island boundaries. Count
  // authored surface islands, not those GPU attribute seams, so the contract
  // continues to describe whether the athlete is a coherent body mass.
  const canonicalVertex = new Map();
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const position = positions[vertex];
    const key = `${position[0]},${position[1]},${position[2]}`;
    const existing = canonicalVertex.get(key);
    if (existing === undefined) canonicalVertex.set(key, vertex);
    else union(vertex, existing);
  }
  for (let offset = 0; offset < indices.length; offset += 3) {
    union(indices[offset], indices[offset + 1]);
    union(indices[offset + 1], indices[offset + 2]);
  }
  const sizesByRoot = new Map();
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const root = find(vertex);
    sizesByRoot.set(root, (sizesByRoot.get(root) ?? 0) + 1);
  }
  const ranked = [...sizesByRoot.entries()].sort((left, right) => right[1] - left[1]);
  const rankByRoot = new Map(ranked.map(([root], rank) => [root, rank]));
  return {
    sizes: ranked.map(([, size]) => size),
    componentByVertex: Array.from({ length: vertexCount }, (_, vertex) =>
      rankByRoot.get(find(vertex)),
    ),
  };
}

function validateCoreContinuity(loadedBoneNames, joints, weights, componentByVertex, options) {
  const allowDisconnectedReferenceTopology = options.allowDisconnectedReferenceTopology === true;
  const hipsIndex = loadedBoneNames.indexOf("v4Hips");
  invariant(hipsIndex >= 0, "V4 topology validation cannot find v4Hips");
  let torsoVertices = 0;
  for (let vertex = 0; vertex < joints.values.length; vertex++) {
    let hipWeight = 0;
    for (let influence = 0; influence < joints.values[vertex].length; influence++) {
      if (joints.values[vertex][influence] === hipsIndex) {
        hipWeight += weights.values[vertex][influence];
      }
    }
    if (hipWeight >= CORE_WEIGHT_THRESHOLD && componentByVertex[vertex] === 0) {
      torsoVertices++;
    }
  }
  invariant(
    torsoVertices >= MIN_CORE_INFLUENCED_VERTICES,
    "V4 largest topology component is not the pelvis/torso core",
  );

  const bones = [];
  for (const name of CORE_CONTINUITY_BONES) {
    const jointIndex = loadedBoneNames.indexOf(name);
    invariant(jointIndex >= 0, `V4 topology validation cannot find ${name}`);
    let influencedVertices = 0;
    let connectedVertices = 0;
    for (let vertex = 0; vertex < joints.values.length; vertex++) {
      let boneWeight = 0;
      for (let influence = 0; influence < joints.values[vertex].length; influence++) {
        if (joints.values[vertex][influence] === jointIndex) {
          boneWeight += weights.values[vertex][influence];
        }
      }
      if (boneWeight < CORE_WEIGHT_THRESHOLD) continue;
      influencedVertices++;
      if (componentByVertex[vertex] === 0) connectedVertices++;
    }
    invariant(
      influencedVertices >= MIN_CORE_INFLUENCED_VERTICES,
      `V4 ${name} has too little authored surface for continuity validation`,
    );
    const connectedFraction = connectedVertices / influencedVertices;
    if (!allowDisconnectedReferenceTopology) {
      invariant(
        connectedFraction >= CORE_CONNECTED_FRACTION,
        `V4 ${name} is detached from the pelvis/torso core (${connectedVertices}/${influencedVertices} connected vertices)`,
      );
    }
    bones.push({
      name,
      influencedVertices,
      connectedVertices,
      connectedFraction,
    });
  }
  return {
    torsoVertices,
    requiredConnectedFraction: CORE_CONNECTED_FRACTION,
    strict: !allowDisconnectedReferenceTopology,
    bones,
  };
}

export async function validateV4Asset(assetPath = DEFAULT_ASSET, options = {}) {
  const resolvedPath = resolve(assetPath);
  const bytes = await readFile(resolvedPath);
  invariant(bytes.byteLength <= MAX_FILE_BYTES, `V4 asset exceeds ${MAX_FILE_BYTES} bytes`);
  const { document, binary } = readGlb(bytes);

  invariant(document.asset?.version === "2.0", "V4 JSON asset.version must be 2.0");
  invariant(
    document.scene === 0 && document.scenes?.length === 1,
    "V4 must have one default scene",
  );
  invariant(!document.extensionsRequired?.length, "V4 must not require glTF extensions");
  const allowedExtensions = new Set(["KHR_materials_clearcoat", "KHR_materials_sheen"]);
  invariant(
    (document.extensionsUsed ?? []).every((extension) => allowedExtensions.has(extension)),
    "V4 uses an unreviewed glTF extension",
  );
  for (const collection of ["cameras", "images", "textures", "samplers"]) {
    invariant(!document[collection]?.length, `V4 ${collection} must remain empty`);
  }
  invariant(document.buffers?.length === 1, "V4 must contain one embedded buffer");
  invariant(document.buffers[0].uri === undefined, "V4 external/data URI buffers are forbidden");
  invariant(document.buffers[0].byteLength <= binary.byteLength, "V4 embedded buffer is truncated");

  invariant(document.scenes[0].nodes?.length === 1, "V4 scene must expose one root");
  const root = document.nodes[document.scenes[0].nodes[0]];
  invariant(root?.name === "rowplay-v4-athlete-root", "V4 root name is invalid");
  invariant(root.extras?.replayRigVersion === 4, "V4 root version metadata is missing");
  invariant(
    root.extras?.replayAssetRole === "production-skinned-athlete",
    "V4 is not product-marked",
  );
  invariant(root.extras?.source === SOURCE_DESCRIPTION, "V4 source metadata is invalid");
  invariant(root.extras?.licence === LICENCE_DESCRIPTION, "V4 licence metadata is invalid");

  invariant(document.skins?.length === 1, "V4 must contain exactly one skin");
  const skin = document.skins[0];
  invariant(
    Array.isArray(skin.joints) && skin.joints.length >= BONE_NAMES.length,
    "V4 skin must include every semantic joint",
  );
  invariant(
    document.nodes.length >= skin.joints.length + 6,
    "V4 must contain root, mesh, skin joints, and contact markers",
  );
  const loadedBoneNames = skin.joints.map((nodeIndex) => document.nodes[nodeIndex]?.name);
  invariant(
    loadedBoneNames.every((name) => typeof name === "string" && name.length > 0),
    "V4 skin has a missing joint name",
  );
  invariant(
    new Set(loadedBoneNames).size === loadedBoneNames.length,
    "V4 skin has duplicate joint names",
  );
  const semanticNames = new Set(BONE_NAMES);
  const semanticBoneNames = loadedBoneNames.filter((name) => semanticNames.has(name));
  invariant(
    JSON.stringify(semanticBoneNames) === JSON.stringify(BONE_NAMES),
    "V4 semantic bone order drifted",
  );
  invariant(document.nodes[skin.skeleton]?.name === "v4Hips", "V4 skeleton root must be v4Hips");

  const parentByNode = new Map();
  for (const [parentIndex, node] of document.nodes.entries()) {
    for (const childIndex of node.children ?? []) {
      invariant(
        Number.isInteger(childIndex) && document.nodes[childIndex],
        `V4 node ${parentIndex} references an invalid child`,
      );
      invariant(!parentByNode.has(childIndex), `V4 node ${childIndex} has multiple parents`);
      parentByNode.set(childIndex, parentIndex);
    }
  }
  const jointNodeIndexes = new Set(skin.joints);
  const helpers = skin.joints
    .filter((nodeIndex) => !semanticNames.has(document.nodes[nodeIndex].name))
    .map((nodeIndex) => {
      const node = document.nodes[nodeIndex];
      const parentIndex = parentByNode.get(nodeIndex);
      invariant(
        jointNodeIndexes.has(parentIndex),
        `V4 helper ${node.name} must be parented to a skin joint`,
      );
      const parentName = document.nodes[parentIndex].name;
      const expectedParent = expectedHelperParent(node.name);
      invariant(expectedParent, `V4 helper ${node.name} is outside the sealed helper vocabulary`);
      invariant(
        parentName === expectedParent,
        `V4 helper ${node.name} must be parented to ${expectedParent}`,
      );
      return {
        name: node.name,
        parent: parentName,
        restLocalTransform: restLocalTransform(node, `${node.name} helper`),
      };
    });
  invariant(
    [...FOREARM_DEFORMATION_HELPER_PARENTS.keys()].every((name) =>
      helpers.some((helper) => helper.name === name),
    ),
    "V4 skin is missing a forearm-twist or wrist-corrective helper",
  );

  invariant(document.meshes?.length === 1, "V4 must contain one mesh definition");
  const skinnedNodes = document.nodes.filter(
    (node) => Number.isInteger(node.mesh) && Number.isInteger(node.skin),
  );
  invariant(skinnedNodes.length === 1, "V4 must round-trip as one SkinnedMesh node");
  invariant(skinnedNodes[0].name === "v4Athlete", "V4 mesh node name drifted");
  const mesh = document.meshes[skinnedNodes[0].mesh];
  invariant(mesh.primitives?.length === 1, "V4 must remain one glTF primitive");
  const primitive = mesh.primitives[0];
  invariant(primitive.mode === 4, "V4 primitive must use indexed triangles");
  invariant(primitive.targets === undefined, "V4 morph targets are outside the reviewed contract");
  const semantics = Object.keys(primitive.attributes ?? {}).sort();
  invariant(
    JSON.stringify(semantics) ===
      JSON.stringify(["COLOR_0", "JOINTS_0", "NORMAL", "POSITION", "TEXCOORD_0", "WEIGHTS_0"]),
    "V4 vertex attribute contract drifted",
  );

  const positions = readAccessor(document, binary, primitive.attributes.POSITION);
  const joints = readAccessor(document, binary, primitive.attributes.JOINTS_0);
  const weights = readAccessor(document, binary, primitive.attributes.WEIGHTS_0);
  const colors = readAccessor(document, binary, primitive.attributes.COLOR_0);
  const normals = readAccessor(document, binary, primitive.attributes.NORMAL);
  const uvs = readAccessor(document, binary, primitive.attributes.TEXCOORD_0);
  const indices = readAccessor(document, binary, primitive.indices);
  const vertexCount = positions.accessor.count;
  invariant(vertexCount >= MIN_VERTICES && vertexCount <= MAX_VERTICES, "V4 vertex budget failed");
  invariant(
    [joints, weights, colors, normals, uvs].every((value) => value.accessor.count === vertexCount),
    "V4 per-vertex accessor counts differ",
  );
  invariant(indices.accessor.type === "SCALAR", "V4 index accessor must be scalar");
  invariant(indices.accessor.count % 3 === 0, "V4 index accessor has an incomplete triangle");
  const triangleCount = indices.accessor.count / 3;
  invariant(
    triangleCount >= MIN_TRIANGLES && triangleCount <= MAX_TRIANGLES,
    "V4 triangle budget failed",
  );
  const flatIndices = indices.values.map(([value]) => value);
  invariant(
    flatIndices.every((value) => value < vertexCount),
    "V4 index exceeds vertex count",
  );
  const topology = connectedComponents(vertexCount, flatIndices, positions.values);
  const components = topology.sizes;
  invariant(
    components.length >= MIN_COMPONENTS && components.length <= MAX_COMPONENTS,
    `V4 topology component count ${components.length} is outside ${MIN_COMPONENTS}-${MAX_COMPONENTS}`,
  );
  // A production athlete must keep a substantial connected body mass. Exact
  // loft counts are no longer frozen so remeshed coherent surfaces can ship.
  const majorComponents = components.filter((size) => size >= 380);
  invariant(majorComponents.length >= 1, "V4 surface is missing a major connected body mass");
  invariant(
    majorComponents.reduce((sum, size) => sum + size, 0) >= Math.floor(vertexCount * 0.55),
    "V4 major body mass is too fragmented relative to total vertices",
  );
  const coreContinuity = validateCoreContinuity(
    loadedBoneNames,
    joints,
    weights,
    topology.componentByVertex,
    options,
  );

  const jointCount = skin.joints.length;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    invariant(
      positions.values[vertex].every(Number.isFinite) &&
        normals.values[vertex].every(Number.isFinite) &&
        colors.values[vertex].every(Number.isFinite) &&
        uvs.values[vertex].every(Number.isFinite),
      `V4 vertex ${vertex} has non-finite geometry`,
    );
    invariant(
      joints.values[vertex].every(
        (joint) => Number.isInteger(joint) && joint >= 0 && joint < jointCount,
      ),
      `V4 vertex ${vertex} references an invalid joint`,
    );
    const weightSum = weights.values[vertex].reduce((sum, weight) => sum + weight, 0);
    invariant(
      weights.values[vertex].every((weight) => Number.isFinite(weight) && weight >= 0) &&
        Math.abs(weightSum - 1) <= 1e-5,
      `V4 vertex ${vertex} has invalid or non-normalized skin weights`,
    );
  }
  for (const helper of helpers) {
    const helperIndex = loadedBoneNames.indexOf(helper.name);
    let influencedVertices = 0;
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      for (let influence = 0; influence < joints.values[vertex].length; influence++) {
        if (
          joints.values[vertex][influence] === helperIndex &&
          weights.values[vertex][influence] >= CORE_WEIGHT_THRESHOLD
        ) {
          influencedVertices++;
          break;
        }
      }
    }
    const isForearmDeformer = FOREARM_DEFORMATION_HELPER_PARENTS.has(helper.name);
    const minimumInfluencedVertices = isForearmDeformer
      ? MIN_FOREARM_DEFORMATION_INFLUENCED_VERTICES
      : MIN_GRIP_HELPER_INFLUENCED_VERTICES;
    // Influence floors describe the production Blender surface. The synthetic
    // reference asset carries only a token skinned vertex per helper, so the
    // same flag that relaxes its disconnected topology relaxes these too; the
    // shipped GLB is always validated without it.
    invariant(
      options.allowDisconnectedReferenceTopology === true ||
        influencedVertices >= minimumInfluencedVertices,
      `V4 ${isForearmDeformer ? "forearm deformation" : "grip"} helper ${
        helper.name
      } has too little weighted surface (${influencedVertices} vertices)`,
    );
    helper.influencedVertices = influencedVertices;
    helper.role = isForearmDeformer ? "forearm-deformation" : "grip-closure";
  }

  invariant(document.materials?.length === 1, "V4 must use one physical material");
  const material = document.materials[0];
  invariant(
    material.alphaMode === undefined || material.alphaMode === "OPAQUE",
    "V4 must be opaque",
  );
  invariant(
    material.pbrMetallicRoughness?.baseColorTexture === undefined,
    "V4 textures are forbidden",
  );
  invariant(material.normalTexture === undefined, "V4 normal textures are forbidden");
  invariant(material.occlusionTexture === undefined, "V4 occlusion textures are forbidden");
  invariant(material.emissiveTexture === undefined, "V4 emissive textures are forbidden");
  invariant(
    Object.keys(material.extensions ?? {}).every((extension) => allowedExtensions.has(extension)),
    "V4 material uses an unreviewed extension",
  );

  for (const [boneName, contact] of CONTACTS) {
    const bone = document.nodes.find((node) => node.name === boneName);
    const marker = document.nodes.find((node) => node.name === `${boneName}Contact`);
    invariant(bone, `V4 is missing ${boneName}`);
    invariant(marker, `V4 is missing ${boneName}Contact`);
    invariant(bone.extras?.replayContactRole === contact.role, `${boneName} role metadata drifted`);
    invariant(
      sameNumberArray(bone.extras?.replayContactOffset, contact.offset),
      `${boneName} offset metadata drifted`,
    );
    invariant(
      marker.extras?.replayContactBone === boneName,
      `${boneName} marker parent metadata drifted`,
    );
    invariant(marker.extras?.replayContactRole === contact.role, `${boneName} marker role drifted`);
    invariant(
      sameNumberArray(marker.translation, contact.offset),
      `${boneName} marker transform drifted`,
    );
  }

  invariant(document.animations?.length === CLIPS.length, "V4 must contain exactly three clips");
  for (let clipIndex = 0; clipIndex < CLIPS.length; clipIndex++) {
    const expected = CLIPS[clipIndex];
    const animation = document.animations[clipIndex];
    invariant(animation.name === expected.name, `V4 clip ${clipIndex} name drifted`);
    invariant(
      animation.extras?.replayRigVersion === 4,
      `${expected.name} version metadata missing`,
    );
    invariant(
      animation.extras?.replaySport === expected.sport,
      `${expected.name} sport metadata drifted`,
    );
    invariant(
      Math.abs(animation.extras?.replayDriveEnd - expected.driveEnd) <= 1e-8,
      `${expected.name} drive boundary drifted`,
    );
    invariant(
      animation.channels?.length === 20 && animation.samplers?.length === 20,
      `${expected.name} must carry one hips position and semantic rotation tracks`,
    );
    let translations = 0;
    const rotationTargets = new Set();
    for (let channelIndex = 0; channelIndex < animation.channels.length; channelIndex++) {
      const channel = animation.channels[channelIndex];
      const sampler = animation.samplers[channel.sampler];
      invariant(sampler?.interpolation === "LINEAR", `${expected.name} interpolation drifted`);
      invariant(skin.joints.includes(channel.target?.node), `${expected.name} targets a non-bone`);
      invariant(
        channel.target.path === "rotation" || channel.target.path === "translation",
        `${expected.name} has an unreviewed channel path`,
      );
      if (channel.target.path === "translation") {
        translations++;
        invariant(
          document.nodes[channel.target.node]?.name === "v4Hips",
          `${expected.name} moves a non-hips bone`,
        );
      } else {
        const targetName = document.nodes[channel.target.node]?.name;
        invariant(
          semanticNames.has(targetName),
          `${expected.name} directly targets a visual helper bone`,
        );
        rotationTargets.add(targetName);
      }
      const times = readAccessor(document, binary, sampler.input).values.map(([time]) => time);
      invariant(times[0] === 0 && times.at(-1) === 1, `${expected.name} is not normalized 0..1`);
      invariant(
        times.some((time) => Math.abs(time - expected.driveEnd) <= 1e-5),
        `${expected.name} omits its drive boundary key`,
      );
      const output = readAccessor(document, binary, sampler.output).values;
      invariant(
        output[0].every((value, component) => Math.abs(value - output.at(-1)[component]) <= 1e-6),
        `${expected.name} channel ${channelIndex} is not loop-safe`,
      );
      invariant(output.flat().every(Number.isFinite), `${expected.name} contains non-finite keys`);
    }
    invariant(
      translations === 1,
      `${expected.name} must contain exactly one hips translation track`,
    );
    invariant(
      rotationTargets.size === BONE_NAMES.length,
      `${expected.name} must rotate every semantic bone exactly once`,
    );
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  return {
    path: resolvedPath,
    bytes: bytes.byteLength,
    checksum,
    bones: skin.joints.length,
    semanticBones: BONE_NAMES.length,
    helperBones: helpers.length,
    boneNames: loadedBoneNames,
    helperBoneNames: helpers.map((helper) => helper.name),
    helpers,
    clips: CLIPS.length,
    vertices: vertexCount,
    triangles: triangleCount,
    components: components.length,
    largestComponents: components.slice(0, 5),
    coreContinuity,
    materials: document.materials.length,
    clipTracks: document.animations.reduce(
      (count, animation) => count + animation.channels.length,
      0,
    ),
  };
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const allowDisconnectedReferenceTopology = arguments_.includes("--allow-reference-topology");
  const assetPath = arguments_.find((argument) => !argument.startsWith("--")) ?? DEFAULT_ASSET;
  const result = await validateV4Asset(assetPath, {
    allowDisconnectedReferenceTopology,
  });
  const displayPath = relative(process.cwd(), result.path) || result.path;
  console.log(
    `validated ${displayPath}: ${result.bones} bones (${result.helperBones} helpers), ${result.clips} clips, ${result.components} topology components, ${result.triangles} triangles, ${result.vertices} vertices, ${result.bytes} bytes, sha256 ${result.checksum}`,
  );
}

if (resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname)) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`V4 replay asset validation failed: ${message}`);
    process.exitCode = 1;
  }
}
