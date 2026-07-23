import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { V4_BONE_NAMES } from "../src/lib/replay/rigV4.ts";

const DEFAULT_USDZ = "static/replay-assets/rowplay-athlete-v4.usdz";
const DEFAULT_CONTRACT = "static/replay-assets/rowplay-athlete-v4.contract.json";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function cloneUsdAthleteInstance(group) {
  const instance = clone(group);
  instance.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });
  return instance;
}

function skinnedMeshes(group) {
  const meshes = [];
  group.traverse((object) => {
    if (object.isSkinnedMesh) meshes.push(object);
  });
  return meshes;
}

function sortedNames(names) {
  return [...names].sort((left, right) => left.localeCompare(right));
}

function validateSkinnedMesh(mesh, contract) {
  const boneNames = mesh.skeleton.bones.map((bone) => bone.name);
  const semanticBoneNames = boneNames.filter((name) => V4_BONE_NAMES.includes(name));
  const helperBoneNames = boneNames.filter((name) => !V4_BONE_NAMES.includes(name));
  invariant(
    JSON.stringify(semanticBoneNames) === JSON.stringify(V4_BONE_NAMES),
    "V4 USDZ semantic bone order drifted",
  );
  invariant(new Set(boneNames).size === boneNames.length, "V4 USDZ has duplicate bone names");
  invariant(
    contract.bones?.semanticCount === V4_BONE_NAMES.length &&
      JSON.stringify(contract.bones?.semanticOrderedNames) === JSON.stringify(V4_BONE_NAMES) &&
      contract.bones?.totalCount === boneNames.length &&
      contract.bones?.helperCount === boneNames.length - V4_BONE_NAMES.length &&
      JSON.stringify(sortedNames(contract.bones?.helperNames ?? [])) ===
        JSON.stringify(sortedNames(helperBoneNames)),
    "V4 USDZ bone inventory drifted from the contract",
  );
  const position = mesh.geometry.getAttribute("position");
  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const skinWeight = mesh.geometry.getAttribute("skinWeight");
  invariant(position, "V4 USDZ mesh is missing positions");
  invariant(skinIndex?.count === position.count, "V4 USDZ skinIndex count drifted");
  invariant(skinWeight?.count === position.count, "V4 USDZ skinWeight count drifted");

  for (let vertex = 0; vertex < skinWeight.count; vertex++) {
    const sum =
      skinWeight.getX(vertex) +
      skinWeight.getY(vertex) +
      skinWeight.getZ(vertex) +
      skinWeight.getW(vertex);
    invariant(Number.isFinite(sum), "V4 USDZ contains non-finite skin weights");
    invariant(Math.abs(sum - 1) < 1e-5, "V4 USDZ skin weights are not normalized");
    for (let component = 0; component < 4; component++) {
      const bone = skinIndex.getComponent(vertex, component);
      invariant(
        Number.isInteger(bone) && bone >= 0 && bone < boneNames.length,
        "V4 USDZ skin index references an invalid bone",
      );
    }
  }

  let triangles = position.count / 3;
  const index = mesh.geometry.getIndex();
  if (index) triangles = index.count / 3;
  invariant(triangles === contract.mesh.triangles, "V4 USDZ triangle count drifted");

  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  invariant(box, "V4 USDZ has no bounds");
  invariant(
    [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite),
    "V4 USDZ has non-finite bounds",
  );
  invariant(box.max.x - box.min.x > 0.45, "V4 USDZ width is not recognisably the athlete");
  invariant(box.max.z - box.min.z > 1.6, "V4 USDZ height is not recognisably the athlete");
  for (const bone of mesh.skeleton.bones) {
    invariant(bone.matrix.elements.every(Number.isFinite), "V4 USDZ has an invalid rest matrix");
    invariant(
      bone.matrixWorld.elements.every(Number.isFinite),
      "V4 USDZ has an invalid world matrix",
    );
  }
}

export async function validateV4Usdz(usdzPath = DEFAULT_USDZ, contractPath = DEFAULT_CONTRACT) {
  const [assetBytes, contractText] = await Promise.all([
    readFile(usdzPath),
    readFile(contractPath, "utf8"),
  ]);
  const decoded = assetBytes.toString("latin1");
  for (const forbidden of ["http://", "https://", "file://", "/Users/"]) {
    invariant(!decoded.includes(forbidden), `V4 USDZ contains an external-looking reference`);
  }
  const contract = JSON.parse(contractText);
  const buffer = assetBytes.buffer.slice(
    assetBytes.byteOffset,
    assetBytes.byteOffset + assetBytes.byteLength,
  );
  const group = new USDLoader().parse(buffer);
  const meshes = skinnedMeshes(group);
  invariant(meshes.length === 1, `V4 USDZ must load one SkinnedMesh, received ${meshes.length}`);
  validateSkinnedMesh(meshes[0], contract);

  const first = cloneUsdAthleteInstance(group);
  const second = cloneUsdAthleteInstance(group);
  const firstSkins = skinnedMeshes(first);
  const secondSkins = skinnedMeshes(second);
  invariant(firstSkins.length === 1 && secondSkins.length === 1, "V4 USDZ clone lost its skin");
  invariant(firstSkins[0].skeleton !== secondSkins[0].skeleton, "V4 USDZ clones share skeletons");
  invariant(
    firstSkins[0].skeleton.bones[0] !== secondSkins[0].skeleton.bones[0],
    "V4 USDZ clones share bones",
  );
  invariant(firstSkins[0].material !== secondSkins[0].material, "V4 USDZ clones share material");

  return {
    path: resolve(usdzPath),
    bytes: assetBytes.byteLength,
    skinnedMeshes: meshes.length,
    bones: meshes[0].skeleton.bones.length,
    triangles: contract.mesh.triangles,
  };
}

if (resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = await validateV4Usdz(process.argv[2] ?? DEFAULT_USDZ);
    const displayPath = relative(process.cwd(), result.path) || result.path;
    console.log(
      `validated ${displayPath}: ${result.skinnedMeshes} SkinnedMesh, ${result.bones} bones, ${result.triangles} triangles, ${result.bytes} bytes`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`V4 USDZ validation failed: ${message}`);
    process.exitCode = 1;
  }
}
