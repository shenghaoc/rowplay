import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * The 3D renderer assembles CC0 surface-map URLs from directory and suffix
 * conventions (`applyEnvironmentSurfaceMaps` appends `-diffuse-512.jpg` and
 * friends), so a rename or a dropped file breaks a material slot without
 * breaking typecheck, lint, or the build. The renderer's unit harness also
 * substitutes a bare `THREE.Texture` when there is no DOM, so it never touches
 * the real files either.
 *
 * These tests close that gap: they resolve what the renderer actually asks for
 * against what the repository actually ships, in both directions, and keep the
 * provenance record honest by re-deriving every shipped digest.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const RENDERER = join(REPO_ROOT, "src/lib/replay/renderer3d.ts");
const ENVIRONMENTS = join(REPO_ROOT, "static/replay-assets/environments");
const README = join(ENVIRONMENTS, "README.md");

/** Suffixes `applyEnvironmentSurfaceMaps` appends to a base path. */
const MAP_SUFFIXES = ["-diffuse-512.jpg", "-roughness-512.jpg", "-normal-gl-512.jpg"] as const;

async function referencedPaths(): Promise<string[]> {
  const source = await readFile(RENDERER, "utf8");
  const matches = source.matchAll(/["'`](\/replay-assets\/environments\/[A-Za-z0-9_./-]+)["'`]/g);
  return [...new Set([...matches].map((match) => match[1]!))].sort();
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function shippedFiles(): Promise<string[]> {
  const dirs = await readdir(ENVIRONMENTS, { withFileTypes: true });
  const files: string[] = [];
  for (const dir of dirs.filter((entry) => entry.isDirectory())) {
    for (const file of await readdir(join(ENVIRONMENTS, dir.name))) {
      files.push(`${dir.name}/${file}`);
    }
  }
  return files.sort();
}

describe("replay environment surface maps", () => {
  it("ships every texture the 3D renderer asks for", async () => {
    const referenced = await referencedPaths();
    // Guards the guard: if the renderer stops referencing these URLs (or the
    // literals move behind a helper) this sweep would silently pass on nothing.
    expect(referenced.length).toBeGreaterThan(10);

    const missing: string[] = [];
    for (const path of referenced) {
      // A bare base path is expanded by `applyEnvironmentSurfaceMaps`; an
      // explicit `.jpg` is loaded directly.
      const candidates = path.endsWith(".jpg")
        ? [path]
        : MAP_SUFFIXES.map((suffix) => `${path}${suffix}`);
      for (const candidate of candidates) {
        if (!(await exists(join(REPO_ROOT, "static", candidate)))) missing.push(candidate);
      }
    }
    expect(missing).toEqual([]);
  });

  it("does not ship texture sets no sport uses", async () => {
    const source = await readFile(RENDERER, "utf8");
    const unused = (await readdir(ENVIRONMENTS, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !source.includes(`/replay-assets/environments/${name}/`));
    expect(unused).toEqual([]);
  });

  it("records a matching SHA-256 for every shipped map", async () => {
    const readme = await readFile(README, "utf8");
    const undocumented: string[] = [];
    for (const file of await shippedFiles()) {
      const bytes = await readFile(join(ENVIRONMENTS, file));
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (!readme.includes(digest)) undocumented.push(`${file} (${digest})`);
    }
    expect(undocumented).toEqual([]);
  });

  it("documents provenance for every shipped set", async () => {
    const readme = await readFile(README, "utf8");
    const dirs = (await readdir(ENVIRONMENTS, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const dir of dirs) {
      expect(readme, `${dir} missing from provenance README`).toContain(`${dir}/`);
    }
    // Requirement 4 fields, recorded once per set. `Creators:` is the plural
    // form used where photography and processing credit different people.
    expect(readme.match(/- Creators?:/g)?.length).toBe(dirs.length);
    expect(readme.match(/- License:/g)?.length).toBe(dirs.length);
    expect(readme.match(/- Retrieved:/g)?.length).toBe(dirs.length);
    expect(readme.match(/- Source: /g)?.length).toBe(dirs.length);
  });
});
