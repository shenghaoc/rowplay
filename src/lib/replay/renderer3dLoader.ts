import type { CourseRenderer3D } from "./renderer3d";
import type { RenderQuality } from "./replayRenderer";
import type { ReplayRenderer } from "./renderer";
import type { Renderer3DBackend } from "./renderer3d";
import type { Sport } from "../types";

export type Renderer3DCtor = typeof CourseRenderer3D;
export type { Renderer3DBackend } from "./renderer3d";
export type Renderer3DResult = {
  renderer: ReplayRenderer;
  backend: Renderer3DBackend;
  quality: RenderQuality;
};

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter?: () => Promise<unknown>;
  };
};

export interface Renderer3DFactoryDeps {
  detectWebGPU?: () => Promise<boolean>;
  detectWebGL?: () => boolean;
  loadWebGPU?: () => Promise<Renderer3DCtor>;
  loadWebGL?: () => Promise<Renderer3DCtor>;
}

let cached: Promise<Renderer3DCtor> | null = null;
let cachedWebGPU: Promise<Renderer3DCtor> | null = null;

/** SSR-safe WebGL capability probe. */
export function webglSupported(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** SSR-safe WebGPU capability probe. */
export async function webgpuSupported(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as GpuNavigator).gpu;
  if (typeof gpu?.requestAdapter !== "function") return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

export async function renderer3dSupported(): Promise<boolean> {
  if (webglSupported()) return true;
  return webgpuSupported();
}

/** Lazy-load the 3D renderer module (and Three.js) once per session. */
export function loadRenderer3D(): Promise<Renderer3DCtor> {
  if (!cached) {
    cached = import("./renderer3d")
      .then((m) => m.CourseRenderer3D)
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

function loadRenderer3DWebGPU(): Promise<Renderer3DCtor> {
  if (!cachedWebGPU) {
    cachedWebGPU = import("./renderer3dWebGPU")
      .then((m) => m.CourseRenderer3DWebGPU)
      .catch((err) => {
        cachedWebGPU = null;
        throw err;
      });
  }
  return cachedWebGPU;
}

function destroyFailedRenderer(renderer: CourseRenderer3D | null): void {
  try {
    renderer?.destroy();
  } catch {
    // A failed backend should not prevent fallback or mask the init failure.
  }
}

export async function createRenderer3D(
  host: HTMLElement,
  quality: RenderQuality,
  sport: Sport,
  deps: Renderer3DFactoryDeps = {},
): Promise<Renderer3DResult> {
  const canWebGPU = await (deps.detectWebGPU ?? webgpuSupported)();
  if (canWebGPU) {
    let renderer: CourseRenderer3D | null = null;
    try {
      const Ctor = await (deps.loadWebGPU ?? loadRenderer3DWebGPU)();
      renderer = new Ctor(host, quality, sport);
      await renderer.ready?.();
      return { renderer, backend: "webgpu", quality };
    } catch {
      destroyFailedRenderer(renderer);
      // WebGPU can be exposed but fail adapter/device init. WebGL remains the
      // mandatory replay fallback, so continue below without surfacing a toast.
    }
  }

  if (!(deps.detectWebGL ?? webglSupported)()) {
    throw new Error("3D renderer unavailable");
  }
  const webglQuality: RenderQuality = quality === "ultra" ? "high" : quality;
  const Ctor = await (deps.loadWebGL ?? loadRenderer3D)();
  let renderer: CourseRenderer3D | null = null;
  try {
    renderer = new Ctor(host, webglQuality, sport);
    await renderer.ready?.();
    return { renderer, backend: "webgl", quality: webglQuality };
  } catch (err) {
    destroyFailedRenderer(renderer);
    throw err;
  }
}

/** Reset module cache (tests only). */
export function resetRenderer3DCache(): void {
  cached = null;
  cachedWebGPU = null;
}
