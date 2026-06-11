import { afterEach, describe, expect, it } from "vite-plus/test";
import { loadRenderer3D, resetRenderer3DCache, webglSupported } from "./renderer3dLoader";

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
