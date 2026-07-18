import { readFile } from "node:fs/promises";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import * as THREE from "three";
import {
  applyReplayAssetLibrary,
  collectReplayAssetLibrary,
  fetchReplayAssetLibrary,
  hideWithReplayAssets,
  loadReplayAssetLibrary,
  REPLAY_ASSET_PATH,
  REQUIRED_REPLAY_ASSET_SLOTS,
  resetReplayAssetLibraryCache,
  setReplayAssetSlot,
  type ReplayAssetLibrary,
  type ReplayAssetSlot,
} from "./renderer3dAssets";

let assetBytes: Uint8Array;

beforeAll(async () => {
  const bytes = await readFile(
    new URL("../../../static/replay-assets/rowplay-rigs-v2.glb", import.meta.url),
  );
  assetBytes = new Uint8Array(bytes.byteLength);
  assetBytes.set(bytes);
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
