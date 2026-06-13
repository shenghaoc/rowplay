import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  loadQualityPref,
  loadRendererPref,
  saveQualityPref,
  saveRendererPref,
} from "./replayRenderer";

function stubLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  // @ts-expect-error test stub
  globalThis.localStorage = ls;
  return store;
}

describe("replayRenderer preference", () => {
  let store: Map<string, string>;

  afterEach(() => {
    store.clear();
  });

  it("defaults to 2d", () => {
    store = stubLocalStorage();
    expect(loadRendererPref()).toBe("2d");
  });

  it("round-trips 3d", () => {
    store = stubLocalStorage();
    saveRendererPref("3d");
    expect(loadRendererPref()).toBe("3d");
    saveRendererPref("2d");
    expect(loadRendererPref()).toBe("2d");
  });

  it("round-trips ultra quality and ignores unknown values", () => {
    store = stubLocalStorage();
    saveQualityPref("ultra");
    expect(loadQualityPref()).toBe("ultra");
    store.set("replay_quality", "cinematic");
    expect(loadQualityPref()).toBe("medium");
  });
});
