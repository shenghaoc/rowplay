import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { BIKE_RIG } from "./bikeRig";
import {
  BIKE_SADDLE_LENGTH,
  BIKE_SADDLE_MAX_HALF_WIDTH,
  BIKE_SADDLE_NOSE_Z,
  BIKE_SADDLE_REAR_Z,
  BIKE_SADDLE_SHELL_THICKNESS,
  BIKE_SADDLE_STATIONS,
  bikeSaddleDropAt,
  bikeSaddleStationAt,
  buildBikeSaddleGeometry,
} from "./bikeSaddle";

describe("bike saddle stations", () => {
  it("runs nose-ward with no repeated or reversed station", () => {
    for (let i = 1; i < BIKE_SADDLE_STATIONS.length; i++) {
      expect(BIKE_SADDLE_STATIONS[i]!.z).toBeGreaterThan(BIKE_SADDLE_STATIONS[i - 1]!.z);
    }
    expect(BIKE_SADDLE_LENGTH).toBeCloseTo(BIKE_SADDLE_NOSE_Z - BIKE_SADDLE_REAR_Z, 9);
  });

  it("interpolates between stations and stops at the saddle's own ends", () => {
    expect(bikeSaddleStationAt(BIKE_SADDLE_REAR_Z - 0.001)).toBeNull();
    expect(bikeSaddleStationAt(BIKE_SADDLE_NOSE_Z + 0.001)).toBeNull();

    const first = BIKE_SADDLE_STATIONS[0]!;
    const second = BIKE_SADDLE_STATIONS[1]!;
    const mid = bikeSaddleStationAt((first.z + second.z) / 2);
    expect(mid).not.toBeNull();
    expect(mid!.halfWidth).toBeCloseTo((first.halfWidth + second.halfWidth) / 2, 9);
    expect(mid!.dropOuter).toBeCloseTo((first.dropOuter + second.dropOuter) / 2, 9);
  });

  it("reports no material outside the shell or inside the cut-out", () => {
    const widest = BIKE_SADDLE_STATIONS.reduce((a, b) => (b.halfWidth > a.halfWidth ? b : a));
    expect(bikeSaddleDropAt(widest.halfWidth + 0.001, widest.z)).toBeNull();
    expect(bikeSaddleDropAt(widest.halfWidth - 0.001, widest.z)).not.toBeNull();

    const cut = BIKE_SADDLE_STATIONS.find((station) => station.cutout > 0)!;
    expect(bikeSaddleDropAt(0, cut.z)).toBeNull();
    expect(bikeSaddleDropAt(cut.cutout * 0.5, cut.z)).toBeNull();
    expect(bikeSaddleDropAt(cut.cutout + 0.002, cut.z)).not.toBeNull();

    // Beyond the ends there is nothing at any lateral offset.
    expect(bikeSaddleDropAt(0.04, BIKE_SADDLE_NOSE_Z + 0.01)).toBeNull();
  });

  it("dips toward the channel and rises to the wing, never above the pad top", () => {
    const station = BIKE_SADDLE_STATIONS.find(
      (candidate) => candidate.cutout > 0 && candidate.dropChannel > candidate.dropOuter,
    )!;
    const atChannel = bikeSaddleDropAt(station.cutout + 1e-4, station.z)!;
    const atWing = bikeSaddleDropAt(station.halfWidth, station.z)!;
    expect(atChannel).toBeGreaterThan(atWing);
    expect(atWing).toBeCloseTo(station.dropOuter, 6);

    for (let z = BIKE_SADDLE_REAR_Z; z <= BIKE_SADDLE_NOSE_Z; z += 0.005) {
      for (let x = 0; x <= BIKE_SADDLE_MAX_HALF_WIDTH; x += 0.005) {
        const drop = bikeSaddleDropAt(x, z);
        if (drop === null) continue;
        expect(drop, `drop at (${x.toFixed(3)}, ${z.toFixed(3)})`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });
});

describe("bike saddle geometry", () => {
  const geometry = buildBikeSaddleGeometry(THREE, { lateralSegments: 6, stationsPerSpan: 2 });

  it("builds a finite indexed shell", () => {
    const position = geometry.getAttribute("position");
    expect(position.count).toBeGreaterThan(100);
    for (let i = 0; i < position.count; i++) {
      expect(Number.isFinite(position.getX(i))).toBe(true);
      expect(Number.isFinite(position.getY(i))).toBe(true);
      expect(Number.isFinite(position.getZ(i))).toBe(true);
    }
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    expect(index!.count % 3).toBe(0);
    for (let i = 0; i < index!.count; i++) {
      expect(index!.getX(i)).toBeLessThan(position.count);
    }
  });

  it("lands its top surface exactly on the contract pad top", () => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // Local Y is offset so the widest station's top is the pad top, which is
    // what `BIKE_RIG.saddle` + `saddlePadHalfHeight` promises the sit solve.
    expect(box.max.y).toBeCloseTo(BIKE_RIG.saddlePadHalfHeight, 6);
    expect(box.min.y).toBeCloseTo(
      BIKE_RIG.saddlePadHalfHeight -
        Math.max(...BIKE_SADDLE_STATIONS.map((s) => s.dropChannel)) -
        BIKE_SADDLE_SHELL_THICKNESS,
      3,
    );
    expect(box.max.x).toBeCloseTo(BIKE_SADDLE_MAX_HALF_WIDTH, 6);
    expect(box.min.x).toBeCloseTo(-BIKE_SADDLE_MAX_HALF_WIDTH, 6);
    expect(box.min.z).toBeCloseTo(BIKE_SADDLE_REAR_Z, 6);
    expect(box.max.z).toBeCloseTo(BIKE_SADDLE_NOSE_Z, 6);
  });

  it("leaves the cut-out open in the built mesh, not just in the contract", () => {
    const position = geometry.getAttribute("position");
    const cut = BIKE_SADDLE_STATIONS.find((station) => station.cutout > 0)!;
    let nearCentreline = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getZ(i) - cut.z) > 0.004) continue;
      if (Math.abs(position.getX(i)) < cut.cutout * 0.5) nearCentreline += 1;
    }
    expect(nearCentreline, "no shell vertices inside the cut-out").toBe(0);
  });

  it("tessellates more finely when asked", () => {
    const coarse = buildBikeSaddleGeometry(THREE, { lateralSegments: 4, stationsPerSpan: 1 });
    const fine = buildBikeSaddleGeometry(THREE, { lateralSegments: 10, stationsPerSpan: 3 });
    expect(fine.getAttribute("position").count).toBeGreaterThan(
      coarse.getAttribute("position").count,
    );
    // Same contract, so the silhouette must not move with the tier.
    coarse.computeBoundingBox();
    fine.computeBoundingBox();
    expect(fine.boundingBox!.max.y).toBeCloseTo(coarse.boundingBox!.max.y, 6);
    expect(fine.boundingBox!.max.x).toBeCloseTo(coarse.boundingBox!.max.x, 6);
  });
});
