import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  class FakeWebGPURenderer {}
  return {
    FakeWebGPURenderer,
    courseCtor: vi.fn(),
  };
});

vi.mock("three/webgpu", () => ({
  WebGPURenderer: mocks.FakeWebGPURenderer,
}));

vi.mock("./renderer3d", () => {
  class CourseRenderer3D {
    constructor(...args: unknown[]) {
      mocks.courseCtor(...args);
    }
  }
  return { CourseRenderer3D };
});

import { CourseRenderer3DWebGPU } from "./renderer3dWebGPU";

describe("CourseRenderer3DWebGPU", () => {
  it("constructs the shared 3D scene graph with WebGPU backend options", () => {
    const host = {} as HTMLElement;
    new CourseRenderer3DWebGPU(host, "ultra", "bike");

    expect(mocks.courseCtor).toHaveBeenCalledWith(host, "ultra", "bike", {
      backend: "webgpu",
      WebGPURenderer: mocks.FakeWebGPURenderer,
    });
  });

  it("uses the rower medium-quality defaults", () => {
    const host = {} as HTMLElement;
    new CourseRenderer3DWebGPU(host);

    expect(mocks.courseCtor).toHaveBeenCalledWith(host, "medium", "rower", {
      backend: "webgpu",
      WebGPURenderer: mocks.FakeWebGPURenderer,
    });
  });
});
