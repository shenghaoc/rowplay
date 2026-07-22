import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { validateV4Asset } from "./validate-replay-rig-v4.mjs";
import { validateV4Usdz } from "./validate-replay-rig-v4-usdz.mjs";

const DEFAULT_ASSET = "static/replay-assets/rowplay-rigs-v3.glb";
// Blender-authored open hull, slide rails, and seat carriage add reviewed
// hard-surface topology while remaining comfortably below one compressed MB.
const MAX_FILE_BYTES = 704 * 1024;
const MIN_TRIANGLES = 10_000;
const MAX_TRIANGLES = 32_000;
const MAX_VERTICES = 64_000;
const LIMB_SLOTS = new Set([
  "athlete:upper-arm",
  "athlete:forearm",
  "athlete:thigh",
  "athlete:shin",
]);

const LEAF_SLOTS = [
  "athlete:torso",
  "athlete:pelvis",
  "athlete:head",
  "athlete:hair",
  "athlete:upper-arm",
  "athlete:forearm",
  "athlete:thigh",
  "athlete:shin",
  "athlete:hand",
  "athlete:elbow",
  "athlete:shoe",
  "athlete:neck",
  "athlete:shoulder",
  "athlete:helmet",
  "equipment:row:blade",
  "equipment:ski:pole-shaft",
  "equipment:ski:pole-grip",
  "equipment:ski:pole-basket",
];

const LEGACY_V2_SLOTS = [
  "athlete:torso",
  "athlete:pelvis",
  "athlete:head",
  "athlete:hair",
  "athlete:upper-arm",
  "athlete:forearm",
  "athlete:thigh",
  "athlete:shin",
  "athlete:hand",
  "athlete:elbow",
  "athlete:shoe",
  "athlete:neck",
  "athlete:shoulder",
  "athlete:helmet",
  "equipment:row:hull",
  "equipment:row:blade",
  "equipment:ski:ski",
  "equipment:ski:pole-shaft",
  "equipment:ski:pole-grip",
  "equipment:ski:pole-basket",
  "equipment:bike:tyre",
  "equipment:bike:frame-tube",
  "equipment:bike:saddle",
  "equipment:bike:pedal",
];
const LEGACY_V2_MIN_TRIANGLES = 2_200;

const TEMPLATE_PARTS = new Map([
  [
    "equipment:row:boat-assembly",
    new Set([
      "hull",
      "stern-deck",
      "bow-deck",
      "cockpit-tub",
      "bulkheads",
      "gunwales",
      "slide-rails",
      "accent-strakes",
      "foot-stretcher",
      "heel-cups",
      "stretcher-hardware",
      "riggers",
      "oarlocks",
      "keel-fin",
    ]),
  ],
  [
    "equipment:row:seat-carriage",
    new Set(["seat-pad", "seat-carriage", "seat-rollers", "seat-guides"]),
  ],
  ["equipment:row:oar-rig", new Set(["shaft", "grip", "handle-cap", "collar", "blade-sleeve"])],
  ["equipment:ski:ski-assembly", new Set(["base", "top-deck", "binding", "tip-ridge"])],
  ["equipment:bike:wheel-assembly", new Set(["tyre", "aero-rim", "hub", "brake-rotor", "spokes"])],
  [
    "equipment:bike:frame-assembly",
    new Set([
      "main-triangle",
      "stays-and-fork",
      "cockpit",
      "brake-hoods",
      "brake-levers",
      "brake-calipers",
      "chain-and-cassette",
      "saddle",
      "seat-post",
      "fork-crown",
      "rear-axle",
      "front-axle",
    ]),
  ],
  [
    "equipment:bike:drivetrain-assembly",
    new Set(["chainring", "spider", "crank-arms", "clipless-pedals", "bottom-bracket"]),
  ],
]);

const MATERIAL_ROLES = new Set([
  "athlete-skin",
  "athlete-fabric",
  "athlete-hair",
  "athlete-footwear",
  "equipment-painted",
  "equipment-dark",
  "equipment-light",
  "equipment-metal",
  "equipment-rubber",
  "equipment-grip",
  "equipment-trim",
]);

const LEAF_MATERIAL_ROLES = new Map([
  ["athlete:torso", "athlete-fabric"],
  ["athlete:pelvis", "athlete-fabric"],
  ["athlete:head", "athlete-skin"],
  ["athlete:hair", "athlete-hair"],
  ["athlete:upper-arm", "athlete-skin"],
  ["athlete:forearm", "athlete-skin"],
  ["athlete:thigh", "athlete-fabric"],
  ["athlete:shin", "athlete-fabric"],
  ["athlete:hand", "athlete-skin"],
  ["athlete:elbow", "athlete-skin"],
  ["athlete:shoe", "athlete-footwear"],
  ["athlete:neck", "athlete-skin"],
  ["athlete:shoulder", "athlete-fabric"],
  ["athlete:helmet", "athlete-fabric"],
  ["equipment:row:blade", "equipment-painted"],
  ["equipment:ski:pole-shaft", "equipment-light"],
  ["equipment:ski:pole-grip", "equipment-grip"],
  ["equipment:ski:pole-basket", "equipment-painted"],
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function readPositionVectors(document, binary, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor?.bufferView];
  invariant(
    accessor?.componentType === 5126 && accessor.type === "VEC3",
    "invalid position accessor",
  );
  invariant(view, "position accessor is missing a buffer view");
  const stride = view.byteStride ?? 12;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  invariant(stride >= 12, "position accessor stride is too short");
  invariant(
    start + (accessor.count - 1) * stride + 12 <= binary.byteLength,
    "position accessor exceeds binary data",
  );
  const values = [];
  for (let index = 0; index < accessor.count; index++) {
    const offset = start + index * stride;
    values.push({
      x: binary.readFloatLE(offset),
      y: binary.readFloatLE(offset + 4),
      z: binary.readFloatLE(offset + 8),
    });
  }
  return values;
}

function validateLimbProfile(slot, positions) {
  const minZ = Math.min(...positions.map((position) => position.z));
  const maxZ = Math.max(...positions.map((position) => position.z));
  // Runtime maps the rig start to local -Z and the end to local +Z. Limit
  // authored extension to four percent beyond a unit segment, then require
  // the proximal end to be wider than the distal cuff so elbows/knees do not
  // invert into a bulbous end cap when the two-bone solver flexes.
  invariant(
    minZ >= -0.525 && minZ <= -0.515 && maxZ >= 0.515 && maxZ <= 0.525,
    `${slot} must stay inside the compact ±0.52 limb envelope`,
  );
  const proximalRadius = Math.max(
    ...positions
      .filter((position) => position.z <= minZ + 0.035)
      .map((position) => Math.hypot(position.x, position.y)),
  );
  const distalRadius = Math.max(
    ...positions
      .filter((position) => position.z >= maxZ - 0.035)
      .map((position) => Math.hypot(position.x, position.y)),
  );
  invariant(
    proximalRadius > distalRadius * 1.15,
    `${slot} must taper from proximal -Z to distal +Z`,
  );
}

function readGlb(bytes) {
  invariant(bytes.byteLength >= 20, "file is too short to be a GLB");
  invariant(bytes.readUInt32LE(0) === 0x46546c67, "invalid GLB magic");
  invariant(bytes.readUInt32LE(4) === 2, "asset must use glTF 2.0");
  invariant(bytes.readUInt32LE(8) === bytes.byteLength, "GLB header length does not match file");

  const chunks = [];
  let offset = 12;
  while (offset < bytes.byteLength) {
    invariant(offset + 8 <= bytes.byteLength, "truncated GLB chunk header");
    const byteLength = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    invariant(byteLength % 4 === 0, "GLB chunks must be four-byte aligned");
    const start = offset + 8;
    const end = start + byteLength;
    invariant(end <= bytes.byteLength, "GLB chunk extends beyond the file");
    chunks.push({ type, bytes: bytes.subarray(start, end) });
    offset = end;
  }
  invariant(offset === bytes.byteLength, "GLB chunks do not consume the complete file");
  invariant(chunks.length === 2, "asset must contain one JSON chunk and one binary chunk");
  invariant(chunks[0]?.type === 0x4e4f534a, "first GLB chunk must be JSON");
  invariant(chunks[1]?.type === 0x004e4942, "second GLB chunk must be binary");

  let jsonText = chunks[0].bytes.toString("utf8");
  while (jsonText.endsWith("\0")) jsonText = jsonText.slice(0, -1);
  jsonText = jsonText.trimEnd();
  return { document: JSON.parse(jsonText), binary: chunks[1].bytes };
}

// Keep the fallback package auditable while the default command validates V3.
function validateLegacyV2Document(document, binary) {
  invariant(document.asset?.version === "2.0", "JSON asset.version must be 2.0");
  invariant(document.scene === 0, "asset must declare scene 0 as its default scene");
  invariant(document.scenes?.length === 1, "asset must contain exactly one scene");
  invariant(
    document.scenes[0]?.name === "ROWPLAY_RIG_ASSET_LIBRARY_V2",
    "asset scene name must match the v2 replay-rig contract",
  );
  invariant(!document.extensionsRequired?.length, "required glTF extensions are not supported");
  invariant(!document.extensionsUsed?.length, "the replay asset pack must use core glTF only");

  for (const collection of ["animations", "cameras", "images", "samplers", "skins", "textures"]) {
    invariant(!document[collection]?.length, `${collection} are outside the replay asset contract`);
  }

  invariant(document.buffers?.length === 1, "asset must contain one embedded buffer");
  const buffer = document.buffers[0];
  invariant(buffer.uri === undefined, "external or data-URI buffers are not allowed");
  invariant(Number.isInteger(buffer.byteLength) && buffer.byteLength > 0, "invalid buffer length");
  invariant(buffer.byteLength <= binary.byteLength, "binary chunk is shorter than buffers[0]");
  invariant(
    binary.byteLength - buffer.byteLength < 4,
    "binary chunk contains unexpected trailing data",
  );

  invariant(
    Array.isArray(document.bufferViews) && document.bufferViews.length > 0,
    "missing buffer views",
  );
  document.bufferViews.forEach((view, index) => {
    const offset = view.byteOffset ?? 0;
    invariant(view.buffer === 0, `bufferView ${index} must use the embedded buffer`);
    invariant(Number.isInteger(offset) && offset >= 0, `bufferView ${index} has an invalid offset`);
    invariant(
      Number.isInteger(view.byteLength) && view.byteLength > 0,
      `bufferView ${index} has an invalid length`,
    );
    invariant(
      offset + view.byteLength <= buffer.byteLength,
      `bufferView ${index} extends beyond the embedded buffer`,
    );
  });

  invariant(
    Array.isArray(document.accessors) && document.accessors.length > 0,
    "missing accessors",
  );
  document.accessors.forEach((accessor, index) => {
    invariant(
      Number.isInteger(accessor.bufferView) && document.bufferViews[accessor.bufferView],
      `accessor ${index} references an invalid buffer view`,
    );
    invariant(Number.isInteger(accessor.count) && accessor.count > 0, `accessor ${index} is empty`);
    invariant(accessor.sparse === undefined, `accessor ${index} must not be sparse`);
    invariant(accessor.normalized !== true, `accessor ${index} must not be normalized`);
  });

  invariant(document.materials?.length === 1, "asset must use one neutral placeholder material");
  const material = document.materials[0];
  invariant(material.extensions === undefined, "material extensions are not allowed");
  invariant(material.normalTexture === undefined, "normal textures are not allowed");
  invariant(material.occlusionTexture === undefined, "occlusion textures are not allowed");
  invariant(material.emissiveTexture === undefined, "emissive textures are not allowed");
  invariant(
    material.pbrMetallicRoughness?.baseColorTexture === undefined,
    "base-color textures are not allowed",
  );

  invariant(
    document.nodes?.length === LEGACY_V2_SLOTS.length,
    "asset contains unexpected scene nodes",
  );
  invariant(document.meshes?.length === LEGACY_V2_SLOTS.length, "asset contains unexpected meshes");

  const reachableNodes = new Set();
  const visitingNodes = new Set();
  function visitNode(index) {
    invariant(
      Number.isInteger(index) && document.nodes[index],
      `scene references invalid node ${index}`,
    );
    invariant(!visitingNodes.has(index), `node hierarchy contains a cycle at node ${index}`);
    if (reachableNodes.has(index)) return;
    visitingNodes.add(index);
    reachableNodes.add(index);
    for (const child of document.nodes[index].children ?? []) visitNode(child);
    visitingNodes.delete(index);
  }
  for (const nodeIndex of document.scenes[0].nodes ?? []) visitNode(nodeIndex);
  invariant(
    reachableNodes.size === document.nodes.length,
    "asset contains nodes outside the default scene",
  );

  const required = new Set(LEGACY_V2_SLOTS);
  const slots = new Map();
  let vertexCount = 0;
  let triangleCount = 0;

  document.nodes.forEach((node, nodeIndex) => {
    const slot = node.extras?.replayAssetSlot;
    invariant(typeof slot === "string", `node ${nodeIndex} is missing extras.replayAssetSlot`);
    invariant(required.has(slot), `node ${nodeIndex} declares unknown replay slot ${slot}`);
    invariant(!slots.has(slot), `replay slot ${slot} is duplicated`);
    invariant(node.name === slot, `node ${nodeIndex} name must equal its replay slot`);
    invariant(
      Number.isInteger(node.mesh) && document.meshes[node.mesh],
      `slot ${slot} has no valid mesh`,
    );
    invariant(
      node.matrix === undefined &&
        node.translation === undefined &&
        node.rotation === undefined &&
        node.scale === undefined,
      `slot ${slot} must be authored at its local origin`,
    );
    slots.set(slot, nodeIndex);

    const mesh = document.meshes[node.mesh];
    invariant(mesh.primitives?.length === 1, `slot ${slot} must contain exactly one primitive`);
    const primitive = mesh.primitives[0];
    invariant(
      primitive.mode === undefined || primitive.mode === 4,
      `slot ${slot} must use triangles`,
    );
    invariant(primitive.material === 0, `slot ${slot} must use the placeholder material`);
    invariant(primitive.targets === undefined, `slot ${slot} must not contain morph targets`);
    const semantics = Object.keys(primitive.attributes ?? {}).sort();
    invariant(
      semantics.length === 2 && semantics[0] === "NORMAL" && semantics[1] === "POSITION",
      `slot ${slot} must contain only POSITION and NORMAL attributes`,
    );

    const positionAccessorIndex = primitive.attributes.POSITION;
    const position = document.accessors[positionAccessorIndex];
    const normal = document.accessors[primitive.attributes.NORMAL];
    invariant(
      position?.componentType === 5126 && position.type === "VEC3",
      `slot ${slot} has invalid positions`,
    );
    invariant(
      normal?.componentType === 5126 && normal.type === "VEC3",
      `slot ${slot} has invalid normals`,
    );
    invariant(normal.count === position.count, `slot ${slot} position/normal counts differ`);
    invariant(
      Array.isArray(position.min) &&
        Array.isArray(position.max) &&
        position.min.length === 3 &&
        position.max.length === 3 &&
        position.min.every(isFiniteNumber) &&
        position.max.every(isFiniteNumber),
      `slot ${slot} has invalid bounds`,
    );
    invariant(
      position.max.every((value, axis) => value - position.min[axis] > 1e-6),
      `slot ${slot} is degenerate on one or more axes`,
    );
    if (LIMB_SLOTS.has(slot)) {
      validateLimbProfile(slot, readPositionVectors(document, binary, positionAccessorIndex));
    }

    let primitiveIndexCount = position.count;
    if (primitive.indices !== undefined) {
      const indices = document.accessors[primitive.indices];
      invariant(indices?.type === "SCALAR", `slot ${slot} has a non-scalar index accessor`);
      invariant(
        [5121, 5123, 5125].includes(indices.componentType),
        `slot ${slot} has invalid indices`,
      );
      primitiveIndexCount = indices.count;
    }
    invariant(primitiveIndexCount % 3 === 0, `slot ${slot} has an incomplete triangle`);
    invariant(primitiveIndexCount / 3 >= 12, `slot ${slot} is below the authored-detail floor`);
    vertexCount += position.count;
    triangleCount += primitiveIndexCount / 3;
  });

  const missing = LEGACY_V2_SLOTS.filter((slot) => !slots.has(slot));
  invariant(missing.length === 0, `asset is missing replay slots: ${missing.join(", ")}`);
  invariant(
    triangleCount >= LEGACY_V2_MIN_TRIANGLES,
    `asset is below the ${LEGACY_V2_MIN_TRIANGLES}-triangle fidelity floor`,
  );
  invariant(triangleCount <= MAX_TRIANGLES, `asset exceeds the ${MAX_TRIANGLES}-triangle budget`);
  invariant(vertexCount <= MAX_VERTICES, `asset exceeds the ${MAX_VERTICES}-vertex budget`);

  return {
    leafCount: slots.size,
    templateCount: 0,
    partCount: 0,
    vertexCount,
    triangleCount,
  };
}

function validateDocument(document, binary) {
  if (document.scenes?.[0]?.name === "ROWPLAY_RIG_ASSET_LIBRARY_V2") {
    return validateLegacyV2Document(document, binary);
  }
  invariant(document.asset?.version === "2.0", "JSON asset.version must be 2.0");
  invariant(document.scene === 0, "asset must declare scene 0 as its default scene");
  invariant(document.scenes?.length === 1, "asset must contain exactly one scene");
  invariant(
    document.scenes[0]?.name === "ROWPLAY_RIG_ASSET_LIBRARY_V3",
    "asset scene name must match the v3 replay-rig contract",
  );
  invariant(!document.extensionsRequired?.length, "required glTF extensions are not supported");
  invariant(!document.extensionsUsed?.length, "the replay asset pack must use core glTF only");
  for (const collection of ["animations", "cameras", "images", "samplers", "skins", "textures"]) {
    invariant(!document[collection]?.length, `${collection} are outside the replay asset contract`);
  }

  invariant(document.buffers?.length === 1, "asset must contain one embedded buffer");
  const buffer = document.buffers[0];
  invariant(buffer.uri === undefined, "external or data-URI buffers are not allowed");
  invariant(Number.isInteger(buffer.byteLength) && buffer.byteLength > 0, "invalid buffer length");
  invariant(buffer.byteLength <= binary.byteLength, "binary chunk is shorter than buffers[0]");
  invariant(
    binary.byteLength - buffer.byteLength < 4,
    "binary chunk contains unexpected trailing data",
  );

  invariant(
    Array.isArray(document.bufferViews) && document.bufferViews.length > 0,
    "missing buffer views",
  );
  document.bufferViews.forEach((view, index) => {
    const offset = view.byteOffset ?? 0;
    invariant(view.buffer === 0, `bufferView ${index} must use the embedded buffer`);
    invariant(Number.isInteger(offset) && offset >= 0, `bufferView ${index} has an invalid offset`);
    invariant(
      Number.isInteger(view.byteLength) && view.byteLength > 0,
      `bufferView ${index} has an invalid length`,
    );
    invariant(
      offset + view.byteLength <= buffer.byteLength,
      `bufferView ${index} extends beyond the embedded buffer`,
    );
  });
  invariant(
    Array.isArray(document.accessors) && document.accessors.length > 0,
    "missing accessors",
  );
  document.accessors.forEach((accessor, index) => {
    invariant(
      Number.isInteger(accessor.bufferView) && document.bufferViews[accessor.bufferView],
      `accessor ${index} references an invalid buffer view`,
    );
    invariant(Number.isInteger(accessor.count) && accessor.count > 0, `accessor ${index} is empty`);
    invariant(accessor.sparse === undefined, `accessor ${index} must not be sparse`);
    invariant(accessor.normalized !== true, `accessor ${index} must not be normalized`);
  });

  invariant(document.materials?.length === 1, "asset must use one neutral placeholder material");
  const material = document.materials[0];
  invariant(material.extensions === undefined, "material extensions are not allowed");
  invariant(material.normalTexture === undefined, "normal textures are not allowed");
  invariant(material.occlusionTexture === undefined, "occlusion textures are not allowed");
  invariant(material.emissiveTexture === undefined, "emissive textures are not allowed");
  invariant(
    material.pbrMetallicRoughness?.baseColorTexture === undefined,
    "base-color textures are not allowed",
  );

  const totalParts = [...TEMPLATE_PARTS.values()].reduce((count, parts) => count + parts.size, 0);
  const topLevelCount = LEAF_SLOTS.length + TEMPLATE_PARTS.size;
  invariant(Array.isArray(document.nodes), "asset is missing nodes");
  invariant(
    document.scenes[0].nodes?.length === topLevelCount,
    "asset must expose exactly 18 leaves and six composite roots at scene level",
  );
  invariant(
    document.nodes.length === topLevelCount + totalParts,
    "asset contains unexpected nodes outside the strict v3 hierarchy",
  );
  invariant(
    document.meshes?.length === LEAF_SLOTS.length + totalParts,
    "asset contains unexpected meshes outside the v3 leaf/composite contract",
  );

  const reachableNodes = new Set();
  const visitingNodes = new Set();
  function visitNode(index) {
    invariant(
      Number.isInteger(index) && document.nodes[index],
      `scene references invalid node ${index}`,
    );
    invariant(!visitingNodes.has(index), `node hierarchy contains a cycle at node ${index}`);
    if (reachableNodes.has(index)) return;
    visitingNodes.add(index);
    reachableNodes.add(index);
    for (const child of document.nodes[index].children ?? []) visitNode(child);
    visitingNodes.delete(index);
  }
  for (const nodeIndex of document.scenes[0].nodes ?? []) visitNode(nodeIndex);
  invariant(
    reachableNodes.size === document.nodes.length,
    "asset contains nodes outside the default scene",
  );

  const leaves = new Map();
  const templates = new Map();
  const classifiedNodes = new Set();
  const usedMeshes = new Set();
  let vertexCount = 0;
  let triangleCount = 0;

  function assertIdentityTransform(node, label) {
    invariant(
      node.matrix === undefined &&
        node.translation === undefined &&
        node.rotation === undefined &&
        node.scale === undefined,
      `${label} must be authored at its local origin`,
    );
  }

  function validateMesh(node, label, limbSlot) {
    invariant(
      Number.isInteger(node.mesh) && document.meshes[node.mesh],
      `${label} has no valid mesh`,
    );
    invariant(!usedMeshes.has(node.mesh), `${label} reuses an authored mesh instance`);
    usedMeshes.add(node.mesh);
    const mesh = document.meshes[node.mesh];
    invariant(mesh.primitives?.length === 1, `${label} must contain exactly one primitive`);
    const primitive = mesh.primitives[0];
    invariant(primitive.mode === undefined || primitive.mode === 4, `${label} must use triangles`);
    invariant(primitive.material === 0, `${label} must use the placeholder material`);
    invariant(primitive.targets === undefined, `${label} must not contain morph targets`);
    const semantics = Object.keys(primitive.attributes ?? {}).sort();
    invariant(
      semantics.length === 2 && semantics[0] === "NORMAL" && semantics[1] === "POSITION",
      `${label} must contain only POSITION and NORMAL attributes`,
    );
    const positionAccessorIndex = primitive.attributes.POSITION;
    const position = document.accessors[positionAccessorIndex];
    const normal = document.accessors[primitive.attributes.NORMAL];
    invariant(
      position?.componentType === 5126 && position.type === "VEC3",
      `${label} has invalid positions`,
    );
    invariant(
      normal?.componentType === 5126 && normal.type === "VEC3",
      `${label} has invalid normals`,
    );
    invariant(normal.count === position.count, `${label} position/normal counts differ`);
    invariant(
      Array.isArray(position.min) &&
        Array.isArray(position.max) &&
        position.min.length === 3 &&
        position.max.length === 3 &&
        position.min.every(isFiniteNumber) &&
        position.max.every(isFiniteNumber),
      `${label} has invalid bounds`,
    );
    invariant(
      position.max.every((value, axis) => value - position.min[axis] > 1e-6),
      `${label} is degenerate on one or more axes`,
    );
    if (limbSlot && LIMB_SLOTS.has(limbSlot)) {
      validateLimbProfile(limbSlot, readPositionVectors(document, binary, positionAccessorIndex));
    }
    let indexCount = position.count;
    if (primitive.indices !== undefined) {
      const indices = document.accessors[primitive.indices];
      invariant(indices?.type === "SCALAR", `${label} has a non-scalar index accessor`);
      invariant([5121, 5123, 5125].includes(indices.componentType), `${label} has invalid indices`);
      indexCount = indices.count;
    }
    invariant(indexCount % 3 === 0, `${label} has an incomplete triangle`);
    invariant(indexCount / 3 >= 12, `${label} is below the authored-detail floor`);
    vertexCount += position.count;
    triangleCount += indexCount / 3;
  }

  for (const nodeIndex of document.scenes[0].nodes ?? []) {
    const node = document.nodes[nodeIndex];
    assertIdentityTransform(node, `top-level node ${nodeIndex}`);
    invariant(!classifiedNodes.has(nodeIndex), `scene duplicates top-level node ${nodeIndex}`);
    classifiedNodes.add(nodeIndex);
    const leaf = node.extras?.replayAssetSlot;
    if (typeof leaf === "string") {
      invariant(
        LEAF_SLOTS.includes(leaf),
        `node ${nodeIndex} declares unknown replay leaf ${leaf}`,
      );
      invariant(!leaves.has(leaf), `replay leaf ${leaf} is duplicated`);
      invariant(node.name === leaf, `node ${nodeIndex} name must equal its replay leaf`);
      invariant(node.children === undefined, `replay leaf ${leaf} must not own child nodes`);
      invariant(
        node.extras?.replayAssetKind === "leaf",
        `replay leaf ${leaf} must declare leaf kind`,
      );
      const role = node.extras?.replayMaterialRole;
      invariant(MATERIAL_ROLES.has(role), `replay leaf ${leaf} has an unknown material role`);
      invariant(
        role === LEAF_MATERIAL_ROLES.get(leaf),
        `replay leaf ${leaf} must retain its canonical material role`,
      );
      validateMesh(node, `replay leaf ${leaf}`, leaf);
      leaves.set(leaf, nodeIndex);
      continue;
    }

    const template = node.extras?.replayAssetTemplateSlot;
    invariant(
      typeof template === "string",
      `node ${nodeIndex} is missing a v3 leaf/template contract`,
    );
    const expectedParts = TEMPLATE_PARTS.get(template);
    invariant(expectedParts, `node ${nodeIndex} declares unknown replay template ${template}`);
    invariant(!templates.has(template), `replay template ${template} is duplicated`);
    invariant(node.name === template, `template ${template} node name must match its slot`);
    invariant(node.mesh === undefined, `template ${template} root must not own mesh geometry`);
    invariant(
      node.extras?.replayAssetKind === "composite",
      `template ${template} must declare composite kind`,
    );
    invariant(
      node.extras?.replayAssetVersion === 3,
      `template ${template} must declare asset version 3`,
    );
    invariant(
      node.extras?.replayAssetPartCount === expectedParts.size,
      `template ${template} has an invalid part-count contract`,
    );
    invariant(
      Array.isArray(node.children) && node.children.length === expectedParts.size,
      `template ${template} must own its complete direct part list`,
    );
    const seenParts = new Set();
    const seenRoles = new Set();
    for (const childIndex of node.children) {
      const child = document.nodes[childIndex];
      invariant(child, `template ${template} references invalid part node ${childIndex}`);
      invariant(
        !classifiedNodes.has(childIndex),
        `template ${template} reuses part node ${childIndex}`,
      );
      classifiedNodes.add(childIndex);
      assertIdentityTransform(child, `template part ${template}:${childIndex}`);
      invariant(
        child.children === undefined,
        `template part ${template}:${childIndex} must not own children`,
      );
      invariant(
        child.extras?.replayAssetTemplateSlot === template,
        `template part ${template}:${childIndex} is assigned to the wrong root`,
      );
      const part = child.extras?.replayAssetPart;
      invariant(
        typeof part === "string" && expectedParts.has(part),
        `template ${template} has unknown part`,
      );
      invariant(!seenParts.has(part), `template ${template} duplicates part ${part}`);
      invariant(
        child.name === `${template}:${part}`,
        `template ${template} part ${part} has an invalid name`,
      );
      const role = child.extras?.replayMaterialRole;
      invariant(
        MATERIAL_ROLES.has(role),
        `template ${template} part ${part} has an unknown material role`,
      );
      seenParts.add(part);
      seenRoles.add(role);
      validateMesh(child, `template ${template} part ${part}`);
    }
    invariant(
      seenParts.size === expectedParts.size,
      `template ${template} is missing a required part`,
    );
    const declaredRoles = node.extras?.replayMaterialRoles;
    const canonicalRoles = [...seenRoles].sort((left, right) => left.localeCompare(right));
    invariant(Array.isArray(declaredRoles), `template ${template} must declare its material roles`);
    invariant(
      declaredRoles.length === canonicalRoles.length &&
        declaredRoles.every((role, index) => role === canonicalRoles[index]),
      `template ${template} material role metadata does not match its parts`,
    );
    templates.set(template, nodeIndex);
  }

  invariant(
    classifiedNodes.size === document.nodes.length,
    "asset contains nodes outside the strict v3 root/part hierarchy",
  );
  invariant(usedMeshes.size === document.meshes.length, "asset contains an unused or shared mesh");
  const missingLeaves = LEAF_SLOTS.filter((slot) => !leaves.has(slot));
  invariant(
    missingLeaves.length === 0,
    `asset is missing replay leaves: ${missingLeaves.join(", ")}`,
  );
  const missingTemplates = [...TEMPLATE_PARTS.keys()].filter(
    (template) => !templates.has(template),
  );
  invariant(
    missingTemplates.length === 0,
    `asset is missing replay templates: ${missingTemplates.join(", ")}`,
  );
  invariant(
    triangleCount >= MIN_TRIANGLES,
    `asset is below the ${MIN_TRIANGLES}-triangle fidelity floor`,
  );
  invariant(triangleCount <= MAX_TRIANGLES, `asset exceeds the ${MAX_TRIANGLES}-triangle budget`);
  invariant(vertexCount <= MAX_VERTICES, `asset exceeds the ${MAX_VERTICES}-vertex budget`);
  return {
    leafCount: leaves.size,
    templateCount: templates.size,
    partCount: totalParts,
    vertexCount,
    triangleCount,
  };
}

async function main() {
  const assetPath = resolve(process.argv[2] ?? DEFAULT_ASSET);
  const bytes = await readFile(assetPath);
  invariant(bytes.byteLength <= MAX_FILE_BYTES, `asset exceeds the ${MAX_FILE_BYTES}-byte budget`);
  const { document, binary } = readGlb(bytes);
  const result = validateDocument(document, binary);
  const displayPath = relative(process.cwd(), assetPath) || assetPath;
  console.log(
    `validated ${displayPath}: ${result.leafCount} leaves, ${result.templateCount} composite templates, ${result.partCount} composite parts, ${result.triangleCount} triangles, ${result.vertexCount} vertices, ${bytes.byteLength} bytes`,
  );
  if (process.argv[2] === undefined) {
    const v4 = await validateV4Asset();
    const v4DisplayPath = relative(process.cwd(), v4.path) || v4.path;
    console.log(
      `validated ${v4DisplayPath}: ${v4.bones} bones, ${v4.clips} clips, ${v4.components} topology components, ${v4.triangles} triangles, ${v4.vertices} vertices, ${v4.bytes} bytes, sha256 ${v4.checksum}`,
    );
    const usdz = await validateV4Usdz();
    const usdzDisplayPath = relative(process.cwd(), usdz.path) || usdz.path;
    console.log(
      `validated ${usdzDisplayPath}: ${usdz.skinnedMeshes} SkinnedMesh, ${usdz.bones} bones, ${usdz.triangles} triangles, ${usdz.bytes} bytes`,
    );
    const { buildV4Contract, V4_CONTRACT_FILENAME } =
      await import("./build-replay-rig-v4-contract.mjs");
    const existingPath = resolve(`static/replay-assets/${V4_CONTRACT_FILENAME}`);
    const scratchPath = resolve(tmpdir(), "rowplay-athlete-v4.contract.validate.json");
    await buildV4Contract(scratchPath);
    const [existing, generated] = await Promise.all([
      readFile(existingPath, "utf8"),
      readFile(scratchPath, "utf8"),
    ]);
    invariant(
      JSON.stringify(JSON.parse(existing)) === JSON.stringify(JSON.parse(generated)),
      `${V4_CONTRACT_FILENAME} is not in sync with built assets`,
    );
    console.log(`validated ${V4_CONTRACT_FILENAME}: generated contract matches built artifacts`);
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`replay asset validation failed: ${message}`);
  process.exitCode = 1;
}
