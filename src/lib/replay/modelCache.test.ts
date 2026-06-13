import { describe, expect, it, vi } from "vite-plus/test";
import { ModelCache } from "./modelCache";
import * as THREE from "three";

function makeMockLoader() {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry()));
  return () => ({
    loadAsync: vi.fn().mockResolvedValue({ scene }),
  });
}

describe("ModelCache", () => {
  it("loads and caches a model", async () => {
    const loader = { loadAsync: vi.fn().mockResolvedValue({ scene: new THREE.Group() }) };
    const factory = () => loader;
    const cache = new ModelCache(factory);
    const r1 = await cache.load("model.glb");
    const r2 = await cache.load("model.glb");
    expect(r1).toBe(r2);
    expect(loader.loadAsync).toHaveBeenCalledTimes(1);
  });

  it("cloneScene returns an independent group", async () => {
    const factory = makeMockLoader();
    const cache = new ModelCache(factory);
    await cache.load("model.glb");
    const c1 = cache.cloneScene("model.glb");
    const c2 = cache.cloneScene("model.glb");
    expect(c1).not.toBe(c2);
    expect(c1).toBeInstanceOf(THREE.Group);
  });

  it("cloneScene returns null for unloaded model", () => {
    const cache = new ModelCache(makeMockLoader());
    expect(cache.cloneScene("missing.glb")).toBeNull();
  });

  it("propagates load errors", async () => {
    const cache = new ModelCache(() => ({
      loadAsync: vi.fn().mockRejectedValue(new Error("404")),
    }));
    await expect(cache.load("bad.glb")).rejects.toThrow("404");
    // Should allow retry after failure
    expect(cache.has("bad.glb")).toBe(false);
  });
});
