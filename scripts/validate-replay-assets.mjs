import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const DEFAULT_ASSET = "static/replay-assets/rowplay-rigs-v1.glb";
const MAX_FILE_BYTES = 512 * 1024;
const MIN_TRIANGLES = 800;
const MAX_TRIANGLES = 12_000;
const MAX_VERTICES = 30_000;

const REQUIRED_SLOTS = [
  "athlete:torso",
  "athlete:pelvis",
  "athlete:head",
  "athlete:hair",
  "athlete:upper-arm",
  "athlete:forearm",
  "athlete:thigh",
  "athlete:shin",
  "athlete:hand",
  "athlete:shoe",
  "athlete:neck",
  "athlete:shoulder",
  "athlete:helmet",
  "equipment:row:hull",
  "equipment:row:blade",
  "equipment:ski:ski",
  "equipment:bike:tyre",
  "equipment:bike:frame-tube",
  "equipment:bike:saddle",
  "equipment:bike:pedal",
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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

function validateDocument(document, binary) {
  invariant(document.asset?.version === "2.0", "JSON asset.version must be 2.0");
  invariant(document.scene === 0, "asset must declare scene 0 as its default scene");
  invariant(document.scenes?.length === 1, "asset must contain exactly one scene");
  invariant(
    document.scenes[0]?.name === "ROWPLAY_RIG_ASSET_LIBRARY_V1",
    "asset scene name must match the v1 replay-rig contract",
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
    document.nodes?.length === REQUIRED_SLOTS.length,
    "asset contains unexpected scene nodes",
  );
  invariant(document.meshes?.length === REQUIRED_SLOTS.length, "asset contains unexpected meshes");

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

  const required = new Set(REQUIRED_SLOTS);
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

    const position = document.accessors[primitive.attributes.POSITION];
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

  const missing = REQUIRED_SLOTS.filter((slot) => !slots.has(slot));
  invariant(missing.length === 0, `asset is missing replay slots: ${missing.join(", ")}`);
  invariant(
    triangleCount >= MIN_TRIANGLES,
    `asset is below the ${MIN_TRIANGLES}-triangle fidelity floor`,
  );
  invariant(triangleCount <= MAX_TRIANGLES, `asset exceeds the ${MAX_TRIANGLES}-triangle budget`);
  invariant(vertexCount <= MAX_VERTICES, `asset exceeds the ${MAX_VERTICES}-vertex budget`);

  return { slotCount: slots.size, vertexCount, triangleCount };
}

async function main() {
  const assetPath = resolve(process.argv[2] ?? DEFAULT_ASSET);
  const bytes = await readFile(assetPath);
  invariant(bytes.byteLength <= MAX_FILE_BYTES, `asset exceeds the ${MAX_FILE_BYTES}-byte budget`);
  const { document, binary } = readGlb(bytes);
  const result = validateDocument(document, binary);
  const displayPath = relative(process.cwd(), assetPath) || assetPath;
  console.log(
    `validated ${displayPath}: ${result.slotCount} slots, ${result.triangleCount} triangles, ${result.vertexCount} vertices, ${bytes.byteLength} bytes`,
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`replay asset validation failed: ${message}`);
  process.exitCode = 1;
}
