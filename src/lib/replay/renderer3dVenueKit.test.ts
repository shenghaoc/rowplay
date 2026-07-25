import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import {
  clamp01,
  degrees,
  FULL_CIRCLE,
  makeSkyRadianceTexture,
  roundedVenueBlockGeometry,
  scatterTint,
  sectorSample,
  themed,
  WORLD_UP,
  type EnvironmentSector,
  type EnvironmentStyle,
} from "./renderer3dVenueKit";

/** Minimal style: only the fields the radiance map reads are meaningful. */
function styleFixture(overrides: Partial<EnvironmentStyle> = {}): EnvironmentStyle {
  const flat = themed(0x808080, 0x202020);
  return {
    skyZenith: themed(0x0000ff, 0x000040),
    skyHorizon: themed(0x00ff00, 0x004000),
    skyNadir: themed(0xff0000, 0x400000),
    fog: flat,
    fogNear: 10,
    fogFar: 100,
    hemisphereSky: flat,
    hemisphereGround: flat,
    hemisphereIntensity: 1,
    sun: themed(0xffffff, 0xffffff),
    sunIntensity: 2,
    fill: flat,
    fillIntensity: 0.5,
    exposure: 1,
    farSilhouette: flat,
    midSilhouette: flat,
    venueStructure: flat,
    venueAccent: flat,
    infield: flat,
    apron: flat,
    envIntensity: 1,
    hemisphereIntensityIbl: 0.3,
    ...overrides,
  };
}

/** Decode one half-float RGB sample from the equirect radiance buffer. */
function radianceAt(texture: THREE.DataTexture, u: number, v: number): number[] {
  const { width, height } = texture.image;
  const x = Math.min(width - 1, Math.floor(u * width));
  const y = Math.min(height - 1, Math.floor(v * height));
  const data = texture.image.data as Uint16Array;
  const offset = (y * width + x) * 4;
  return [
    THREE.DataUtils.fromHalfFloat(data[offset]),
    THREE.DataUtils.fromHalfFloat(data[offset + 1]),
    THREE.DataUtils.fromHalfFloat(data[offset + 2]),
  ];
}

describe("renderer3dVenueKit", () => {
  it("resolves theme colours by name", () => {
    const colour = themed(0xaabbcc, 0x112233);
    expect(colour("light")).toBe(0xaabbcc);
    expect(colour("dark")).toBe(0x112233);
  });

  it("converts degrees to radians against the full circle", () => {
    expect(degrees(180)).toBeCloseTo(Math.PI, 12);
    expect(degrees(360)).toBeCloseTo(FULL_CIRCLE, 12);
    expect(degrees(0)).toBe(0);
    expect(degrees(-90)).toBeCloseTo(-Math.PI / 2, 12);
  });

  it("clamps to the unit range", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(7)).toBe(1);
  });

  it("keeps WORLD_UP the +Y unit vector", () => {
    expect(WORLD_UP.equals(new THREE.Vector3(0, 1, 0))).toBe(true);
    expect(WORLD_UP.length()).toBe(1);
  });

  describe("sectorSample", () => {
    const sectors: readonly EnvironmentSector[] = [
      { start: degrees(0), span: degrees(90) },
      { start: degrees(180), span: degrees(90) },
    ];

    it("keeps every sample inside its own sector", () => {
      for (let index = 0; index < 24; index++) {
        const { angle, sector, local } = sectorSample(index, 24, sectors);
        const target = sectors[sector]!;
        expect(angle).toBeGreaterThanOrEqual(target.start);
        expect(angle).toBeLessThanOrEqual(target.start + target.span);
        expect(local).toBeGreaterThanOrEqual(0);
        expect(local).toBeLessThanOrEqual(1);
      }
    });

    it("spreads samples across all sectors and stays deterministic", () => {
      const used = new Set(
        Array.from({ length: 24 }, (_, index) => sectorSample(index, 24, sectors).sector),
      );
      expect(used).toEqual(new Set([0, 1]));
      expect(sectorSample(5, 24, sectors)).toEqual(sectorSample(5, 24, sectors));
    });

    it("weights placement density between sectors", () => {
      const weighted: readonly EnvironmentSector[] = [
        { start: 0, span: degrees(90), weight: 3 },
        { start: degrees(180), span: degrees(90), weight: 1 },
      ];
      const inFirst = Array.from(
        { length: 40 },
        (_, index) => sectorSample(index, 40, weighted).sector,
      ).filter((sector) => sector === 0).length;
      // 3:1 weighting puts roughly three quarters of the placements in sector 0.
      expect(inFirst).toBeGreaterThan(24);
      expect(inFirst).toBeLessThan(36);
    });

    it("survives a zero count without dividing by zero", () => {
      const { angle } = sectorSample(0, 0, sectors);
      expect(Number.isFinite(angle)).toBe(true);
    });
  });

  describe("roundedVenueBlockGeometry", () => {
    /** Bounds of the block, and its centre offset from the origin. */
    function bounds(geometry: THREE.ExtrudeGeometry) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      return {
        size: box.getSize(new THREE.Vector3()),
        centre: box.getCenter(new THREE.Vector3()),
      };
    }

    it("keeps the requested extents, grown only by the bevel", () => {
      const geometry = roundedVenueBlockGeometry(9, 2.6, 3.6, 0.36);
      const { size, centre } = bounds(geometry);
      // The bevel grows the block outward symmetrically; it must never shrink
      // below the requested size, and the growth stays a small trim.
      expect(size.x).toBeGreaterThanOrEqual(9);
      expect(size.y).toBeGreaterThanOrEqual(2.6);
      expect(size.z).toBeGreaterThanOrEqual(3.6);
      expect(size.x).toBeLessThan(9 * 1.05);
      expect(size.y).toBeLessThan(2.6 * 1.15);
      expect(size.z).toBeLessThan(3.6 * 1.15);
      // Centred on the origin, so callers position by centre rather than corner.
      expect(centre.length()).toBeLessThan(1e-6);
      geometry.dispose();
    });

    it("clamps an oversized corner radius instead of inverting the shape", () => {
      const geometry = roundedVenueBlockGeometry(2, 2, 1, 99);
      const { size, centre } = bounds(geometry);
      expect(size.x).toBeGreaterThanOrEqual(2);
      expect(size.y).toBeGreaterThanOrEqual(2);
      expect(size.x).toBeLessThan(2 * 1.25);
      expect(size.y).toBeLessThan(2 * 1.25);
      expect(centre.length()).toBeLessThan(1e-6);
      geometry.dispose();
    });
  });

  describe("makeSkyRadianceTexture", () => {
    const up = new THREE.Vector3(0, 1, 0);

    it("orients the gradient so the sky is up and the ground is down", () => {
      // Getting Three's equirect convention inverted would light every venue
      // from the ground, which is the kind of error that still renders.
      const texture = makeSkyRadianceTexture(styleFixture(), "light", up);
      const top = radianceAt(texture, 0.5, 0.99);
      const bottom = radianceAt(texture, 0.5, 0.01);
      // Zenith is pure blue, nadir pure red in the fixture.
      expect(top[2]).toBeGreaterThan(top[0]);
      expect(bottom[0]).toBeGreaterThan(bottom[2]);
      texture.dispose();
    });

    it("carries the solar disc above 1.0 so specular has something to catch", () => {
      const texture = makeSkyRadianceTexture(styleFixture(), "light", up);
      // The disc sits at the zenith for a straight-up sun direction.
      const [r, g, b] = radianceAt(texture, 0.5, 0.999);
      expect(Math.max(r, g, b)).toBeGreaterThan(1);
      texture.dispose();
    });

    it("scales the disc with the venue key so an indoor roof gets no fake sun", () => {
      const bright = makeSkyRadianceTexture(styleFixture({ sunIntensity: 4 }), "light", up);
      const dim = makeSkyRadianceTexture(styleFixture({ sunIntensity: 0.5 }), "light", up);
      expect(Math.max(...radianceAt(bright, 0.5, 0.999))).toBeGreaterThan(
        Math.max(...radianceAt(dim, 0.5, 0.999)),
      );
      bright.dispose();
      dim.dispose();
    });

    it("is half-float equirect data in linear space", () => {
      const texture = makeSkyRadianceTexture(styleFixture(), "light", up);
      // rgba16float is filterable on both backends; rgba32float is not.
      expect(texture.type).toBe(THREE.HalfFloatType);
      expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
      expect(texture.colorSpace).toBe(THREE.LinearSRGBColorSpace);
      texture.dispose();
    });

    it("re-themes rather than reusing the light values", () => {
      const light = makeSkyRadianceTexture(styleFixture(), "light", up);
      const dark = makeSkyRadianceTexture(styleFixture(), "dark", up);
      expect(radianceAt(light, 0.5, 0.9)).not.toEqual(radianceAt(dark, 0.5, 0.9));
      light.dispose();
      dark.dispose();
    });
  });

  describe("scatterTint", () => {
    function instanced(count: number): THREE.InstancedMesh {
      return new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), count);
    }

    it("varies instance colour so a stand stops reading as one repeated stamp", () => {
      const mesh = instanced(24);
      scatterTint(mesh, 24, 12.9898);
      const colour = new THREE.Color();
      const seen = new Set<string>();
      for (let i = 0; i < 24; i++) {
        mesh.getColorAt(i, colour);
        seen.add(colour.getHexString());
      }
      expect(seen.size).toBeGreaterThan(12);
      mesh.dispose();
    });

    it("stays centred on 1.0 so it modulates the themed colour instead of darkening it", () => {
      const mesh = instanced(64);
      scatterTint(mesh, 64, 5.3271);
      const colour = new THREE.Color();
      let total = 0;
      for (let i = 0; i < 64; i++) {
        mesh.getColorAt(i, colour);
        total += (colour.r + colour.g + colour.b) / 3;
      }
      expect(total / 64).toBeCloseTo(1, 1);
      mesh.dispose();
    });

    it("is deterministic, so venue rebuilds and QA frames stay comparable", () => {
      const a = instanced(16);
      const b = instanced(16);
      scatterTint(a, 16, 9.4413);
      scatterTint(b, 16, 9.4413);
      const ca = new THREE.Color();
      const cb = new THREE.Color();
      for (let i = 0; i < 16; i++) {
        a.getColorAt(i, ca);
        b.getColorAt(i, cb);
        expect(ca.getHex()).toBe(cb.getHex());
      }
      a.dispose();
      b.dispose();
    });

    it("honours a zero temperature swing for trunks", () => {
      const mesh = instanced(12);
      scatterTint(mesh, 12, 7.117, 0.09, 0);
      const colour = new THREE.Color();
      for (let i = 0; i < 12; i++) {
        mesh.getColorAt(i, colour);
        expect(colour.r).toBeCloseTo(colour.b, 5);
      }
      mesh.dispose();
    });
  });
});
