import { base } from "$app/paths";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const REPLAY_ASSET_PATH = "/replay-assets/rowplay-rigs-v1.glb";

export const REQUIRED_REPLAY_ASSET_SLOTS = [
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
] as const;

export type ReplayAssetSlot = (typeof REQUIRED_REPLAY_ASSET_SLOTS)[number];

export interface ReplayAssetLibrary {
  readonly byteLength: number;
  readonly geometries: ReadonlyMap<ReplayAssetSlot, THREE.BufferGeometry>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let cachedLibrary: Promise<ReplayAssetLibrary> | null = null;

function assetUrl(): string {
  return `${base}${REPLAY_ASSET_PATH}`;
}

function disposeParsedScene(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

export function collectReplayAssetLibrary(
  scene: THREE.Object3D,
  byteLength = 0,
): ReplayAssetLibrary {
  const geometries = new Map<ReplayAssetSlot, THREE.BufferGeometry>();
  try {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const slot = object.userData.replayAssetSlot;
      if (typeof slot !== "string") return;
      if (!REQUIRED_REPLAY_ASSET_SLOTS.includes(slot as ReplayAssetSlot)) return;
      if (geometries.has(slot as ReplayAssetSlot)) {
        throw new Error(`Duplicate replay asset slot: ${slot}`);
      }
      const geometry = object.geometry.clone();
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (
        !bounds ||
        !Number.isFinite(bounds.min.x + bounds.min.y + bounds.min.z) ||
        !Number.isFinite(bounds.max.x + bounds.max.y + bounds.max.z)
      ) {
        geometry.dispose();
        throw new Error(`Replay asset slot has invalid bounds: ${slot}`);
      }
      geometry.name = `authored:${slot}`;
      geometries.set(slot as ReplayAssetSlot, geometry);
    });

    const missing = REQUIRED_REPLAY_ASSET_SLOTS.filter((slot) => !geometries.has(slot));
    if (missing.length) {
      throw new Error(`Replay asset pack is missing slots: ${missing.join(", ")}`);
    }
    return { byteLength, geometries };
  } catch (error) {
    for (const geometry of geometries.values()) geometry.dispose();
    throw error;
  }
}

export async function fetchReplayAssetLibrary(
  fetchImpl: FetchLike = fetch,
): Promise<ReplayAssetLibrary> {
  const response = await fetchImpl(assetUrl());
  if (!response.ok) throw new Error(`Replay asset request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(bytes, "");
  try {
    return collectReplayAssetLibrary(gltf.scene, bytes.byteLength);
  } finally {
    disposeParsedScene(gltf.scene);
  }
}

/** Load the authored geometry once after the user asks for 3D. Failed loads are retryable. */
export function loadReplayAssetLibrary(fetchImpl: FetchLike = fetch): Promise<ReplayAssetLibrary> {
  if (!cachedLibrary) {
    cachedLibrary = fetchReplayAssetLibrary(fetchImpl).catch((error) => {
      cachedLibrary = null;
      throw error;
    });
  }
  return cachedLibrary;
}

/** Mark one existing rig mesh as the runtime target for an authored GLB shell. */
export function setReplayAssetSlot<T extends THREE.Mesh>(mesh: T, slot: ReplayAssetSlot): T {
  mesh.userData.replayAssetSlot = slot;
  return mesh;
}

/** Hide a procedural joint blend once overlapping authored limb shells are installed. */
export function hideWithReplayAssets<T extends THREE.Object3D>(object: T): T {
  object.userData.hideWithReplayAssets = true;
  return object;
}

/**
 * Clone authored shells onto a fully wired procedural rig. Kinematics, contact
 * anchors, materials and transforms remain owned by the existing renderer.
 */
export function applyReplayAssetLibrary(root: THREE.Object3D, library: ReplayAssetLibrary): number {
  let applied = 0;
  root.traverse((object) => {
    if (object.userData.hideWithReplayAssets === true) object.visible = false;
    if (!(object instanceof THREE.Mesh)) return;
    const slot = object.userData.replayAssetSlot as ReplayAssetSlot | undefined;
    if (!slot) return;
    const template = library.geometries.get(slot);
    if (!template) return;
    const previous = object.geometry;
    const geometry = template.clone();
    // Equipment objects already encode exact contact dimensions in their old
    // geometry and transforms. Fit the authored shell into those bounds so a
    // visual upgrade cannot move a wheel, hull, ski, blade, tube or pedal.
    const fitAllAxes =
      slot.startsWith("equipment:") || slot === "athlete:shoe" || slot === "athlete:neck";
    const fitCrossSectionOnly =
      slot === "athlete:upper-arm" ||
      slot === "athlete:forearm" ||
      slot === "athlete:thigh" ||
      slot === "athlete:shin";
    if (fitAllAxes || fitCrossSectionOnly) {
      previous.computeBoundingBox();
      geometry.computeBoundingBox();
      const source = geometry.boundingBox;
      const target = previous.boundingBox;
      if (source && target) {
        const sourceSize = source.getSize(new THREE.Vector3());
        const targetSize = target.getSize(new THREE.Vector3());
        const sourceCenter = source.getCenter(new THREE.Vector3());
        const targetCenter = target.getCenter(new THREE.Vector3());
        const limbWidth =
          slot === "athlete:upper-arm" || slot === "athlete:forearm"
            ? 1.42
            : slot === "athlete:thigh" || slot === "athlete:shin"
              ? 1.28
              : 1;
        const sx = sourceSize.x > 1e-6 ? (targetSize.x / sourceSize.x) * limbWidth : 1;
        const sy = sourceSize.y > 1e-6 ? (targetSize.y / sourceSize.y) * limbWidth : 1;
        // Authored limb shells intentionally extend beyond the old segment's
        // ±0.5 Z range so adjacent upper/lower parts overlap without ball
        // joints. Fit only their cross-section and retain that overlap.
        const sz = fitAllAxes && sourceSize.z > 1e-6 ? targetSize.z / sourceSize.z : 1;
        geometry.translate(-sourceCenter.x, -sourceCenter.y, -sourceCenter.z);
        geometry.scale(sx, sy, sz);
        geometry.translate(targetCenter.x, targetCenter.y, targetCenter.z);
        geometry.computeVertexNormals();
      }
    }
    previous.dispose();
    object.geometry = geometry;
    object.geometry.name = `authored-instance:${slot}`;
    object.userData.authoredReplayAsset = true;
    applied++;
  });
  root.userData.authoredReplayAssetCount = applied;
  return applied;
}

/** Test-only cache reset. */
export function resetReplayAssetLibraryCache(): void {
  if (cachedLibrary) {
    void cachedLibrary.then((library) => {
      for (const geometry of library.geometries.values()) geometry.dispose();
    });
  }
  cachedLibrary = null;
}
