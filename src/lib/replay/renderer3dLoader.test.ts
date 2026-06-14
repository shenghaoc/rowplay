import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Renderer3DCtor } from "./renderer3dLoader";
import {
  createRenderer3D,
  loadRenderer3D,
  renderer3dSupported,
  resetRenderer3DCache,
  webglSupported,
  webgpuSupported,
} from "./renderer3dLoader";

describe("webglSupported", () => {
  const origDoc = globalThis.document;

  afterEach(() => {
    globalThis.document = origDoc;
  });

  it("returns false without document", () => {
    // @ts-expect-error test stub
    delete globalThis.document;
    expect(webglSupported()).toBe(false);
  });

  it("returns false without canvas context", () => {
    globalThis.document = {
      createElement: () => ({ getContext: () => null }),
    } as unknown as Document;
    expect(webglSupported()).toBe(false);
  });
});

describe("webgpuSupported", () => {
  const origNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  afterEach(() => {
    if (origNavigator) Object.defineProperty(globalThis, "navigator", origNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });

  it("returns false without navigator.gpu", async () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    await expect(webgpuSupported()).resolves.toBe(false);
  });

  it("returns true when an adapter is returned", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { gpu: { requestAdapter: vi.fn().mockResolvedValue({}) } },
      configurable: true,
    });
    await expect(webgpuSupported()).resolves.toBe(true);
  });
});

describe("loadRenderer3D", () => {
  afterEach(() => {
    resetRenderer3DCache();
  });

  it("reuses the same import promise", async () => {
    resetRenderer3DCache();
    const p1 = loadRenderer3D();
    const p2 = loadRenderer3D();
    expect(p1).toBe(p2);
    // Await the import so it completes before environment teardown.
    await p1.catch(() => {});
  });

  it("clears cache after a failed import so the next call retries", async () => {
    resetRenderer3DCache();
    let cached: Promise<unknown> | null = null;
    const loadLikeRenderer3D = () => {
      if (!cached) {
        cached = Promise.reject(new Error("chunk load failed")).catch((err) => {
          cached = null;
          throw err;
        });
      }
      return cached;
    };
    await expect(loadLikeRenderer3D()).rejects.toThrow("chunk load failed");
    const inFlight = loadLikeRenderer3D();
    expect(loadLikeRenderer3D()).toBe(inFlight);
    await expect(inFlight).rejects.toThrow("chunk load failed");
    const afterFailure = loadLikeRenderer3D();
    expect(afterFailure).not.toBe(inFlight);
    await expect(afterFailure).rejects.toThrow("chunk load failed");
  });
});

describe("createRenderer3D", () => {
  function makeCtor(
    ready: () => Promise<unknown> = () => Promise.resolve(),
    instances: Array<{ destroy: ReturnType<typeof vi.fn> }> = [],
    backendKind: "webgpu" | "webgl" = "webgpu",
  ): Renderer3DCtor {
    const readyImpl = ready;
    class FakeRenderer {
      ready = readyImpl;
      render = vi.fn();
      resize = vi.fn();
      destroy = vi.fn();
      // Mirrors CourseRenderer3D's `backendKind` getter so the loader can
      // detect Three's internal WebGL2 fallback after ready() resolves.
      backendKind = backendKind;
      constructor() {
        instances.push(this);
      }
    }
    return FakeRenderer as unknown as Renderer3DCtor;
  }

  const host = {} as HTMLElement;

  it("uses WebGPU when capability and init both succeed", async () => {
    const result = await createRenderer3D(host, "ultra", "rower", {
      detectWebGPU: async () => true,
      detectWebGL: () => false,
      loadWebGPU: async () => makeCtor(),
    });

    expect(result.backend).toBe("webgpu");
    expect(result.quality).toBe("ultra");
  });

  it("falls back to WebGL when WebGPU init fails", async () => {
    const failedWebGpuInstances: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
    const result = await createRenderer3D(host, "ultra", "rower", {
      detectWebGPU: async () => true,
      detectWebGL: () => true,
      loadWebGPU: async () =>
        makeCtor(() => Promise.reject(new Error("device lost")), failedWebGpuInstances),
      loadWebGL: async () => makeCtor(),
    });

    expect(result.backend).toBe("webgl");
    expect(result.quality).toBe("high");
    expect(failedWebGpuInstances).toHaveLength(1);
    expect(failedWebGpuInstances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back to WebGL when WebGPURenderer silently installs its WebGL2 backend", async () => {
    // navigator.gpu reports an adapter and renderer.init() resolves OK, but
    // backendKind flips to "webgl" because Three couldn't bring up a device.
    // The factory must treat that as a WebGPU failure: destroy the renderer,
    // re-enter through the explicit WebGL branch, and report the WebGL tier.
    const failedWebGpuInstances: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
    const result = await createRenderer3D(host, "ultra", "rower", {
      detectWebGPU: async () => true,
      detectWebGL: () => true,
      loadWebGPU: async () => makeCtor(() => Promise.resolve(), failedWebGpuInstances, "webgl"),
      loadWebGL: async () => makeCtor(),
    });

    expect(result.backend).toBe("webgl");
    expect(result.quality).toBe("high");
    expect(failedWebGpuInstances).toHaveLength(1);
    expect(failedWebGpuInstances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys a failed WebGL renderer before rethrowing init errors", async () => {
    const failedWebGlInstances: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
    await expect(
      createRenderer3D(host, "medium", "rower", {
        detectWebGPU: async () => false,
        detectWebGL: () => true,
        loadWebGL: async () =>
          makeCtor(() => Promise.reject(new Error("context lost")), failedWebGlInstances),
      }),
    ).rejects.toThrow("context lost");

    expect(failedWebGlInstances).toHaveLength(1);
    expect(failedWebGlInstances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses WebGL directly when WebGPU is unavailable", async () => {
    const result = await createRenderer3D(host, "medium", "skierg", {
      detectWebGPU: async () => false,
      detectWebGL: () => true,
      loadWebGL: async () => makeCtor(),
    });

    expect(result.backend).toBe("webgl");
    expect(result.quality).toBe("medium");
  });

  it("throws when neither backend is available", async () => {
    await expect(
      createRenderer3D(host, "medium", "bike", {
        detectWebGPU: async () => false,
        detectWebGL: () => false,
      }),
    ).rejects.toThrow("3D renderer unavailable");
  });

  it("is SSR-safe when neither document nor navigator can provide a backend", async () => {
    const origDoc = globalThis.document;
    const origNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      // @ts-expect-error test stub
      delete globalThis.document;
      Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
      await expect(renderer3dSupported()).resolves.toBe(false);
    } finally {
      globalThis.document = origDoc;
      if (origNavigator) Object.defineProperty(globalThis, "navigator", origNavigator);
    }
  });
});
