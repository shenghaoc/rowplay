import { describe, expect, it } from "vite-plus/test";
import { MACHINE_COLOR, MACHINE_HEX, SPORT_THEME, themeFor } from "./sports";

describe("SPORT_THEME", () => {
  it("has entries for all three sports", () => {
    expect(SPORT_THEME.rower).toBeDefined();
    expect(SPORT_THEME.skierg).toBeDefined();
    expect(SPORT_THEME.bike).toBeDefined();
  });

  it("uses spm cadence unit for rower and skierg", () => {
    expect(SPORT_THEME.rower.cadenceUnit).toBe("spm");
    expect(SPORT_THEME.skierg.cadenceUnit).toBe("spm");
  });

  it("uses rpm cadence unit for bike", () => {
    expect(SPORT_THEME.bike.cadenceUnit).toBe("rpm");
  });

  it("uses the Concept2 brand names for labels", () => {
    expect(SPORT_THEME.rower.label).toBe("RowErg");
    expect(SPORT_THEME.skierg.label).toBe("SkiErg");
    expect(SPORT_THEME.bike.label).toBe("BikeErg");
  });
});

describe("themeFor", () => {
  it("returns the correct theme for each sport", () => {
    expect(themeFor("rower")).toBe(SPORT_THEME.rower);
    expect(themeFor("skierg")).toBe(SPORT_THEME.skierg);
    expect(themeFor("bike")).toBe(SPORT_THEME.bike);
  });

  it("returns an object with label and cadenceUnit", () => {
    const theme = themeFor("rower");
    expect(typeof theme.label).toBe("string");
    expect(typeof theme.cadenceUnit).toBe("string");
  });
});

describe("MACHINE_COLOR", () => {
  it("provides CSS variable references for all sports", () => {
    expect(MACHINE_COLOR.rower).toMatch(/^var\(--/);
    expect(MACHINE_COLOR.skierg).toMatch(/^var\(--/);
    expect(MACHINE_COLOR.bike).toMatch(/^var\(--/);
  });
});

describe("MACHINE_HEX", () => {
  it("provides hex values for light and dark modes", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const sport of ["rower", "skierg", "bike"] as const) {
        const hex = MACHINE_HEX[mode][sport];
        expect(hex, `${mode}.${sport} should be a hex color`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("uses different colors for light vs dark mode", () => {
    expect(MACHINE_HEX.light.rower).not.toBe(MACHINE_HEX.dark.rower);
  });

  it("uses different colors for different sports in the same mode", () => {
    expect(MACHINE_HEX.light.rower).not.toBe(MACHINE_HEX.light.skierg);
    expect(MACHINE_HEX.light.rower).not.toBe(MACHINE_HEX.light.bike);
  });
});
