import { describe, expect, it } from "vite-plus/test";
import { SKI_ATHLETE_PROPORTIONS, SKI_EQUIPMENT_DETAIL, skiEquipmentDetail } from "./skiEquipment";

describe("SkiErg equipment contract", () => {
  it("keeps ski and pole dimensions in a readable classic range", () => {
    // Ratios are against the athlete this rig actually renders, not a nominal
    // 1.8 m figure. `renderer3d.test.ts` pins `standingHeight` to the measured
    // V4 rest-pose stature, so these assertions describe shipped proportions
    // rather than dividing two constants from the same object.
    //
    // Both are derived from the measured rig into the classic bands. The
    // previous 126% / 93% overshoot came from sizing against a nominal 1.8 m
    // figure that matched no rig in this repository.
    const height = SKI_ATHLETE_PROPORTIONS.standingHeight;
    const skiRatio = SKI_ATHLETE_PROPORTIONS.skiLength / height;
    const poleRatio = SKI_ATHLETE_PROPORTIONS.poleLength / height;
    expect(skiRatio).toBeGreaterThanOrEqual(1.12);
    expect(skiRatio).toBeLessThanOrEqual(1.17);
    expect(poleRatio).toBeGreaterThanOrEqual(0.83);
    expect(poleRatio).toBeLessThanOrEqual(0.84);
    // Readable needle: thinner than the old 110 mm planks, wide enough that a
    // boot sole can sit on it without looking absurd at chase distance.
    expect(SKI_ATHLETE_PROPORTIONS.skiWidth).toBeGreaterThan(0.06);
    expect(SKI_ATHLETE_PROPORTIONS.skiWidth).toBeLessThan(0.09);
    expect(SKI_ATHLETE_PROPORTIONS.skiWidth).toBeLessThan(SKI_ATHLETE_PROPORTIONS.skiCenterOffset);
    // Stance near hip width (~0.30 m), not a single rail and not a splay.
    expect(SKI_ATHLETE_PROPORTIONS.skiCenterOffset * 2).toBeCloseTo(0.3, 5);
    expect(SKI_ATHLETE_PROPORTIONS.skiCenterOffset).toBeGreaterThan(
      SKI_ATHLETE_PROPORTIONS.hipHalfWidth,
    );
    expect(SKI_ATHLETE_PROPORTIONS.thighLength + SKI_ATHLETE_PROPORTIONS.shinLength).toBeCloseTo(
      0.79,
      6,
    );
  });

  it("adds actual equipment geometry as quality rises", () => {
    const qualities = ["low", "medium", "high", "ultra"] as const;
    const detail = qualities.map(skiEquipmentDetail);

    expect(detail.map((tier) => tier.radialSegments)).toEqual([8, 12, 16, 20]);
    // Low ships a complete silhouette and nothing optional; every gate is off.
    expect(detail[0]).toEqual({
      radialSegments: 8,
      topSheet: false,
      metalEdges: false,
      bindingRails: false,
      bootClosures: false,
      gripStraps: false,
      basketRibs: false,
    });
    // Medium adds functional hardware but not the fine trim.
    expect(detail[1]?.topSheet).toBe(true);
    expect(detail[1]?.bindingRails).toBe(true);
    expect(detail[1]?.bootClosures).toBe(true);
    expect(detail[1]?.gripStraps).toBe(true);
    expect(detail[1]?.metalEdges).toBe(false);
    expect(detail[1]?.basketRibs).toBe(false);
    // High/Ultra earn the trim that only reads at their pixel density.
    expect(detail[2]?.metalEdges).toBe(true);
    expect(detail[2]?.basketRibs).toBe(true);
    // Ultra differs from High in resolution alone.
    expect({ ...detail[3], radialSegments: 16 }).toEqual(detail[2]);
  });

  it("freezes the shared contracts so a renderer cannot retune them per lane", () => {
    // Live and ghost avatars both read these objects. A mutation on one lane
    // would silently follow the other.
    expect(Object.isFrozen(SKI_ATHLETE_PROPORTIONS)).toBe(true);
    expect(Object.isFrozen(SKI_EQUIPMENT_DETAIL)).toBe(true);
  });
});
