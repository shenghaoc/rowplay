import type { CourseRenderer3D } from "./renderer3d";
import type { RenderQuality } from "./replayRenderer";
import type { ReplayRenderer } from "./renderer";
import type { Renderer3DBackend } from "./renderer3d";
import type { Sport } from "../types";
import type { ReplayAssetLibrary } from "./renderer3dAssets";
import type { ReplayV4AssetTemplate } from "./renderer3dV4Assets";

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
  loadAssets?: () => Promise<ReplayAssetLibrary>;
  loadV4Assets?: () => Promise<ReplayV4AssetTemplate | null>;
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

/** Lazy-load the WebGPU 3D renderer module once per session (mirrors `loadRenderer3D`). */
export function loadRenderer3DWebGPU(): Promise<Renderer3DCtor> {
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

/** Keep Three.js and GLTFLoader behind the same user-triggered 3D boundary. */
async function loadDefaultReplayAssets(): Promise<ReplayAssetLibrary> {
  const { loadReplayAssetLibrary, loadReplayAssetTemplateLibrary } =
    await import("./renderer3dAssets");
  try {
    // V3 is the current high-detail contract: it preserves the dynamic leaf
    // shells while adding anchored composite equipment. If an interrupted
    // deploy leaves that optional file unavailable, the validated v2 library
    // still improves the athlete rather than forcing a visible regression.
    return await loadReplayAssetTemplateLibrary();
  } catch {
    return loadReplayAssetLibrary();
  }
}

/** Keep the skinned V4 athlete behind the same user-triggered 3D boundary. */
async function loadDefaultReplayV4Assets(): Promise<ReplayV4AssetTemplate> {
  const { loadReplayV4Asset } = await import("./renderer3dV4Assets");
  return loadReplayV4Asset();
}

export async function createRenderer3D(
  host: HTMLElement,
  quality: RenderQuality,
  sport: Sport,
  deps: Renderer3DFactoryDeps = {},
): Promise<Renderer3DResult> {
  // The authored mesh pack raises visual fidelity but must never turn a local
  // asset or parser failure into a blank replay. The existing procedural 3D
  // rig remains a hard fallback and Canvas 2D remains the outer fallback.
  // Defer the model request until a usable backend is about to be constructed;
  // devices with no 3D support should not download a 3D-only asset. Retain one
  // promise so WebGPU failure and the WebGL fallback share the parsed library.
  let assetLibrary: Promise<ReplayAssetLibrary | null> | null = null;
  let v4AssetTemplate: Promise<ReplayV4AssetTemplate | null> | null = null;
  const getAssets = () => {
    assetLibrary ??= (deps.loadAssets ?? loadDefaultReplayAssets)().catch(() => null);
    return assetLibrary;
  };
  const getV4Assets = () => {
    v4AssetTemplate ??= (deps.loadV4Assets ?? loadDefaultReplayV4Assets)().catch(() => null);
    return v4AssetTemplate;
  };
  const canWebGPU = await (deps.detectWebGPU ?? webgpuSupported)();
  if (canWebGPU) {
    let renderer: CourseRenderer3D | null = null;
    try {
      const Ctor = await (deps.loadWebGPU ?? loadRenderer3DWebGPU)();
      const [assets, v4Assets] = await Promise.all([getAssets(), getV4Assets()]);
      renderer = new Ctor(host, quality, sport, { assets, v4Assets });
      await renderer.ready?.();
      // Honour the renderer's effective backend rather than the requested one:
      // Three's WebGPURenderer can install its own WebGL2 fallback inside
      // init() and still report success, in which case backendKind flips to
      // "webgl" here. Treat that as a WebGPU init failure so the explicit
      // WebGL branch below re-applies the WebGL quality tier (Ultra → high)
      // and the diagnostic chip shows the right backend.
      if (renderer.backendKind === "webgpu") {
        return { renderer, backend: "webgpu", quality };
      }
      destroyFailedRenderer(renderer);
      renderer = null;
    } catch {
      destroyFailedRenderer(renderer);
      renderer = null;
      // WebGPU can be exposed but fail adapter/device init. WebGL remains the
      // mandatory replay fallback, so continue below without surfacing a toast.
    }
  }

  if (!(deps.detectWebGL ?? webglSupported)()) {
    throw new Error("3D renderer unavailable");
  }
  const webglQuality: RenderQuality = quality === "ultra" ? "high" : quality;
  const Ctor = await (deps.loadWebGL ?? loadRenderer3D)();
  const [assets, v4Assets] = await Promise.all([getAssets(), getV4Assets()]);
  let renderer: CourseRenderer3D | null = null;
  try {
    renderer = new Ctor(host, webglQuality, sport, { assets, v4Assets });
    await renderer.ready?.();
    return { renderer, backend: "webgl", quality: webglQuality };
  } catch (err) {
    destroyFailedRenderer(renderer);
    renderer = null;
    throw err;
  }
}

/** Reset module cache (tests only). */
export function resetRenderer3DCache(): void {
  cached = null;
  cachedWebGPU = null;
}
