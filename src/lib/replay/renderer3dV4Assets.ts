import { base } from "$app/paths";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinnedHierarchy } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Sport } from "../types";

/**
 * V4 is a separate, additive contract. V3 remains the procedural/contact-safe
 * fallback and is deliberately not imported or changed by this module.
 */
export const REPLAY_V4_ASSET_PATH = "/replay-assets/rowplay-athlete-v4.glb";

export const REPLAY_V4_CLIP_NAMES = Object.freeze({
  rower: "rowplay-v4-row-cycle",
  skierg: "rowplay-v4-ski-cycle",
  bike: "rowplay-v4-bike-cycle",
} as const satisfies Readonly<Record<Sport, string>>);

export type ReplayV4ClipName = (typeof REPLAY_V4_CLIP_NAMES)[Sport];

/** Runtime validator vocabulary stays independent of the repository authoring module. */
export const REPLAY_V4_BONE_NAMES = [
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

export type ReplayV4BoneName = (typeof REPLAY_V4_BONE_NAMES)[number];

export const REPLAY_V4_EFFECTOR_BONES = Object.freeze({
  leftHand: "v4LeftHand",
  rightHand: "v4RightHand",
  leftFoot: "v4LeftFoot",
  rightFoot: "v4RightFoot",
} as const satisfies Readonly<Record<string, ReplayV4BoneName>>);

export type ReplayV4EffectorName = keyof typeof REPLAY_V4_EFFECTOR_BONES;

export const REPLAY_V4_CONTACT_ROLES = Object.freeze({
  leftHand: "left-hand",
  rightHand: "right-hand",
  leftFoot: "left-foot",
  rightFoot: "right-foot",
} as const satisfies Readonly<Record<ReplayV4EffectorName, string>>);

export type ReplayV4ContactRole = (typeof REPLAY_V4_CONTACT_ROLES)[ReplayV4EffectorName];

export interface ReplayV4EffectorMetric {
  readonly bone: ReplayV4BoneName;
  readonly contactRole: ReplayV4ContactRole;
  /** Bone-local palm/sole contact target authored in glTF node extras. */
  readonly contactOffset: readonly [number, number, number];
  /** Hip/shoulder-to-middle-joint distance derived from the bind hierarchy. */
  readonly proximalLength: number;
  /** Middle-joint-to-effector-bone distance derived from the bind hierarchy. */
  readonly distalLength: number;
  readonly totalReach: number;
}

export type ReplayV4EffectorMetrics = Readonly<
  Record<ReplayV4EffectorName, ReplayV4EffectorMetric>
>;

export interface ReplayV4ClipTiming {
  readonly clip: THREE.AnimationClip;
  /** Normalized clip fraction at which authored drive ends and recovery begins. */
  readonly driveEnd: number;
}

export interface ReplayV4AssetTemplate {
  readonly byteLength: number;
  /** Parsed source hierarchy; never attach this directly to a renderer scene. */
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  readonly skeleton: THREE.Skeleton;
  readonly bones: Readonly<Record<ReplayV4BoneName, THREE.Bone>>;
  readonly clips: ReadonlyMap<ReplayV4ClipName, THREE.AnimationClip>;
  readonly clipsBySport: Readonly<Record<Sport, THREE.AnimationClip>>;
  readonly clipTimingBySport: Readonly<Record<Sport, ReplayV4ClipTiming>>;
  readonly effectors: ReplayV4EffectorMetrics;
}

export interface ReplayV4AthleteInstance {
  /** A SkeletonUtils clone with bones and materials independent of every sibling. */
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  readonly skeleton: THREE.Skeleton;
  readonly bones: Readonly<Record<ReplayV4BoneName, THREE.Bone>>;
  /** Clips are immutable template data and are safe to share across mixers. */
  readonly clips: ReadonlyMap<ReplayV4ClipName, THREE.AnimationClip>;
  readonly clipsBySport: Readonly<Record<Sport, THREE.AnimationClip>>;
  readonly clipTimingBySport: Readonly<Record<Sport, ReplayV4ClipTiming>>;
  readonly effectors: ReplayV4EffectorMetrics;
  readonly mixer: THREE.AnimationMixer;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface TemplateState {
  activeInstances: number;
  disposeRequested: boolean;
  disposed: boolean;
}

interface InstanceState {
  readonly template: ReplayV4AssetTemplate;
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly materials: readonly THREE.Material[];
  disposed: boolean;
}

const templateStates = new WeakMap<ReplayV4AssetTemplate, TemplateState>();
const instanceStates = new WeakMap<ReplayV4AthleteInstance, InstanceState>();
let cachedTemplate: Promise<ReplayV4AssetTemplate> | null = null;

function assetUrl(): string {
  return `${base}${REPLAY_V4_ASSET_PATH}`;
}

function finiteAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  description: string,
): void {
  for (let index = 0; index < attribute.count; index++) {
    for (let component = 0; component < attribute.itemSize; component++) {
      if (!Number.isFinite(attribute.getComponent(index, component))) {
        throw new Error(`Replay V4 ${description} contains a non-finite value`);
      }
    }
  }
}

function validateGeometry(mesh: THREE.SkinnedMesh): void {
  const { geometry, skeleton } = mesh;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const skinIndex = geometry.getAttribute("skinIndex");
  const skinWeight = geometry.getAttribute("skinWeight");
  if (!position || position.itemSize !== 3 || position.count === 0) {
    throw new Error("Replay V4 mesh is missing position data");
  }
  if (!normal || normal.itemSize !== 3 || normal.count !== position.count) {
    throw new Error("Replay V4 mesh is missing vertex normals");
  }
  if (!skinIndex || skinIndex.itemSize !== 4 || skinIndex.count !== position.count) {
    throw new Error("Replay V4 mesh has an invalid skinIndex attribute");
  }
  if (!skinWeight || skinWeight.itemSize !== 4 || skinWeight.count !== position.count) {
    throw new Error("Replay V4 mesh has an invalid skinWeight attribute");
  }

  finiteAttribute(position, "positions");
  finiteAttribute(normal, "normals");
  finiteAttribute(skinWeight, "skin weights");
  for (let vertex = 0; vertex < position.count; vertex++) {
    let weightTotal = 0;
    for (let influence = 0; influence < 4; influence++) {
      const boneIndex = skinIndex.getComponent(vertex, influence);
      const weight = skinWeight.getComponent(vertex, influence);
      if (!Number.isInteger(boneIndex) || boneIndex < 0 || boneIndex >= skeleton.bones.length) {
        throw new Error(`Replay V4 mesh has an invalid bone index at vertex ${vertex}`);
      }
      if (weight < 0 || weight > 1) {
        throw new Error(`Replay V4 mesh has an invalid skin weight at vertex ${vertex}`);
      }
      weightTotal += weight;
    }
    if (Math.abs(weightTotal - 1) > 1e-4) {
      throw new Error(`Replay V4 mesh has non-normalized skin weights at vertex ${vertex}`);
    }
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const bounds = geometry.boundingBox;
  const sphere = geometry.boundingSphere;
  if (
    !bounds ||
    !sphere ||
    ![
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
      sphere.center.x,
      sphere.center.y,
      sphere.center.z,
      sphere.radius,
    ].every(Number.isFinite) ||
    sphere.radius <= 0
  ) {
    throw new Error("Replay V4 mesh has invalid bounds");
  }
}

function meshMaterials(mesh: THREE.Mesh): readonly THREE.Material[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.length === 0) throw new Error("Replay V4 mesh has no material");
  for (const material of materials) {
    if (
      !Number.isFinite(material.opacity) ||
      material.opacity < 0 ||
      material.opacity > 1 ||
      typeof material.transparent !== "boolean" ||
      typeof material.depthWrite !== "boolean"
    ) {
      throw new Error(`Replay V4 mesh has invalid material semantics: ${material.name}`);
    }
  }
  return materials;
}

function collectBones(mesh: THREE.SkinnedMesh): Readonly<Record<ReplayV4BoneName, THREE.Bone>> {
  const { bones } = mesh.skeleton;
  if (bones.length !== REPLAY_V4_BONE_NAMES.length) {
    throw new Error(
      `Replay V4 skeleton must have ${REPLAY_V4_BONE_NAMES.length} bones, received ${bones.length}`,
    );
  }
  const names = new Set<string>();
  const result = {} as Record<ReplayV4BoneName, THREE.Bone>;
  for (const bone of bones) {
    if (!bone.name || names.has(bone.name)) {
      throw new Error(`Replay V4 skeleton has a missing or duplicate bone: ${bone.name}`);
    }
    names.add(bone.name);
  }
  for (const name of REPLAY_V4_BONE_NAMES) {
    const bone = mesh.skeleton.getBoneByName(name);
    if (!bone) throw new Error(`Replay V4 skeleton is missing bone: ${name}`);
    result[name] = bone;
  }
  if (mesh.skeleton.boneInverses.length !== bones.length) {
    throw new Error("Replay V4 skeleton has an invalid inverse-bind matrix count");
  }
  for (const inverse of mesh.skeleton.boneInverses) {
    if (!inverse.elements.every(Number.isFinite)) {
      throw new Error("Replay V4 skeleton has a non-finite inverse-bind matrix");
    }
  }
  return Object.freeze(result);
}

function localContactOffset(
  bone: THREE.Bone,
  role: ReplayV4ContactRole,
): readonly [number, number, number] {
  const value: unknown = bone.userData.replayContactOffset;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((component) => typeof component === "number" && Number.isFinite(component))
  ) {
    throw new Error(`Replay V4 bone has an invalid contact offset: ${bone.name}`);
  }
  if (bone.userData.replayContactRole !== role) {
    throw new Error(`Replay V4 bone has an invalid contact role: ${bone.name}`);
  }
  return Object.freeze([value[0], value[1], value[2]] as const);
}

function effectorMetric(
  bones: Readonly<Record<ReplayV4BoneName, THREE.Bone>>,
  effector: ReplayV4EffectorName,
  middle: ReplayV4BoneName,
): ReplayV4EffectorMetric {
  const boneName = REPLAY_V4_EFFECTOR_BONES[effector];
  const contactRole = REPLAY_V4_CONTACT_ROLES[effector];
  const bone = bones[boneName];
  const proximalLength = bones[middle].position.length();
  const distalLength = bone.position.length();
  const contactOffset = localContactOffset(bone, contactRole);
  const contactLength = Math.hypot(...contactOffset);
  if (
    !Number.isFinite(proximalLength) ||
    !Number.isFinite(distalLength) ||
    proximalLength <= 0 ||
    distalLength <= 0
  ) {
    throw new Error(`Replay V4 rig has an invalid ${effector} chain length`);
  }
  return Object.freeze({
    bone: boneName,
    contactRole,
    contactOffset,
    proximalLength,
    distalLength,
    totalReach: proximalLength + distalLength + contactLength,
  });
}

function collectEffectorMetrics(
  bones: Readonly<Record<ReplayV4BoneName, THREE.Bone>>,
): ReplayV4EffectorMetrics {
  return Object.freeze({
    leftHand: effectorMetric(bones, "leftHand", "v4LeftForearm"),
    rightHand: effectorMetric(bones, "rightHand", "v4RightForearm"),
    leftFoot: effectorMetric(bones, "leftFoot", "v4LeftLowerLeg"),
    rightFoot: effectorMetric(bones, "rightFoot", "v4RightLowerLeg"),
  });
}

function validateClip(clip: THREE.AnimationClip): number {
  if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.tracks.length === 0) {
    throw new Error(`Replay V4 clip has invalid timing or no tracks: ${clip.name}`);
  }
  for (const track of clip.tracks) {
    if (track.times.length < 2 || track.values.length === 0) {
      throw new Error(`Replay V4 clip has an empty track: ${clip.name}/${track.name}`);
    }
    let previous = -Infinity;
    for (const time of track.times) {
      if (!Number.isFinite(time) || time < previous || time < 0 || time > clip.duration + 1e-5) {
        throw new Error(`Replay V4 clip has invalid key times: ${clip.name}/${track.name}`);
      }
      previous = time;
    }
    for (const value of track.values) {
      if (!Number.isFinite(value)) {
        throw new Error(`Replay V4 clip has non-finite values: ${clip.name}/${track.name}`);
      }
    }
  }
  if (!clip.validate()) throw new Error(`Replay V4 clip failed Three.js validation: ${clip.name}`);
  const driveEnd: unknown = clip.userData.replayDriveEnd;
  if (
    typeof driveEnd !== "number" ||
    !Number.isFinite(driveEnd) ||
    driveEnd <= 0 ||
    driveEnd >= 1
  ) {
    throw new Error(`Replay V4 clip has an invalid replayDriveEnd fraction: ${clip.name}`);
  }
  return driveEnd;
}

function collectClips(animations: readonly THREE.AnimationClip[]): {
  readonly clips: ReadonlyMap<ReplayV4ClipName, THREE.AnimationClip>;
  readonly clipsBySport: Readonly<Record<Sport, THREE.AnimationClip>>;
  readonly clipTimingBySport: Readonly<Record<Sport, ReplayV4ClipTiming>>;
} {
  const requiredNames = Object.values(REPLAY_V4_CLIP_NAMES) as ReplayV4ClipName[];
  if (animations.length !== requiredNames.length) {
    throw new Error(
      `Replay V4 asset must contain exactly ${requiredNames.length} clips, received ${animations.length}`,
    );
  }
  const clips = new Map<ReplayV4ClipName, THREE.AnimationClip>();
  const timings = new Map<ReplayV4ClipName, ReplayV4ClipTiming>();
  for (const clip of animations) {
    if (!requiredNames.includes(clip.name as ReplayV4ClipName)) {
      throw new Error(`Replay V4 asset contains an unexpected clip: ${clip.name}`);
    }
    const name = clip.name as ReplayV4ClipName;
    if (clips.has(name)) throw new Error(`Replay V4 asset contains a duplicate clip: ${name}`);
    const driveEnd = validateClip(clip);
    clips.set(name, clip);
    timings.set(name, Object.freeze({ clip, driveEnd }));
  }
  for (const name of requiredNames) {
    if (!clips.has(name)) throw new Error(`Replay V4 asset is missing clip: ${name}`);
  }
  const clipsBySport = Object.freeze({
    rower: clips.get(REPLAY_V4_CLIP_NAMES.rower)!,
    skierg: clips.get(REPLAY_V4_CLIP_NAMES.skierg)!,
    bike: clips.get(REPLAY_V4_CLIP_NAMES.bike)!,
  });
  const clipTimingBySport = Object.freeze({
    rower: timings.get(REPLAY_V4_CLIP_NAMES.rower)!,
    skierg: timings.get(REPLAY_V4_CLIP_NAMES.skierg)!,
    bike: timings.get(REPLAY_V4_CLIP_NAMES.bike)!,
  });
  return { clips, clipsBySport, clipTimingBySport };
}

function findOnlySkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  if (meshes.length !== 1 || !(meshes[0] instanceof THREE.SkinnedMesh)) {
    throw new Error(
      `Replay V4 asset must contain exactly one SkinnedMesh, received ${meshes.length} mesh objects`,
    );
  }
  return meshes[0];
}

/** Validate and retain one parsed, repository-owned V4 source hierarchy. */
export function collectReplayV4AssetTemplate(
  root: THREE.Group,
  animations: readonly THREE.AnimationClip[],
  byteLength = 0,
): ReplayV4AssetTemplate {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error("Replay V4 asset byte length must be finite and non-negative");
  }
  const mesh = findOnlySkinnedMesh(root);
  meshMaterials(mesh);
  const bones = collectBones(mesh);
  const effectors = collectEffectorMetrics(bones);
  validateGeometry(mesh);
  const { clips, clipsBySport, clipTimingBySport } = collectClips(animations);
  const template: ReplayV4AssetTemplate = {
    byteLength,
    root,
    mesh,
    skeleton: mesh.skeleton,
    bones,
    clips,
    clipsBySport,
    clipTimingBySport,
    effectors,
  };
  templateStates.set(template, {
    activeInstances: 0,
    disposeRequested: false,
    disposed: false,
  });
  return template;
}

function materialTextures(material: THREE.Material): readonly THREE.Texture[] {
  const textures = new Set<THREE.Texture>();
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.add(value);
  }
  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      const value: unknown = uniform.value;
      if (value instanceof THREE.Texture) textures.add(value);
      else if (Array.isArray(value)) {
        for (const entry of value) if (entry instanceof THREE.Texture) textures.add(entry);
      }
    }
  }
  return [...textures];
}

function disposeTemplateResources(template: ReplayV4AssetTemplate, state: TemplateState): void {
  if (state.disposed) return;
  state.disposed = true;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  template.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of meshMaterials(object)) {
      materials.add(material);
      for (const texture of materialTextures(material)) textures.add(texture);
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const texture of textures) {
    try {
      texture.dispose();
    } catch (e) {
      console.warn("[v4assets] texture dispose failed:", e);
    }
  }
  for (const material of materials) {
    try {
      material.dispose();
    } catch (e) {
      console.warn("[v4assets] material dispose failed:", e);
    }
  }
  for (const geometry of geometries) {
    try {
      geometry.dispose();
    } catch (e) {
      console.warn("[v4assets] geometry dispose failed:", e);
    }
  }
  for (const skeleton of skeletons) {
    try {
      skeleton.dispose();
    } catch (e) {
      console.warn("[v4assets] skeleton dispose failed:", e);
    }
  }
  template.root.removeFromParent();
}

/**
 * Dispose template GPU resources after all instances are gone. If a renderer
 * still owns a clone, disposal is deferred until its instance is released.
 */
export function disposeReplayV4AssetTemplate(template: ReplayV4AssetTemplate): void {
  const state = templateStates.get(template);
  if (!state || state.disposed) return;
  state.disposeRequested = true;
  if (state.activeInstances === 0) disposeTemplateResources(template, state);
}

function disposeParsedFailure(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const texture of materialTextures(material)) textures.add(texture);
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const texture of textures) {
    try {
      texture.dispose();
    } catch {
      /* best-effort cleanup */
    }
  }
  for (const material of materials) {
    try {
      material.dispose();
    } catch {
      /* best-effort cleanup */
    }
  }
  for (const geometry of geometries) {
    try {
      geometry.dispose();
    } catch {
      /* best-effort cleanup */
    }
  }
  for (const skeleton of skeletons) {
    try {
      skeleton.dispose();
    } catch {
      /* best-effort cleanup */
    }
  }
}

function createLocalV4Loader(): GLTFLoader {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    // Embedded image data can be materialized as data/blob URLs by GLTFLoader.
    // Any other dependency would escape the reviewed, single-file local GLB.
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    throw new Error(`Replay V4 asset contains an external dependency: ${url}`);
  });
  return new GLTFLoader(manager);
}

export async function fetchReplayV4Asset(
  fetchImpl: FetchLike = fetch,
): Promise<ReplayV4AssetTemplate> {
  const response = await fetchImpl(assetUrl());
  if (!response.ok) throw new Error(`Replay V4 asset request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  let gltf: Awaited<ReturnType<GLTFLoader["parseAsync"]>> | undefined;
  try {
    gltf = await createLocalV4Loader().parseAsync(bytes, "");
    return collectReplayV4AssetTemplate(gltf.scene, gltf.animations, bytes.byteLength);
  } catch (error) {
    if (gltf) disposeParsedFailure(gltf.scene);
    throw error;
  }
}

/** Cache a successful local V4 parse. A rejected load is removed so a retry is possible. */
export function loadReplayV4Asset(fetchImpl: FetchLike = fetch): Promise<ReplayV4AssetTemplate> {
  if (!cachedTemplate) {
    cachedTemplate = fetchReplayV4Asset(fetchImpl).catch((error) => {
      cachedTemplate = null;
      throw error;
    });
  }
  return cachedTemplate;
}

/** Optional hero path: any request, parse, or validation error cleanly selects V3 fallback. */
export async function loadOptionalReplayV4Asset(
  fetchImpl: FetchLike = fetch,
): Promise<ReplayV4AssetTemplate | null> {
  try {
    return await loadReplayV4Asset(fetchImpl);
  } catch {
    return null;
  }
}

function cloneInstanceResources(mesh: THREE.SkinnedMesh): {
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly materials: readonly THREE.Material[];
} {
  const geometry = mesh.geometry.clone();
  mesh.geometry = geometry;
  const source = meshMaterials(mesh);
  const cloned = source.map((material) => material.clone());
  mesh.material = (Array.isArray(mesh.material) ? cloned : cloned[0]) as
    | THREE.Material
    | THREE.Material[];
  return { geometries: [geometry], materials: cloned };
}

/** Create one independent live/ghost athlete from immutable template data. */
export function createReplayV4AthleteInstance(
  template: ReplayV4AssetTemplate,
): ReplayV4AthleteInstance {
  const templateState = templateStates.get(template);
  if (!templateState || templateState.disposed || templateState.disposeRequested) {
    throw new Error("Replay V4 asset template is not available for cloning");
  }

  let root: THREE.Group | undefined;
  let mesh: THREE.SkinnedMesh | undefined;
  let geometries: readonly THREE.BufferGeometry[] = [];
  let materials: readonly THREE.Material[] = [];
  try {
    root = cloneSkinnedHierarchy(template.root) as THREE.Group;
    mesh = findOnlySkinnedMesh(root);
    ({ geometries, materials } = cloneInstanceResources(mesh));
    const bones = collectBones(mesh);
    const mixer = new THREE.AnimationMixer(root);
    const instance: ReplayV4AthleteInstance = {
      root,
      mesh,
      skeleton: mesh.skeleton,
      bones,
      clips: template.clips,
      clipsBySport: template.clipsBySport,
      clipTimingBySport: template.clipTimingBySport,
      effectors: template.effectors,
      mixer,
    };
    templateState.activeInstances++;
    instanceStates.set(instance, { template, geometries, materials, disposed: false });
    return instance;
  } catch (error) {
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    // If cloneInstanceResources already attached a cloned geometry to the
    // mesh but failed before returning the geometries array, clean it up.
    if (mesh && mesh.geometry !== template.mesh.geometry) {
      mesh.geometry.dispose();
    }
    mesh?.skeleton.dispose();
    root?.removeFromParent();
    throw error;
  }
}

/** Clone-safe fallback helper for renderer construction. */
export function tryCreateReplayV4AthleteInstance(
  template: ReplayV4AssetTemplate | null | undefined,
): ReplayV4AthleteInstance | null {
  if (!template) return null;
  try {
    return createReplayV4AthleteInstance(template);
  } catch {
    return null;
  }
}

/** Dispose mixer state and every geometry/material/skeleton owned by this lane. */
export function disposeReplayV4AthleteInstance(instance: ReplayV4AthleteInstance): void {
  const state = instanceStates.get(instance);
  if (!state || state.disposed) return;
  state.disposed = true;
  try {
    instance.mixer.stopAllAction();
  } catch {
    /* best-effort */
  }
  try {
    instance.mixer.uncacheRoot(instance.root);
  } catch {
    /* best-effort */
  }
  for (const material of state.materials) {
    try {
      material.dispose();
    } catch {
      /* best-effort cleanup */
    }
  }
  for (const geometry of state.geometries) {
    try {
      geometry.dispose();
    } catch {
      /* best-effort cleanup */
    }
  }
  try {
    instance.skeleton.dispose();
  } catch {
    /* best-effort cleanup */
  }
  try {
    instance.root.removeFromParent();
  } catch {
    /* best-effort cleanup */
  }

  const templateState = templateStates.get(state.template);
  if (!templateState) return;
  templateState.activeInstances = Math.max(0, templateState.activeInstances - 1);
  if (templateState.disposeRequested && templateState.activeInstances === 0) {
    disposeTemplateResources(state.template, templateState);
  }
}

/** Test/dev cache reset; active instances keep template resources until released. */
export function resetReplayV4AssetCache(): void {
  const pending = cachedTemplate;
  cachedTemplate = null;
  if (pending) {
    void pending.then(disposeReplayV4AssetTemplate, () => undefined);
  }
}
