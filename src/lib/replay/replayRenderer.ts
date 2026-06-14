import { safeStorage } from "$lib/safeStorage";

export type RendererKind = "2d" | "3d";
export type RenderQuality = "low" | "medium" | "high" | "ultra";

const STORAGE_KEY = "replay_renderer";
const QUALITY_KEY = "replay_quality";

/** Read persisted renderer choice (client-only). Defaults to 2D. */
export function loadRendererPref(): RendererKind {
  const raw = safeStorage.getItem(STORAGE_KEY);
  return raw === "3d" ? "3d" : "2d";
}

/** Persist renderer choice for the next visit. */
export function saveRendererPref(kind: RendererKind): void {
  safeStorage.setItem(STORAGE_KEY, kind);
}

/** Read persisted 3D quality tier (client-only). Defaults to medium. */
export function loadQualityPref(): RenderQuality {
  const raw = safeStorage.getItem(QUALITY_KEY);
  return raw === "low" || raw === "high" || raw === "ultra" ? raw : "medium";
}

/** Persist 3D quality tier for the next visit. */
export function saveQualityPref(q: RenderQuality): void {
  safeStorage.setItem(QUALITY_KEY, q);
}
