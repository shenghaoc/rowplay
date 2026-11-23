import { describe, expect, it } from "vite-plus/test";
import { params } from "./params";

describe("workout ID route coercion", () => {
  it.each([
    ["1001", 1001],
    ["001001", 1001],
    ["0x3e9", 1001],
    ["1.001e3", 1001],
    [" 1001 ", 1001],
    ["+1001", 1001],
    ["0", 0],
    ["-1", -1],
    ["1.5", 1.5],
    ["invalid", NaN],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("keeps %s as %s for the existing HTTP boundary checks", async (raw, expected) => {
    const result = await params.workoutId["~standard"].validate(raw);
    expect(result.issues).toBeUndefined();
    if (result.issues) throw new Error("The route must reach its endpoint validation.");
    expect(Object.is(result.value, expected)).toBe(true);
  });
});
