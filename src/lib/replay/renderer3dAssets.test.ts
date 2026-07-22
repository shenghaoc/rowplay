import { readFile } from "node:fs/promises";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import * as THREE from "three";
import {
  applyReplayAssetLibrary,
  collectReplayAssetLibrary,
  collectReplayAssetTemplateLibrary,
  disposeReplayAssetTemplateLibrary,
  fetchReplayAssetLibrary,
  fetchReplayAssetTemplateLibrary,
  hideWithReplayAssets,
  loadReplayAssetLibrary,
  REPLAY_ASSET_PATH,
  REPLAY_ASSET_V3_PATH,
  REQUIRED_REPLAY_ASSET_SLOTS,
  REQUIRED_REPLAY_ASSET_V3_LEAF_SLOTS,
  resetReplayAssetLibraryCache,
  setReplayAssetSlot,
  setReplayAssetTemplateAnchor,
  type ReplayAssetLibrary,
  type ReplayAssetMaterialRole,
  type ReplayAssetSlot,
  type ReplayAssetTemplateLibrary,
} from "./renderer3dAssets";

let assetBytes: Uint8Array;
let v3AssetBytes: Uint8Array;

beforeAll(async () => {
  const [v2Bytes, v3Bytes] = await Promise.all([
    readFile(new URL("../../../static/replay-assets/rowplay-rigs-v2.glb", import.meta.url)),
    readFile(new URL("../../../static/replay-assets/rowplay-rigs-v3.glb", import.meta.url)),
  ]);
  assetBytes = new Uint8Array(v2Bytes.byteLength);
  assetBytes.set(v2Bytes);
  v3AssetBytes = new Uint8Array(v3Bytes.byteLength);
  v3AssetBytes.set(v3Bytes);
});

afterEach(() => {
  resetReplayAssetLibraryCache();
});

function assetResponse(): Response {
  const body = new Uint8Array(assetBytes.byteLength);
  body.set(assetBytes);
  return new Response(body, {
    status: 200,
    headers: { "content-type": "model/gltf-binary" },
  });
}

function v3AssetResponse(): Response {
  const body = new Uint8Array(v3AssetBytes.byteLength);
  body.set(v3AssetBytes);
  return new Response(body, {
    status: 200,
    headers: { "content-type": "model/gltf-binary" },
  });
}

function disposeLibrary(library: ReplayAssetLibrary): void {
  for (const geometry of library.geometries.values()) geometry.dispose();
}

function radialExtentNearZ(
  geometry: THREE.BufferGeometry,
  z: number,
  tolerance: number,
  center: THREE.Vector3,
): number {
  const positions = geometry.getAttribute("position");
  let extent = 0;
  for (let index = 0; index < positions.count; index++) {
    if (Math.abs(positions.getZ(index) - z) > tolerance) continue;
    extent = Math.max(
      extent,
      Math.hypot(positions.getX(index) - center.x, positions.getY(index) - center.y),
    );
  }
  return extent;
}

interface TemplatePart {
  name: string;
  role: ReplayAssetMaterialRole;
  geometry?: THREE.BufferGeometry;
}

function compositeScene(
  templates: ReadonlyArray<{ slot: string; parts: readonly TemplatePart[] }>,
  sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x6d7482 }),
): THREE.Scene {
  const scene = new THREE.Scene();
  for (const { slot, parts } of templates) {
    const root = new THREE.Group();
    root.name = slot;
    root.userData.replayAssetTemplateSlot = slot;
    root.userData.replayAssetKind = "composite";
    root.userData.replayAssetVersion = 3;
    root.userData.replayAssetPartCount = parts.length;
    root.userData.replayMaterialRoles = [...new Set(parts.map((part) => part.role))].sort();
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry ?? new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
      mesh.name = `${slot}:${part.name}`;
      mesh.userData.replayAssetTemplateSlot = slot;
      mesh.userData.replayAssetPart = part.name;
      mesh.userData.replayMaterialRole = part.role;
      root.add(mesh);
    }
    scene.add(root);
  }
  for (const slot of REQUIRED_REPLAY_ASSET_V3_LEAF_SLOTS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
    mesh.name = slot;
    mesh.userData.replayAssetSlot = slot;
    scene.add(mesh);
  }
  return scene;
}

function templateInstance(anchor: THREE.Object3D): THREE.Object3D {
  const instance = anchor.children.find(
    (child) => typeof child.userData.authoredReplayAssetTemplate === "string",
  );
  if (!instance) throw new Error("Expected an attached replay asset template");
  return instance;
}

function templateMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function disposeTemplateInstance(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  root.removeFromParent();
}

function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

describe("replay asset pack", () => {
  it("loads the checked-in GLB with every required finite geometry slot", async () => {
    const fetchMock = vi.fn(async () => assetResponse());
    const library = await fetchReplayAssetLibrary(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(REPLAY_ASSET_PATH);
    expect(library.byteLength).toBe(assetBytes.byteLength);
    expect([...library.geometries.keys()]).toEqual(REQUIRED_REPLAY_ASSET_SLOTS);
    for (const [slot, geometry] of library.geometries) {
      expect(geometry.name).toBe(`authored:${slot}`);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingBox?.isEmpty()).toBe(false);
      const size = geometry.boundingBox?.getSize(new THREE.Vector3());
      expect(size && Number.isFinite(size.x + size.y + size.z)).toBe(true);
    }

    disposeLibrary(library);
  });

  it("keeps authored limbs compact and correctly tapered from proximal -Z", async () => {
    const library = await fetchReplayAssetLibrary(async () => assetResponse());
    for (const slot of [
      "athlete:upper-arm",
      "athlete:forearm",
      "athlete:thigh",
      "athlete:shin",
    ] as const) {
      const geometry = library.geometries.get(slot)!;
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const proximal = radialExtentNearZ(
        geometry,
        bounds.min.z + size.z * 0.12,
        size.z * 0.07,
        center,
      );
      const distal = radialExtentNearZ(
        geometry,
        bounds.max.z - size.z * 0.12,
        size.z * 0.07,
        center,
      );

      expect(size.z, `${slot} compact limb span`).toBeGreaterThanOrEqual(1);
      expect(size.z, `${slot} compact limb span`).toBeLessThanOrEqual(1.05);
      expect(proximal, `${slot} proximal radius`).toBeGreaterThan(distal * 1.15);
    }
    disposeLibrary(library);
  });

  it("deduplicates concurrent loads for the lifetime of the runtime cache", async () => {
    const fetchMock = vi.fn(async () => assetResponse());
    const first = loadReplayAssetLibrary(fetchMock);
    const second = loadReplayAssetLibrary(fetchMock);

    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ byteLength: assetBytes.byteLength });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears a failed load so a later 3D request can retry", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockImplementation(async () => assetResponse());

    await expect(loadReplayAssetLibrary(fetchMock)).rejects.toThrow(
      "Replay asset request failed (503)",
    );
    await expect(loadReplayAssetLibrary(fetchMock)).resolves.toMatchObject({
      byteLength: assetBytes.byteLength,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects incomplete or duplicated asset libraries", () => {
    expect(() => collectReplayAssetLibrary(new THREE.Scene())).toThrow(
      "Replay asset pack is missing slots",
    );

    const scene = new THREE.Scene();
    const disposedClones: ReturnType<typeof vi.fn>[] = [];
    for (const slot of REQUIRED_REPLAY_ASSET_SLOTS) {
      const source = new THREE.BoxGeometry(1, 1, 1);
      const clone = source.clone();
      const disposed = vi.fn();
      clone.addEventListener("dispose", disposed);
      vi.spyOn(source, "clone").mockReturnValue(clone);
      disposedClones.push(disposed);
      const mesh = new THREE.Mesh(source);
      mesh.userData.replayAssetSlot = slot;
      scene.add(mesh);
    }
    const duplicate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    duplicate.userData.replayAssetSlot = REQUIRED_REPLAY_ASSET_SLOTS[0];
    scene.add(duplicate);

    expect(() => collectReplayAssetLibrary(scene)).toThrow(
      `Duplicate replay asset slot: ${REQUIRED_REPLAY_ASSET_SLOTS[0]}`,
    );
    for (const disposed of disposedClones) expect(disposed).toHaveBeenCalledTimes(1);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  });
});

describe("applyReplayAssetLibrary", () => {
  it("clones and fits authored shells without changing the shared template", () => {
    const oldGeometry = new THREE.BoxGeometry(2, 4, 6);
    const target = setReplayAssetSlot(new THREE.Mesh(oldGeometry), "equipment:row:hull");
    const hiddenBlend = hideWithReplayAssets(new THREE.Object3D());
    const root = new THREE.Group();
    root.add(target, hiddenBlend);

    const template = new THREE.BoxGeometry(1, 1, 1);
    template.computeBoundingBox();
    const templateSizeBefore = template.boundingBox?.getSize(new THREE.Vector3()).clone();
    const geometries = new Map<ReplayAssetSlot, THREE.BufferGeometry>([
      ["equipment:row:hull", template],
    ]);
    const library = { byteLength: 64, geometries } as ReplayAssetLibrary;
    const disposed = vi.fn();
    oldGeometry.addEventListener("dispose", disposed);

    expect(applyReplayAssetLibrary(root, library)).toBe(1);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(target.geometry).not.toBe(template);
    expect(target.geometry.name).toBe("authored-instance:equipment:row:hull");
    expect(target.userData.authoredReplayAsset).toBe(true);
    expect(hiddenBlend.visible).toBe(false);
    expect(root.userData.authoredReplayAssetCount).toBe(1);

    target.geometry.computeBoundingBox();
    const fittedSize = target.geometry.boundingBox?.getSize(new THREE.Vector3());
    expect(fittedSize?.x).toBeCloseTo(2);
    expect(fittedSize?.y).toBeCloseTo(4);
    expect(fittedSize?.z).toBeCloseTo(6);
    template.computeBoundingBox();
    expect(template.boundingBox?.getSize(new THREE.Vector3())).toEqual(templateSizeBefore);

    target.geometry.dispose();
    template.dispose();
  });

  it("fits fixed-size athlete forms while preserving a visible authored elbow", () => {
    const hand = setReplayAssetSlot(
      new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.15)),
      "athlete:hand",
    );
    const elbow = setReplayAssetSlot(
      new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1)),
      "athlete:elbow",
    );
    elbow.userData.hideWithReplayAssets = false;
    const root = new THREE.Group();
    root.add(hand, elbow);
    const handTemplate = new THREE.BoxGeometry(2, 2, 2);
    const elbowTemplate = new THREE.BoxGeometry(2, 3, 4);
    const library = {
      byteLength: 64,
      geometries: new Map<ReplayAssetSlot, THREE.BufferGeometry>([
        ["athlete:hand", handTemplate],
        ["athlete:elbow", elbowTemplate],
      ]),
    } as ReplayAssetLibrary;

    expect(applyReplayAssetLibrary(root, library)).toBe(2);
    for (const [mesh, expected] of [
      [hand, new THREE.Vector3(0.12, 0.08, 0.15)],
      [elbow, new THREE.Vector3(0.1, 0.09, 0.1)],
    ] as const) {
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3());
      expect(size?.x).toBeCloseTo(expected.x, 6);
      expect(size?.y).toBeCloseTo(expected.y, 6);
      expect(size?.z).toBeCloseTo(expected.z, 6);
    }
    expect(elbow.visible).toBe(true);
    expect(elbow.geometry.name).toBe("authored-instance:athlete:elbow");

    hand.geometry.dispose();
    elbow.geometry.dispose();
    handTemplate.dispose();
    elbowTemplate.dispose();
  });

  it("keeps authored limb shells proportional instead of inflating them into tubes", () => {
    const arm = setReplayAssetSlot(
      new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1)),
      "athlete:upper-arm",
    );
    const leg = setReplayAssetSlot(
      new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 1)),
      "athlete:thigh",
    );
    const armTemplate = new THREE.BoxGeometry(1, 1, 1);
    const legTemplate = new THREE.BoxGeometry(1, 1, 1);
    const root = new THREE.Group();
    root.add(arm, leg);
    const library = {
      byteLength: 64,
      geometries: new Map<ReplayAssetSlot, THREE.BufferGeometry>([
        ["athlete:upper-arm", armTemplate],
        ["athlete:thigh", legTemplate],
      ]),
    } as ReplayAssetLibrary;

    expect(applyReplayAssetLibrary(root, library)).toBe(2);
    for (const [mesh, expected] of [
      [arm, new THREE.Vector3(0.118, 0.0944, 1)],
      [leg, new THREE.Vector3(0.154, 0.132, 1)],
    ] as const) {
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3());
      expect(size?.x).toBeCloseTo(expected.x, 6);
      expect(size?.y).toBeCloseTo(expected.y, 6);
      expect(size?.z).toBeCloseTo(expected.z, 6);
    }

    arm.geometry.dispose();
    leg.geometry.dispose();
    armTemplate.dispose();
    legTemplate.dispose();
  });
});

describe("V3 composite replay templates", () => {
  it("loads the checked-in V3 manifest, compatibility leaves, and composite roots", async () => {
    const fetchMock = vi.fn(async () => v3AssetResponse());
    const library = await fetchReplayAssetTemplateLibrary(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(REPLAY_ASSET_V3_PATH);
    expect(library.byteLength).toBe(v3AssetBytes.byteLength);
    expect([...library.geometries.keys()]).toEqual(REQUIRED_REPLAY_ASSET_V3_LEAF_SLOTS);
    expect(library.v3LeafSlotsComplete).toBe(true);
    expect(library.manifest.templates.map((template) => template.template)).toEqual([
      "equipment:bike:drivetrain-assembly",
      "equipment:bike:frame-assembly",
      "equipment:bike:wheel-assembly",
      "equipment:row:boat-assembly",
      "equipment:row:oar-rig",
      "equipment:row:seat-carriage",
      "equipment:ski:ski-assembly",
    ]);
    for (const template of library.templates.values()) {
      expect(template.manifest.partCount).toBeGreaterThan(0);
      expect(template.manifest.materialRoles.length).toBeGreaterThan(0);
      expect(template.root.position).toEqual([0, 0, 0]);
      expect(template.root.quaternion).toEqual([0, 0, 0, 1]);
      expect(template.root.scale).toEqual([1, 1, 1]);
    }

    disposeReplayAssetTemplateLibrary(library);
  });

  it("collects a validated manifest from composite roots without retaining source materials", () => {
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x9f8464 });
    const scene = compositeScene(
      [
        {
          slot: "equipment:row:boat",
          parts: [
            { name: "hull", role: "equipment-painted" },
            { name: "rigger", role: "equipment-metal" },
          ],
        },
      ],
      sourceMaterial,
    );

    const library = collectReplayAssetTemplateLibrary(scene, 123);
    expect(library.version).toBe(3);
    expect(library.byteLength).toBe(123);
    expect([...library.geometries.keys()]).toEqual(REQUIRED_REPLAY_ASSET_V3_LEAF_SLOTS);
    expect(library.manifest).toEqual({
      version: 3,
      templates: [
        {
          template: "equipment:row:boat",
          partCount: 2,
          materialRoles: ["equipment-metal", "equipment-painted"],
        },
      ],
    });
    const template = library.templates.get("equipment:row:boat");
    expect(template?.root.children).toHaveLength(2);
    expect(template?.root.children[0]).not.toHaveProperty("material");
    expect(template?.root.children[0].geometry).not.toBe(
      (scene.children[0].children[0] as THREE.Mesh).geometry,
    );

    disposeReplayAssetTemplateLibrary(library);
    disposeScene(scene);
  });

  it("fails closed when the V3 articulation leaf contract is incomplete", () => {
    const scene = compositeScene([
      {
        slot: "equipment:row:boat",
        parts: [{ name: "hull", role: "equipment-painted" }],
      },
    ]);
    const missing = scene.children.find(
      (child) => child.userData.replayAssetSlot === "athlete:helmet",
    );
    missing?.removeFromParent();

    expect(() => collectReplayAssetTemplateLibrary(scene)).toThrow(
      "Replay asset pack is missing slots: athlete:helmet",
    );

    disposeScene(scene);
    if (missing instanceof THREE.Mesh) missing.geometry.dispose();
  });

  it("clones v3 template geometry and resolver materials independently for live and ghost anchors", () => {
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x9f8464 });
    const scene = compositeScene(
      [
        {
          slot: "equipment:row:boat",
          parts: [
            { name: "hull", role: "equipment-painted" },
            { name: "rigger", role: "equipment-metal" },
          ],
        },
      ],
      sourceMaterial,
    );
    const library = collectReplayAssetTemplateLibrary(scene);
    const root = new THREE.Group();
    const liveAnchor = new THREE.Group();
    const ghostAnchor = new THREE.Group();
    const liveFallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const ghostFallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    liveAnchor.add(liveFallback);
    ghostAnchor.add(ghostFallback);
    root.add(liveAnchor, ghostAnchor);
    setReplayAssetTemplateAnchor(liveAnchor, "equipment:row:boat", { fallback: [liveFallback] });
    setReplayAssetTemplateAnchor(ghostAnchor, "equipment:row:boat", {
      fallback: [ghostFallback],
    });
    const runtimeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1b8cc7,
      roughness: 0.28,
      clearcoat: 0.38,
    });
    const resolver = vi.fn((role: ReplayAssetMaterialRole, target: THREE.Object3D) => {
      expect(target === liveAnchor || target === ghostAnchor).toBe(true);
      return role === "equipment-painted" || role === "equipment-metal" ? runtimeMaterial : null;
    });

    expect(applyReplayAssetLibrary(root, library, resolver)).toBe(4);
    expect(liveFallback.visible).toBe(false);
    expect(ghostFallback.visible).toBe(false);
    const liveInstance = templateInstance(liveAnchor);
    const ghostInstance = templateInstance(ghostAnchor);
    const liveMeshes = templateMeshes(liveInstance);
    const ghostMeshes = templateMeshes(ghostInstance);
    expect(liveMeshes).toHaveLength(2);
    expect(ghostMeshes).toHaveLength(2);
    expect(liveMeshes[0].geometry).not.toBe(ghostMeshes[0].geometry);
    expect(liveMeshes[0].geometry).not.toBe(
      library.templates.get("equipment:row:boat")?.root.children[0].geometry,
    );
    expect(liveMeshes[0].material).not.toBe(runtimeMaterial);
    expect(liveMeshes[0].material).not.toBe(sourceMaterial);
    expect((liveMeshes[0].material as THREE.MeshPhysicalMaterial).clearcoat).toBeCloseTo(0.38);
    const ghostGeometryDisposed = vi.fn();
    ghostMeshes[0].geometry.addEventListener("dispose", ghostGeometryDisposed);
    liveMeshes[0].geometry.dispose();
    expect(ghostGeometryDisposed).not.toHaveBeenCalled();
    expect(resolver).toHaveBeenCalledWith(
      "equipment-painted",
      liveAnchor,
      expect.objectContaining({ template: "equipment:row:boat" }),
    );

    disposeTemplateInstance(liveInstance);
    disposeTemplateInstance(ghostInstance);
    liveFallback.geometry.dispose();
    ghostFallback.geometry.dispose();
    runtimeMaterial.dispose();
    disposeReplayAssetTemplateLibrary(library);
    disposeScene(scene);
  });

  it("only hides the exact fallback whose v3 template resolves, leaving partial fallback intact", () => {
    const scene = compositeScene([
      {
        slot: "equipment:row:boat",
        parts: [{ name: "hull", role: "equipment-painted" }],
      },
      {
        slot: "equipment:bike:frame",
        parts: [{ name: "frame", role: "equipment-metal" }],
      },
    ]);
    const library = collectReplayAssetTemplateLibrary(scene) as ReplayAssetTemplateLibrary;
    const root = new THREE.Group();
    const boatAnchor = new THREE.Group();
    const bikeAnchor = new THREE.Group();
    const boatFallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const bikeFallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    boatAnchor.add(boatFallback);
    bikeAnchor.add(bikeFallback);
    root.add(boatAnchor, bikeAnchor);
    setReplayAssetTemplateAnchor(boatAnchor, "equipment:row:boat", { fallback: [boatFallback] });
    setReplayAssetTemplateAnchor(bikeAnchor, "equipment:bike:frame", { fallback: [bikeFallback] });
    const runtimeMaterial = new THREE.MeshStandardMaterial({ color: 0x296f9f });

    expect(
      applyReplayAssetLibrary(root, library, (role) =>
        role === "equipment-painted" ? runtimeMaterial : null,
      ),
    ).toBe(1);
    expect(boatFallback.visible).toBe(false);
    expect(bikeFallback.visible).toBe(true);
    expect(() => templateInstance(bikeAnchor)).toThrow(
      "Expected an attached replay asset template",
    );
    expect(String(bikeAnchor.userData.authoredReplayAssetTemplateError)).toContain(
      "material resolver failed",
    );

    disposeTemplateInstance(templateInstance(boatAnchor));
    boatFallback.geometry.dispose();
    bikeFallback.geometry.dispose();
    runtimeMaterial.dispose();
    disposeReplayAssetTemplateLibrary(library);
    disposeScene(scene);
  });
});
