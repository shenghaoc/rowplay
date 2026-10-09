import { describe, expect, it } from "vite-plus/test";
import { TIMEZONE_OPTIONS, TIMEZONE_VALUES } from "./timezoneOptions";

describe("TIMEZONE_OPTIONS", () => {
  it("exposes a unique, non-empty set of IANA zones", () => {
    const values = TIMEZONE_OPTIONS.flatMap((g) => g.options.map((o) => o.value));
    expect(values.length).toBeGreaterThan(20);
    expect(new Set(values).size).toBe(values.length);
    expect(TIMEZONE_VALUES).toEqual(new Set(values));
  });

  it("lists only zones the runtime Intl implementation accepts", () => {
    for (const value of TIMEZONE_VALUES) {
      expect(() => Intl.DateTimeFormat(undefined, { timeZone: value })).not.toThrow();
    }
  });
});
