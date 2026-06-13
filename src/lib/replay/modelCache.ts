import type { Group } from "three";

/**
 * Minimal GLTF result — only the parts we need (scene graph).
 */
interface GLTFResult {
  scene: Group;
}

type LoaderFactory = () => {
  loadAsync(url: string): Promise<GLTFResult>;
};

/** In-memory GLTF cache keyed by URL. */
export class ModelCache {
  private cache = new Map<string, GLTFResult>();
  private loading = new Map<string, Promise<GLTFResult>>();
  private createLoader: LoaderFactory;

  constructor(createLoader: LoaderFactory) {
    this.createLoader = createLoader;
  }

  /** Load a GLTF model. Returns cached result if already loaded. */
  async load(url: string): Promise<GLTFResult> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const pending = this.loading.get(url);
    if (pending) return pending;

    const promise = this.createLoader()
      .loadAsync(url)
      .then((result) => {
        this.cache.set(url, result);
        this.loading.delete(url);
        return result;
      })
      .catch((err) => {
        this.loading.delete(url);
        throw err;
      });

    this.loading.set(url, promise);
    return promise;
  }

  /** Clone the scene from a loaded model for independent avatar instances. */
  cloneScene(url: string): Group | null {
    const cached = this.cache.get(url);
    if (!cached) return null;
    return cached.scene.clone(true);
  }

  /** Check if a model is loaded (for testing). */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /** Clear the cache (for testing). */
  clear(): void {
    this.cache.clear();
    this.loading.clear();
  }
}
