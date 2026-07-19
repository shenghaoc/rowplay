import { expect, it, vi } from "vite-plus/test";
import type { Renderer3DCtor } from "./renderer3dLoader";

const assetModule = vi.hoisted(() => ({
  evaluations: 0,
  loadV3: vi.fn(async () => ({ byteLength: 96, geometries: new Map(), version: 3 as const })),
  loadV2: vi.fn(async () => ({ byteLength: 64, geometries: new Map(), version: 2 as const })),
}));

vi.mock("./renderer3dAssets", () => {
  assetModule.evaluations++;
  // The production loader destructures both exports before attempting V3, so
  // keep the validated legacy fallback available in this lazy-boundary mock.
  return {
    loadReplayAssetLibrary: assetModule.loadV2,
    loadReplayAssetTemplateLibrary: assetModule.loadV3,
  };
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
  expect(assetModule.loadV3).not.toHaveBeenCalled();
  expect(assetModule.loadV2).not.toHaveBeenCalled();

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
  expect(assetModule.loadV3).toHaveBeenCalledTimes(1);
  expect(assetModule.loadV2).not.toHaveBeenCalled();
});
