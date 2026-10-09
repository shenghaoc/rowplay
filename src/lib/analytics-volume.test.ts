import { describe, expect, it } from "vite-plus/test";
import { volumeIntensityLevel } from "./analytics";

describe("volumeIntensityLevel", () => {
  const spread = [100, 200, 300, 400];

  it("returns 0 for non-positive volume or a non-positive level count", () => {
    expect(volumeIntensityLevel(0, spread)).toBe(0);
    expect(volumeIntensityLevel(-20, spread)).toBe(0);
    expect(volumeIntensityLevel(400, spread, 0)).toBe(0);
  });

  it("treats an empty history as a single active level", () => {
    expect(volumeIntensityLevel(10, [])).toBe(1);
  });

  it("assigns the top level when every active day has the same volume", () => {
    // Identical volumes collapse the quantile breaks. Leaving them at level 1
    // would paint a full training week as if it were the lightest bucket.
    expect(volumeIntensityLevel(200, [200, 200, 200])).toBe(4);
    expect(volumeIntensityLevel(50, [100, 200], 1)).toBe(1);
  });

  it("maps a spread of volumes onto increasing quantile levels", () => {
    expect(volumeIntensityLevel(50, spread)).toBe(1);
    expect(volumeIntensityLevel(100, spread)).toBe(1);
    expect(volumeIntensityLevel(150, spread)).toBe(2);
    expect(volumeIntensityLevel(250, spread)).toBe(3);
    expect(volumeIntensityLevel(350, spread)).toBe(4);
    expect(volumeIntensityLevel(500, spread)).toBe(4);
  });
});
