import { expect, it, vi } from "vite-plus/test";
import type { Renderer3DCtor } from "./renderer3dLoader";

const assetModule = vi.hoisted(() => ({
  evaluations: 0,
  load: vi.fn(async () => ({ byteLength: 96, geometries: new Map() })),
}));

vi.mock("./renderer3dAssets", () => {
  assetModule.evaluations++;
  return { loadReplayAssetLibrary: assetModule.load };
});

import { createRenderer3D } from "./renderer3dLoader";

it("does not evaluate the authored-asset module until a 3D backend will be constructed", async () => {
  expect(assetModule.evaluations).toBe(0);

  await expect(
    createRenderer3D({} as HTMLElement, "medium", "rower", {
      detectWebGPU: async () => false,
      detectWebGL: () => false,
    }),
  ).rejects.toThrow("3D renderer unavailable");
  expect(assetModule.evaluations).toBe(0);
  expect(assetModule.load).not.toHaveBeenCalled();

  class FakeWebGLRenderer {
    backendKind = "webgl" as const;
    ready = vi.fn(async () => {});
    render = vi.fn();
    resize = vi.fn();
    destroy = vi.fn();
  }

  const result = await createRenderer3D({} as HTMLElement, "medium", "rower", {
    detectWebGPU: async () => false,
    detectWebGL: () => true,
    loadWebGL: async () => FakeWebGLRenderer as unknown as Renderer3DCtor,
  });

  expect(result.backend).toBe("webgl");
  expect(assetModule.evaluations).toBe(1);
  expect(assetModule.load).toHaveBeenCalledTimes(1);
});
