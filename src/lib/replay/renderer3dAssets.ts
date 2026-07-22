import { base } from "$app/paths";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// v2 corrects the limb direction contract and adds authored elbow and Nordic
// pole hardware shells. Keep this explicit rather than silently replacing v1:
// the pack's slot vocabulary is a renderer/runtime contract.
export const REPLAY_ASSET_PATH = "/replay-assets/rowplay-rigs-v2.glb";

// v3 adds composite equipment templates while retaining v2 leaf slots. It is
// deliberately a new file because a renderer that only understands fitted leaf
// shells must continue to be able to load the v2 contract unchanged.
export const REPLAY_ASSET_V3_PATH = "/replay-assets/rowplay-rigs-v3.glb";

export const REPLAY_ASSET_MATERIAL_ROLES = [
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
] as const;

export type ReplayAssetMaterialRole = (typeof REPLAY_ASSET_MATERIAL_ROLES)[number];

const REPLAY_ASSET_MATERIAL_ROLE_SET = new Set<string>(REPLAY_ASSET_MATERIAL_ROLES);

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
] as const;

export type ReplayAssetSlot = (typeof REQUIRED_REPLAY_ASSET_SLOTS)[number];

/**
 * V3 leaves deliberately cover the articulated athlete plus row blade and
 * Nordic pole hardware. Hulls, skis and BikeErg assemblies are composites.
 */
export const REQUIRED_REPLAY_ASSET_V3_LEAF_SLOTS = [
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
] as const satisfies readonly ReplayAssetSlot[];

/** A stable name baked into a v3 composite root. */
export type ReplayAssetTemplateSlot = string;

export interface ReplayAssetTemplateManifestEntry {
  readonly template: ReplayAssetTemplateSlot;
  readonly partCount: number;
  readonly materialRoles: readonly ReplayAssetMaterialRole[];
}

/**
 * V3's manifest is derived from the named composite roots, not from source
 * glTF materials. The exporter writes the same metadata to every build, and
 * this runtime validates it before any fallback object can be hidden.
 */
export interface ReplayAssetTemplateManifest {
  readonly version: 3;
  readonly templates: readonly ReplayAssetTemplateManifestEntry[];
}

/** A material-free snapshot of one composite subtree. */
export interface ReplayAssetTemplateNode {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
  readonly visible: boolean;
  readonly children: readonly ReplayAssetTemplateNode[];
  readonly geometry?: THREE.BufferGeometry;
  readonly materialRole?: ReplayAssetMaterialRole;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly frustumCulled?: boolean;
  readonly renderOrder?: number;
}

export interface ReplayAssetTemplate {
  readonly manifest: ReplayAssetTemplateManifestEntry;
  readonly root: ReplayAssetTemplateNode;
}

/**
 * Existing v2 consumers use `geometries`; v3 libraries retain it (possibly
 * empty) so the same renderer option can safely carry either contract.
 */
export interface ReplayAssetLibrary {
  readonly byteLength: number;
  readonly geometries: ReadonlyMap<ReplayAssetSlot, THREE.BufferGeometry>;
  readonly version?: 2 | 3;
  readonly legacySlotsComplete?: boolean;
  readonly v3LeafSlotsComplete?: boolean;
  readonly manifest?: ReplayAssetTemplateManifest;
  readonly templates?: ReadonlyMap<ReplayAssetTemplateSlot, ReplayAssetTemplate>;
}

export interface ReplayAssetTemplateLibrary extends ReplayAssetLibrary {
  readonly version: 3;
  readonly manifest: ReplayAssetTemplateManifest;
  readonly templates: ReadonlyMap<ReplayAssetTemplateSlot, ReplayAssetTemplate>;
}

/**
 * Runtime owns identity, theme and physical finish. A resolver returns a base
 * material which is cloned for each attached mesh, so neither source glTF
 * material nor a live/ghost sibling is disposed by another rig.
 */
export type ReplayAssetMaterialResolver = (
  role: ReplayAssetMaterialRole,
  target: THREE.Object3D,
  template: ReplayAssetTemplateManifestEntry,
) => THREE.Material | null | undefined;

export interface ReplayAssetTemplateAnchorOptions {
  /** Only these exact procedural objects are hidden, and only after success. */
  readonly fallback?: readonly THREE.Object3D[];
}

interface ReplayAssetTemplateAttachment {
  readonly template: ReplayAssetTemplateSlot;
  readonly fallback: readonly THREE.Object3D[];
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let cachedLibrary: Promise<ReplayAssetLibrary> | null = null;
let cachedTemplateLibrary: Promise<ReplayAssetTemplateLibrary> | null = null;

const TEMPLATE_ATTACHMENT_KEY = "replayAssetTemplateAttachment";
const TEMPLATE_INSTANCE_KEY = "authoredReplayAssetTemplateInstance";
const TEMPLATE_ERROR_KEY = "authoredReplayAssetTemplateError";

function assetUrl(path = REPLAY_ASSET_PATH): string {
  return `${base}${path}`;
}

function disposeParsedScene(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

function disposeTemplateNode(
  node: ReplayAssetTemplateNode,
  disposed: Set<THREE.BufferGeometry>,
): void {
  if (node.geometry && !disposed.has(node.geometry)) {
    disposed.add(node.geometry);
    node.geometry.dispose();
  }
  for (const child of node.children) disposeTemplateNode(child, disposed);
}

function disposeReplayAssetLibrary(library: ReplayAssetLibrary): void {
  const disposed = new Set<THREE.BufferGeometry>();
  for (const geometry of library.geometries.values()) {
    if (disposed.has(geometry)) continue;
    disposed.add(geometry);
    geometry.dispose();
  }
  for (const template of library.templates?.values() ?? []) {
    disposeTemplateNode(template.root, disposed);
  }
}

/** Dispose cached v3 template geometry after a renderer-independent test/use. */
export function disposeReplayAssetTemplateLibrary(library: ReplayAssetTemplateLibrary): void {
  disposeReplayAssetLibrary(library);
}

function cloneFiniteGeometry(
  source: THREE.BufferGeometry,
  description: string,
): THREE.BufferGeometry {
  const position = source.getAttribute("position");
  if (!position || position.itemSize < 3 || position.count === 0) {
    throw new Error(`Replay asset geometry is missing positions: ${description}`);
  }
  for (let index = 0; index < position.count; index++) {
    if (
      !Number.isFinite(position.getX(index)) ||
      !Number.isFinite(position.getY(index)) ||
      !Number.isFinite(position.getZ(index))
    ) {
      throw new Error(`Replay asset geometry has non-finite positions: ${description}`);
    }
  }
  const geometry = source.clone();
  try {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (
      !bounds ||
      !Number.isFinite(bounds.min.x + bounds.min.y + bounds.min.z) ||
      !Number.isFinite(bounds.max.x + bounds.max.y + bounds.max.z)
    ) {
      throw new Error(`Replay asset slot has invalid bounds: ${description}`);
    }
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

function collectLegacyGeometries(
  scene: THREE.Object3D,
  requiredSlots: readonly ReplayAssetSlot[],
): Map<ReplayAssetSlot, THREE.BufferGeometry> {
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
      const geometry = cloneFiniteGeometry(object.geometry, slot);
      geometry.name = `authored:${slot}`;
      geometries.set(slot as ReplayAssetSlot, geometry);
    });

    const missing = requiredSlots.filter((slot) => !geometries.has(slot));
    if (missing.length) {
      throw new Error(`Replay asset pack is missing slots: ${missing.join(", ")}`);
    }
    return geometries;
  } catch (error) {
    for (const geometry of geometries.values()) geometry.dispose();
    throw error;
  }
}

export function collectReplayAssetLibrary(
  scene: THREE.Object3D,
  byteLength = 0,
): ReplayAssetLibrary {
  return {
    byteLength,
    geometries: collectLegacyGeometries(scene, REQUIRED_REPLAY_ASSET_SLOTS),
    version: 2,
    legacySlotsComplete: true,
  };
}

function isMaterialRole(value: unknown): value is ReplayAssetMaterialRole {
  return typeof value === "string" && REPLAY_ASSET_MATERIAL_ROLE_SET.has(value);
}

function readTemplateSlot(value: unknown, description: string): ReplayAssetTemplateSlot {
  if (typeof value !== "string" || !/^[a-z][a-z0-9:_-]*$/i.test(value)) {
    throw new Error(`Replay asset V3 template has an invalid slot: ${description}`);
  }
  return value;
}

function finiteVector(values: readonly number[], description: string): void {
  if (!values.every(Number.isFinite)) {
    throw new Error(`Replay asset V3 template has a non-finite transform: ${description}`);
  }
}

function copyTransform(
  source: THREE.Object3D,
  description: string,
): Pick<ReplayAssetTemplateNode, "position" | "quaternion" | "scale"> {
  const position = [source.position.x, source.position.y, source.position.z] as const;
  const quaternion = [
    source.quaternion.x,
    source.quaternion.y,
    source.quaternion.z,
    source.quaternion.w,
  ] as const;
  const scale = [source.scale.x, source.scale.y, source.scale.z] as const;
  finiteVector(position, description);
  finiteVector(quaternion, description);
  finiteVector(scale, description);
  if (scale.some((value) => Math.abs(value) < 1e-8)) {
    throw new Error(`Replay asset V3 template has a zero scale: ${description}`);
  }
  return { position, quaternion, scale };
}

function isIdentityTemplateRoot(root: THREE.Object3D): boolean {
  const epsilon = 1e-6;
  return (
    root.position.lengthSq() < epsilon &&
    Math.abs(root.quaternion.x) < epsilon &&
    Math.abs(root.quaternion.y) < epsilon &&
    Math.abs(root.quaternion.z) < epsilon &&
    Math.abs(root.quaternion.w - 1) < epsilon &&
    Math.abs(root.scale.x - 1) < epsilon &&
    Math.abs(root.scale.y - 1) < epsilon &&
    Math.abs(root.scale.z - 1) < epsilon
  );
}

interface TemplateSnapshotState {
  readonly template: ReplayAssetTemplateSlot;
  readonly roles: Set<ReplayAssetMaterialRole>;
  meshCount: number;
}

function snapshotTemplateNode(
  source: THREE.Object3D,
  state: TemplateSnapshotState,
): ReplayAssetTemplateNode {
  const nodeSlot = source.userData.replayAssetTemplateSlot;
  if (nodeSlot !== undefined && nodeSlot !== state.template) {
    throw new Error(
      `Replay asset V3 template ${state.template} has a child assigned to ${String(nodeSlot)}`,
    );
  }

  const description = `${state.template}/${source.name || source.type}`;
  const transform = copyTransform(source, description);
  const children: ReplayAssetTemplateNode[] = [];
  let geometry: THREE.BufferGeometry | undefined;
  let materialRole: ReplayAssetMaterialRole | undefined;
  if (source instanceof THREE.Mesh) {
    if (source instanceof THREE.InstancedMesh || source instanceof THREE.SkinnedMesh) {
      throw new Error(`Replay asset V3 template uses an unsupported mesh: ${description}`);
    }
    materialRole = source.userData.replayMaterialRole;
    if (!isMaterialRole(materialRole)) {
      throw new Error(`Replay asset V3 template has an invalid material role: ${description}`);
    }
    geometry = cloneFiniteGeometry(source.geometry, description);
    state.roles.add(materialRole);
    state.meshCount++;
  } else if (
    "geometry" in source &&
    (source as { geometry?: unknown }).geometry instanceof THREE.BufferGeometry
  ) {
    throw new Error(`Replay asset V3 template uses an unsupported drawable: ${description}`);
  }

  try {
    for (const child of source.children) children.push(snapshotTemplateNode(child, state));
    return {
      name: source.name,
      ...transform,
      visible: source.visible,
      children,
      ...(geometry ? { geometry } : {}),
      ...(materialRole ? { materialRole } : {}),
      ...(source instanceof THREE.Mesh
        ? {
            castShadow: source.castShadow,
            receiveShadow: source.receiveShadow,
            frustumCulled: source.frustumCulled,
            renderOrder: source.renderOrder,
          }
        : {}),
    };
  } catch (error) {
    if (geometry) geometry.dispose();
    for (const child of children) disposeTemplateNode(child, new Set());
    throw error;
  }
}

function readDeclaredRoles(
  value: unknown,
  template: ReplayAssetTemplateSlot,
): readonly ReplayAssetMaterialRole[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isMaterialRole)) {
    throw new Error(`Replay asset V3 template has invalid declared material roles: ${template}`);
  }
  const roles = [...value].sort();
  if (new Set(roles).size !== roles.length) {
    throw new Error(`Replay asset V3 template has duplicate declared material roles: ${template}`);
  }
  return roles;
}

function sameRoles(
  actual: ReadonlySet<ReplayAssetMaterialRole>,
  declared: readonly ReplayAssetMaterialRole[],
): boolean {
  return actual.size === declared.length && declared.every((role) => actual.has(role));
}

function collectReplayAssetTemplates(scene: THREE.Object3D): {
  manifest: ReplayAssetTemplateManifest;
  templates: ReadonlyMap<ReplayAssetTemplateSlot, ReplayAssetTemplate>;
} {
  const roots: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.replayAssetKind === "composite") roots.push(object);
  });
  if (!roots.length) throw new Error("Replay asset V3 pack is missing composite templates");

  const rootSlots = new Map<ReplayAssetTemplateSlot, THREE.Object3D>();
  for (const root of roots) {
    const template = readTemplateSlot(
      root.userData.replayAssetTemplateSlot,
      root.name || root.type,
    );
    if (root.userData.replayAssetVersion !== 3) {
      throw new Error(`Replay asset V3 template has an invalid version: ${template}`);
    }
    if (!isIdentityTemplateRoot(root)) {
      throw new Error(`Replay asset V3 template root must have identity transforms: ${template}`);
    }
    if (rootSlots.has(template)) throw new Error(`Duplicate replay asset V3 template: ${template}`);
    rootSlots.set(template, root);
  }
  for (const root of roots) {
    let parent = root.parent;
    while (parent) {
      if (roots.includes(parent)) {
        throw new Error("Replay asset V3 templates cannot be nested");
      }
      parent = parent.parent;
    }
  }

  const templates = new Map<ReplayAssetTemplateSlot, ReplayAssetTemplate>();
  try {
    for (const [template, root] of [...rootSlots].sort(([a], [b]) => a.localeCompare(b))) {
      const declaredPartCount = root.userData.replayAssetPartCount;
      if (!Number.isInteger(declaredPartCount) || declaredPartCount < 1) {
        throw new Error(`Replay asset V3 template has an invalid part count: ${template}`);
      }
      const declaredRoles = readDeclaredRoles(root.userData.replayMaterialRoles, template);
      const state: TemplateSnapshotState = { template, roles: new Set(), meshCount: 0 };
      const snapshot = snapshotTemplateNode(root, state);
      if (state.meshCount !== declaredPartCount) {
        disposeTemplateNode(snapshot, new Set());
        throw new Error(`Replay asset V3 template part count does not match meshes: ${template}`);
      }
      if (!sameRoles(state.roles, declaredRoles)) {
        disposeTemplateNode(snapshot, new Set());
        throw new Error(`Replay asset V3 template material roles do not match meshes: ${template}`);
      }
      const manifest: ReplayAssetTemplateManifestEntry = {
        template,
        partCount: state.meshCount,
        materialRoles: declaredRoles,
      };
      templates.set(template, { manifest, root: snapshot });
    }
    return {
      manifest: {
        version: 3,
        templates: [...templates.values()].map((template) => template.manifest),
      },
      templates,
    };
  } catch (error) {
    for (const template of templates.values()) disposeTemplateNode(template.root, new Set());
    throw error;
  }
}

/**
 * Collect a v3 local asset package. Its explicit leaf contract protects every
 * articulated athlete surface while composites own the larger sport assemblies.
 */
export function collectReplayAssetTemplateLibrary(
  scene: THREE.Object3D,
  byteLength = 0,
): ReplayAssetTemplateLibrary {
  const geometries = collectLegacyGeometries(scene, REQUIRED_REPLAY_ASSET_V3_LEAF_SLOTS);
  try {
    const { manifest, templates } = collectReplayAssetTemplates(scene);
    return {
      byteLength,
      geometries,
      version: 3,
      legacySlotsComplete: geometries.size === REQUIRED_REPLAY_ASSET_SLOTS.length,
      v3LeafSlotsComplete: true,
      manifest,
      templates,
    };
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

/** Load the v3 composite library after 3D is requested; failure remains retryable. */
export async function fetchReplayAssetTemplateLibrary(
  fetchImpl: FetchLike = fetch,
): Promise<ReplayAssetTemplateLibrary> {
  const response = await fetchImpl(assetUrl(REPLAY_ASSET_V3_PATH));
  if (!response.ok) throw new Error(`Replay asset request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(bytes, "");
  try {
    return collectReplayAssetTemplateLibrary(gltf.scene, bytes.byteLength);
  } finally {
    disposeParsedScene(gltf.scene);
  }
}

/** Load the v2 authored geometry once after the user asks for 3D. Failed loads are retryable. */
export function loadReplayAssetLibrary(fetchImpl: FetchLike = fetch): Promise<ReplayAssetLibrary> {
  if (!cachedLibrary) {
    cachedLibrary = fetchReplayAssetLibrary(fetchImpl).catch((error) => {
      cachedLibrary = null;
      throw error;
    });
  }
  return cachedLibrary;
}

/** Load the optional v3 composite package once after the user asks for 3D. */
export function loadReplayAssetTemplateLibrary(
  fetchImpl: FetchLike = fetch,
): Promise<ReplayAssetTemplateLibrary> {
  if (!cachedTemplateLibrary) {
    cachedTemplateLibrary = fetchReplayAssetTemplateLibrary(fetchImpl).catch((error) => {
      cachedTemplateLibrary = null;
      throw error;
    });
  }
  return cachedTemplateLibrary;
}

/** Mark one existing rig mesh as the runtime target for a v2 authored GLB shell. */
export function setReplayAssetSlot<T extends THREE.Mesh>(mesh: T, slot: ReplayAssetSlot): T {
  mesh.userData.replayAssetSlot = slot;
  return mesh;
}

/** Hide a procedural v2 joint blend once overlapping authored leaf shells are installed. */
export function hideWithReplayAssets<T extends THREE.Object3D>(object: T): T {
  object.userData.hideWithReplayAssets = true;
  return object;
}

/**
 * Bind a v3 composite to an existing contact-safe rig node. `fallback` is an
 * explicit object list rather than a broad name query: it remains visible when
 * this exact composite is absent, invalid, or cannot resolve a runtime material.
 */
export function setReplayAssetTemplateAnchor<T extends THREE.Object3D>(
  anchor: T,
  template: ReplayAssetTemplateSlot,
  options: ReplayAssetTemplateAnchorOptions = {},
): T {
  const validTemplate = readTemplateSlot(template, "runtime anchor");
  const fallback = [...(options.fallback ?? [])];
  if (fallback.some((object) => !(object instanceof THREE.Object3D))) {
    throw new Error(`Replay asset template anchor has an invalid fallback: ${validTemplate}`);
  }
  if (fallback.includes(anchor)) {
    throw new Error(`Replay asset template anchor cannot hide itself: ${validTemplate}`);
  }
  anchor.userData[TEMPLATE_ATTACHMENT_KEY] = {
    template: validTemplate,
    fallback,
  } satisfies ReplayAssetTemplateAttachment;
  return anchor;
}

function templateAttachment(object: THREE.Object3D): ReplayAssetTemplateAttachment | null {
  const value = object.userData[TEMPLATE_ATTACHMENT_KEY];
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ReplayAssetTemplateAttachment>;
  if (typeof candidate.template !== "string" || !Array.isArray(candidate.fallback)) return null;
  if (!candidate.fallback.every((fallback) => fallback instanceof THREE.Object3D)) return null;
  return { template: candidate.template, fallback: candidate.fallback };
}

function cloneTemplateNode(
  node: ReplayAssetTemplateNode,
  resolver: ReplayAssetMaterialResolver,
  target: THREE.Object3D,
  template: ReplayAssetTemplateManifestEntry,
): THREE.Object3D {
  let object: THREE.Object3D;
  if (node.geometry) {
    if (!node.materialRole) {
      throw new Error(`Replay asset V3 mesh has no material role: ${template.template}`);
    }
    const material = resolver(node.materialRole, target, template);
    if (!(material instanceof THREE.Material)) {
      throw new Error(
        `Replay asset V3 material resolver failed: ${template.template}/${node.materialRole}`,
      );
    }
    const geometry = node.geometry.clone();
    try {
      object = new THREE.Mesh(geometry, material.clone());
    } catch (error) {
      geometry.dispose();
      throw error;
    }
  } else {
    object = new THREE.Group();
  }
  object.name = node.name;
  object.position.fromArray(node.position);
  object.quaternion.fromArray(node.quaternion);
  object.scale.fromArray(node.scale);
  object.visible = node.visible;
  if (object instanceof THREE.Mesh) {
    object.castShadow = node.castShadow ?? false;
    object.receiveShadow = node.receiveShadow ?? false;
    object.frustumCulled = node.frustumCulled ?? true;
    object.renderOrder = node.renderOrder ?? 0;
    object.userData.authoredReplayAssetTemplate = template.template;
    object.userData.replayMaterialRole = node.materialRole;
    object.userData.accent =
      node.materialRole === "athlete-fabric" || node.materialRole === "equipment-painted";
  }
  try {
    for (const child of node.children) {
      object.add(cloneTemplateNode(child, resolver, target, template));
    }
    return object;
  } catch (error) {
    disposeTemplateInstance(object);
    throw error;
  }
}

function disposeTemplateInstance(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

function applyLegacyReplayAssetLibrary(
  root: THREE.Object3D,
  library: ReplayAssetLibrary,
  hideFallbacks: boolean,
): number {
  let applied = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const slot = object.userData.replayAssetSlot as ReplayAssetSlot | undefined;
    if (!slot) return;
    const template = library.geometries.get(slot);
    if (!template) return;
    const previous = object.geometry;
    const geometry = template.clone();
    const fitCrossSectionOnly =
      slot === "athlete:upper-arm" ||
      slot === "athlete:forearm" ||
      slot === "athlete:thigh" ||
      slot === "athlete:shin";
    // The GLB authoring library uses normalized forms for generic athlete
    // masses and exact local forms for equipment. Fit every fixed-size shell
    // into the old geometry bounds so a richer head, hand, torso or elbow
    // cannot silently become a giant imported mesh; limbs intentionally keep
    // their normalized Z span because the runtime owns their bone length.
    const fitAllAxes =
      !fitCrossSectionOnly && (slot.startsWith("equipment:") || slot.startsWith("athlete:"));
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
        // The authored shells already carry a real muscle/garment profile.
        // Keep them just wider than their contact-safe fallback bone instead
        // of inflating them into tubes from the chase camera.
        const limbWidth =
          slot === "athlete:upper-arm" || slot === "athlete:forearm"
            ? 1.18
            : slot === "athlete:thigh" || slot === "athlete:shin"
              ? 1.1
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
  // Historic v2 markers do not carry a slot relationship. Avoid hiding them
  // until at least one leaf has actually replaced a procedural shell.
  if (hideFallbacks && applied > 0) {
    root.traverse((object) => {
      if (object.userData.hideWithReplayAssets === true) object.visible = false;
    });
  }
  return applied;
}

function applyReplayAssetTemplates(
  root: THREE.Object3D,
  library: ReplayAssetLibrary,
  resolver: ReplayAssetMaterialResolver | undefined,
): { attachments: number; meshes: number } {
  if (!library.templates || !library.manifest || !resolver) return { attachments: 0, meshes: 0 };
  const anchors: Array<[THREE.Object3D, ReplayAssetTemplateAttachment]> = [];
  root.traverse((object) => {
    const attachment = templateAttachment(object);
    if (attachment) anchors.push([object, attachment]);
  });

  let attachments = 0;
  let meshes = 0;
  for (const [anchor, attachment] of anchors) {
    const existing = anchor.userData[TEMPLATE_INSTANCE_KEY];
    if (existing instanceof THREE.Object3D && existing.parent === anchor) continue;
    const template = library.templates.get(attachment.template);
    if (!template) continue;
    let instance: THREE.Object3D | null = null;
    try {
      instance = cloneTemplateNode(template.root, resolver, anchor, template.manifest);
      instance.name = `authored-template:${template.manifest.template}`;
      instance.userData.authoredReplayAssetTemplate = template.manifest.template;
      anchor.add(instance);
      // This follows successful construction and attachment. A failed role
      // resolver or missing template leaves the supplied procedural fallback
      // exactly as it was, rather than hiding a whole sport assembly.
      for (const fallback of attachment.fallback) fallback.visible = false;
      anchor.userData[TEMPLATE_INSTANCE_KEY] = instance;
      delete anchor.userData[TEMPLATE_ERROR_KEY];
      attachments++;
      meshes += template.manifest.partCount;
    } catch (error) {
      instance?.removeFromParent();
      if (instance) disposeTemplateInstance(instance);
      anchor.userData[TEMPLATE_ERROR_KEY] = error instanceof Error ? error.message : String(error);
    }
  }
  return { attachments, meshes };
}

/**
 * Apply any available v2 leaves plus validated v3 composite templates. V3
 * templates need a runtime material resolver; without it they are skipped and
 * their explicit fallback objects stay visible.
 */
export function applyReplayAssetLibrary(
  root: THREE.Object3D,
  library: ReplayAssetLibrary,
  materialResolver?: ReplayAssetMaterialResolver,
): number {
  // V3's explicit leaf contract covers all athlete articulation. Only then
  // may it use the historical generic trim markers, and only after a target
  // really received a cloned leaf.
  const legacyApplied = applyLegacyReplayAssetLibrary(
    root,
    library,
    library.version !== 3 || library.v3LeafSlotsComplete === true,
  );
  const templateResult = applyReplayAssetTemplates(root, library, materialResolver);
  const applied = legacyApplied + templateResult.meshes;
  root.userData.authoredReplayAssetCount = applied;
  root.userData.authoredReplayAssetTemplateCount = templateResult.attachments;
  return applied;
}

/** Test-only cache reset. */
export function resetReplayAssetLibraryCache(): void {
  if (cachedLibrary) void cachedLibrary.then(disposeReplayAssetLibrary);
  if (cachedTemplateLibrary) void cachedTemplateLibrary.then(disposeReplayAssetLibrary);
  cachedLibrary = null;
  cachedTemplateLibrary = null;
}
