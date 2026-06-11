import { describe, expect, it } from "vite-plus/test";
import { formatPaceInput, parsePaceInput } from "./paceInput";

describe("formatPaceInput", () => {
  it("formats common paces", () => {
    expect(formatPaceInput(112)).toBe("1:52");
    expect(formatPaceInput(120)).toBe("2:00");
    expect(formatPaceInput(90)).toBe("1:30");
  });

  it("returns empty for non-positive", () => {
    expect(formatPaceInput(0)).toBe("");
    expect(formatPaceInput(-1)).toBe("");
  });
});

describe("parsePaceInput", () => {
  it("round-trips integer seconds via formatPaceInput", () => {
    for (const n of [60, 90, 100, 112, 120, 180, 240]) {
      expect(parsePaceInput(formatPaceInput(n))).toBe(n);
    }
  });

  it("parses M:SS and bare integers", () => {
    expect(parsePaceInput("1:52")).toBe(112);
    expect(parsePaceInput("01:52")).toBe(112);
    expect(parsePaceInput("2:05")).toBe(125);
    expect(parsePaceInput("112")).toBe(112);
  });

  it("rejects invalid input", () => {
    expect(parsePaceInput("")).toBeNull();
    expect(parsePaceInput("0:00")).toBeNull();
    expect(parsePaceInput("abc")).toBeNull();
    expect(parsePaceInput("-30")).toBeNull();
    expect(parsePaceInput("99:99")).toBeNull();
  });
});
