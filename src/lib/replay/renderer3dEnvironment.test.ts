import { describe, expect, it, vi } from "vite-plus/test";
import * as THREE from "three";
import { EnvironmentBuilder, type EnvironmentBuildContext } from "./renderer3dEnvironment";
import { themed, type EnvironmentSector, type ThemeColor } from "./renderer3dVenueKit";
import type { Sport } from "../types";
import type { RenderQuality } from "./replayRenderer";

/**
 * The builders are meant to reach their renderer only through
 * `EnvironmentBuildContext`. Driving them from a hand-built context is the direct
 * test of that: if a builder still needed anything else, it could not run here.
 *
 * `renderer3d.test.ts` covers the venues as the renderer assembles them —
 * object names, tier differentiation, and payload budget. This file covers the
 * seam and the ownership contract.
 */

const DETAIL: Record<RenderQuality, 0 | 1 | 2 | 3> = {
  low: 0,
  medium: 1,
  high: 2,
  ultra: 3,
};

function makeContext(sport: Sport, quality: RenderQuality) {
  const registries = {
    materials: [] as THREE.Material[],
    geometries: [] as THREE.BufferGeometry[],
    instanced: [] as THREE.InstancedMesh[],
    textures: [] as THREE.Texture[],
    themeMats: [] as Array<{
      material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      color: ThemeColor;
    }>,
  };

  const ctx: EnvironmentBuildContext = {
    sport,
    quality,
    cfg: {
      dprCap: 1,
      antialias: false,
      laneSegments: 48,
      groundSegments: 8,
      displacement: false,
      shadows: false,
      shadowMapSize: 512,
      wake: 0,
      buoys: false,
      buoysPerRing: 0,
      buoyRings: 0,
      spray: false,
      sprayParticles: 0,
      sprayPerCatch: 0,
      environmentDetail: DETAIL[quality],
      bodySegments: 6,
    },
    environment: {
      skyZenith: themed(0x8ec5e8, 0x0a1420),
      skyHorizon: themed(0xd9ecf7, 0x14243a),
      skyNadir: themed(0xbfd9e8, 0x0a141f),
      fog: themed(0xd9ecf7, 0x14243a),
      fogNear: 60,
      fogFar: 180,
      hemisphereSky: themed(0xbfd9e8, 0x1b2c42),
      hemisphereGround: themed(0x6f7f68, 0x121c26),
      hemisphereIntensity: 1,
      sun: themed(0xfff4e0, 0x8fa8c4),
      sunIntensity: 1,
      fill: themed(0xffffff, 0x7f97b5),
      fillIntensity: 0.4,
      exposure: 1,
      farSilhouette: themed(0x7f9bb0, 0x1a2a3c),
      midSilhouette: themed(0x5f7f6a, 0x162430),
      venueStructure: themed(0xd8d2c6, 0x2a3340),
      venueAccent: themed(0xb14a3c, 0x5c2a24),
      infield: themed(0x7fa06a, 0x1b2a1e),
      apron: themed(0xb9b3a6, 0x252d38),
      envIntensity: 0.8,
      hemisphereIntensityIbl: 0.35,
    },
    textures: registries.textures,
    environmentThemeMats: registries.themeMats,
    mat: (m) => {
      registries.materials.push(m);
      return m;
    },
    track: (g) => {
      registries.geometries.push(g);
      return g;
    },
    trackInstanced: (mesh) => {
      registries.instanced.push(mesh);
      return mesh;
    },
    environmentStandardMat: (name, color, opts) => {
      const material = new THREE.MeshStandardMaterial({ ...opts, color: color("light") });
      material.name = name;
      registries.materials.push(material);
      registries.themeMats.push({ material, color });
      return material;
    },
    environmentBasicMat: (name, color, opts) => {
      const material = new THREE.MeshBasicMaterial({ ...opts, color: color("light") });
      material.name = name;
      registries.materials.push(material);
      registries.themeMats.push({ material, color });
      return material;
    },
    makeVerticalArc: (
      name: string,
      radius: number,
      height: number,
      y: number,
      _sector: EnvironmentSector,
      material: THREE.Material,
    ) => {
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 8, 1, true);
      registries.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.y = y;
      return mesh;
    },
  };
  return { ctx, registries };
}

const WORLDS = {
  rower: "addRowerRegattaWorld",
  skierg: "addSkiStadiumWorld",
  bike: "addBikeCircuitWorld",
} as const satisfies Record<Sport, keyof EnvironmentBuilder>;

function buildWorld(sport: Sport, quality: RenderQuality) {
  const { ctx, registries } = makeContext(sport, quality);
  const builder = new EnvironmentBuilder(ctx);
  const mid = new THREE.Group();
  const detail = new THREE.Group();
  builder[WORLDS[sport]](mid, detail, 42);
  return { builder, registries, mid, detail };
}

describe("EnvironmentBuilder", () => {
  it.each(["rower", "skierg", "bike"] as const)(
    "builds the %s world from the context alone",
    (sport) => {
      const { mid, detail } = buildWorld(sport, "high");
      let meshes = 0;
      for (const group of [mid, detail]) {
        group.traverse((object) => {
          if (object instanceof THREE.Mesh) meshes++;
        });
      }
      expect(meshes).toBeGreaterThan(10);
    },
  );

  it.each(["rower", "skierg", "bike"] as const)(
    "registers every %s geometry and material with the renderer, owning none itself",
    (sport) => {
      const { registries, mid, detail } = buildWorld(sport, "high");
      expect(registries.geometries.length).toBeGreaterThan(0);
      expect(registries.materials.length).toBeGreaterThan(0);

      // Anything reachable in the built scene must be registered for disposal,
      // otherwise destroy() would leak it.
      const tracked = new Set<unknown>([...registries.geometries, ...registries.materials]);
      const untracked: string[] = [];
      for (const group of [mid, detail]) {
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          if (!tracked.has(object.geometry)) untracked.push(`${object.name}: geometry`);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            if (!tracked.has(material)) untracked.push(`${object.name}: ${material.name}`);
          }
        });
      }
      expect(untracked).toEqual([]);
    },
  );

  it.each(["rower", "skierg", "bike"] as const)(
    "gives the governor %s dressing it can shed",
    (sport) => {
      // applyPerfLevel() hides only the detail group, so that group has to hold
      // real content or a step-down saves nothing.
      const { detail } = buildWorld(sport, "high");
      let objects = 0;
      detail.traverse(() => objects++);
      expect(objects).toBeGreaterThan(1);
    },
  );

  it.each(["rower", "skierg", "bike"] as const)("spends a higher %s tier on content", (sport) => {
    const count = (group: THREE.Group) => {
      let n = 0;
      group.traverse(() => n++);
      return n;
    };
    // Note the density lands on the midground group, which the governor keeps.
    // Only the detail group is sheddable, so a step-down does not reclaim the
    // bulk of what High and Ultra add here.
    const low = buildWorld(sport, "low");
    const high = buildWorld(sport, "high");
    expect(count(high.mid) + count(high.detail)).toBeGreaterThan(
      count(low.mid) + count(low.detail),
    );
  });

  it("builds the groomed-snow texture once and reuses it", () => {
    const { ctx } = makeContext("skierg", "high");
    const builder = new EnvironmentBuilder(ctx);
    const first = builder.makeSnowSurfaceTexture(2);
    const second = builder.makeSnowSurfaceTexture(2);
    expect(second).toBe(first);
    // Registered exactly once, so destroy() disposes it exactly once.
    expect(ctx.textures.filter((texture) => texture === first)).toHaveLength(1);
  });

  it("leaves Low and Medium free of bundled surface maps", () => {
    for (const quality of ["low", "medium"] as const) {
      const { registries } = buildWorld("rower", quality);
      const bundled = registries.textures.filter(
        (texture) => typeof texture.userData.sourcePath === "string",
      );
      expect(bundled, `${quality} bound a bundled map`).toEqual([]);
    }
  });

  it("binds bundled surface maps at High and adds normals at Ultra", () => {
    const high = buildWorld("rower", "high");
    const ultra = buildWorld("rower", "ultra");
    const paths = (textures: THREE.Texture[]) =>
      textures
        .map((texture) => texture.userData.sourcePath)
        .filter((path): path is string => typeof path === "string");

    expect(paths(high.registries.textures).length).toBeGreaterThan(0);
    expect(paths(high.registries.textures).some((path) => path.includes("normal-gl"))).toBe(false);
    expect(paths(ultra.registries.textures).some((path) => path.includes("normal-gl"))).toBe(true);
  });

  it("falls back to the authored colour when a bundled map cannot load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const origDocument = globalThis.document;
    globalThis.document = {
      createElementNS: (_ns: string, tag: string) => {
        if (tag !== "img") return {};
        const listeners = new Map<string, (event: unknown) => void>();
        return {
          addEventListener: (type: string, fn: (event: unknown) => void) =>
            void listeners.set(type, fn),
          removeEventListener: (type: string) => void listeners.delete(type),
          set src(_url: string) {
            queueMicrotask(() => listeners.get("error")?.({ type: "error" }));
          },
        };
      },
    } as unknown as Document;
    try {
      const { ctx } = makeContext("bike", "high");
      const builder = new EnvironmentBuilder(ctx);
      const material = new THREE.MeshStandardMaterial({ color: 0x334455 });
      builder.loadEnvironmentTexture(
        material,
        "map",
        "/replay-assets/environments/wood-floor/wood-floor-diffuse-512.jpg",
        [4, 4],
      );
      await Promise.resolve();
      expect(material.map).toBeNull();
      expect(material.color.getHex()).toBe(0x334455);
      expect(warn.mock.calls.flat().join(" ")).toContain("environment surface map unavailable");
    } finally {
      globalThis.document = origDocument;
      warn.mockRestore();
    }
  });
});
