import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import {
  clamp01,
  degrees,
  FULL_CIRCLE,
  roundedVenueBlockGeometry,
  sectorSample,
  themed,
  WORLD_UP,
  type EnvironmentSector,
} from "./renderer3dVenueKit";

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
});
