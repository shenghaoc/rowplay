import { describe, expect, it } from "vite-plus/test";
import { toSport } from "./types";

describe("toSport", () => {
  it("maps Concept2 ski machine aliases onto skierg", () => {
    expect(toSport("ski")).toBe("skierg");
    expect(toSport("skierg")).toBe("skierg");
  });

  it("maps Concept2 bike machine aliases onto bike", () => {
    expect(toSport("bike")).toBe("bike");
    expect(toSport("bikeerg")).toBe("bike");
  });

  it("defaults unknown, empty, and omitted types to rower", () => {
    expect(toSport("row")).toBe("rower");
    expect(toSport("rower")).toBe("rower");
    expect(toSport("")).toBe("rower");
    expect(toSport(undefined)).toBe("rower");
  });
});
