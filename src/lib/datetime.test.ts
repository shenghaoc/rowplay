import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  dayKeyEpochMillis,
  fmtDate,
  fmtDateFromEpochMillis,
  fmtLogbookDateTime,
  logbookEpochMillis,
  overlapDate,
  parseInstantMillis,
  parseLogbookDateTime,
  todayKeyForTz,
  todayKeyUtc,
  workoutLocalDayKey,
} from "./datetime";

describe("workoutLocalDayKey", () => {
  it("falls back to plain date slice when no timezone", () => {
    expect(workoutLocalDayKey("2024-01-15 01:00:00")).toBe("2024-01-15");
  });

  it("keeps the plain date as-is when date is in workoutTz (monitor-local)", () => {
    // 23:30 in America/New_York is still Jan 14.
    expect(workoutLocalDayKey("2024-01-14 23:30:00", "America/New_York")).toBe("2024-01-14");
  });

  it("keeps the plain date as-is for Auckland workoutTz (monitor-local, not UTC-shifted)", () => {
    // 23:30 NZDT is still Jan 14 in Auckland — NOT Jan 15.
    expect(workoutLocalDayKey("2024-01-14 23:30:00", "Pacific/Auckland")).toBe("2024-01-14");
  });

  it("cross-zone: Auckland evening workout converted to New York home timezone", () => {
    // 23:30 NZDT = 05:30 EST, still Jan 14 in New York.
    expect(workoutLocalDayKey("2024-01-14 23:30:00", "Pacific/Auckland", "America/New_York")).toBe(
      "2024-01-14",
    );
  });

  it("cross-zone: New York late workout converted to Auckland home timezone rolls forward", () => {
    // 23:30 EST (UTC-5) = 17:30 NZDT (UTC+13) next day → Jan 15 in Auckland.
    expect(workoutLocalDayKey("2024-01-14 23:30:00", "America/New_York", "Pacific/Auckland")).toBe(
      "2024-01-15",
    );
  });

  it("falls through invalid workout tz to plain date", () => {
    expect(workoutLocalDayKey("2024-01-14 23:30:00", "Not/Real")).toBe("2024-01-14");
  });

  it("uses plain date when only homeTz is known (no source zone info)", () => {
    // Without knowing the source zone, plain date is best effort.
    expect(workoutLocalDayKey("2024-01-14 23:30:00", undefined, "America/New_York")).toBe(
      "2024-01-14",
    );
  });

  it("falls through invalid workout and home tz to plain date", () => {
    expect(workoutLocalDayKey("2024-01-14 23:30:00", "Bad", "Also/Bad")).toBe("2024-01-14");
  });
});

describe("todayKeyForTz", () => {
  it("matches UTC helper when tz is absent", () => {
    expect(todayKeyForTz()).toBe(todayKeyUtc());
  });

  it("returns a valid date for a known zone", () => {
    const key = todayKeyForTz("America/New_York");
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to UTC for invalid zone", () => {
    expect(todayKeyForTz("Not/AZone")).toBe(todayKeyUtc());
  });
});

describe("parseLogbookDateTime", () => {
  it("parses a standard logbook timestamp", () => {
    const pdt = parseLogbookDateTime("2026-01-15 08:30:00");
    expect(pdt).not.toBeNull();
    expect(pdt!.year).toBe(2026);
    expect(pdt!.month).toBe(1);
    expect(pdt!.day).toBe(15);
    expect(pdt!.hour).toBe(8);
    expect(pdt!.minute).toBe(30);
    expect(pdt!.second).toBe(0);
  });

  it("trims leading/trailing whitespace", () => {
    const pdt = parseLogbookDateTime("  2026-06-01 12:00:00  ");
    expect(pdt).not.toBeNull();
    expect(pdt!.year).toBe(2026);
  });

  it("returns null for invalid text", () => {
    expect(parseLogbookDateTime("not a date")).toBeNull();
    expect(parseLogbookDateTime("")).toBeNull();
  });

  it("returns null for an out-of-range date", () => {
    expect(parseLogbookDateTime("2026-99-01 00:00:00")).toBeNull();
  });
});

describe("logbookEpochMillis", () => {
  it("returns epoch millis for a valid timestamp (UTC wall clock)", () => {
    // 2000-01-01 00:00:00 UTC → 946684800000
    expect(logbookEpochMillis("2000-01-01 00:00:00")).toBe(946684800000);
  });

  it("returns NaN for invalid input", () => {
    expect(logbookEpochMillis("bad")).toBeNaN();
  });
});

describe("parseInstantMillis", () => {
  it("parses ISO-8601 with Z offset", () => {
    expect(parseInstantMillis("2000-01-01T00:00:00Z")).toBe(946684800000);
  });

  it("parses RFC 3339 with numeric offset", () => {
    // Same instant, different representation
    expect(parseInstantMillis("2000-01-01T01:00:00+01:00")).toBe(946684800000);
  });

  it("returns NaN for invalid text", () => {
    expect(parseInstantMillis("not a timestamp")).toBeNaN();
    expect(parseInstantMillis("")).toBeNaN();
  });

  it("rejects offset-less timestamps so logbook parsing stays timezone-stable", () => {
    expect(parseInstantMillis("2000-01-01T00:00:00")).toBeNaN();
  });
});

describe("overlapDate", () => {
  it("returns the day before a logbook date", () => {
    expect(overlapDate("2026-06-03 10:00:00")).toBe("2026-06-02");
  });

  it("handles month-end rollover", () => {
    expect(overlapDate("2026-03-01 00:00:00")).toBe("2026-02-28");
  });

  it("handles year-end rollover", () => {
    expect(overlapDate("2027-01-01 00:00:00")).toBe("2026-12-31");
  });

  it("returns null for invalid input", () => {
    expect(overlapDate("invalid")).toBeNull();
    expect(overlapDate("")).toBeNull();
  });
});

describe("fmtDate", () => {
  it("formats an ISO instant string with locale and timezone", () => {
    const result = fmtDate("2026-06-03T12:00:00Z", "en-US", "UTC");
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2026/);
  });

  it("formats a logbook datetime string", () => {
    const result = fmtDate("2026-06-03 12:00:00", "en-US", "UTC");
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2026/);
  });

  it("formats a plain date string", () => {
    const result = fmtDate("2026-06-03", "en-US", "UTC");
    expect(result).toMatch(/2026/);
  });

  it("falls back to the original string for garbage input", () => {
    expect(fmtDate("garbage")).toBe("garbage");
  });
});

describe("fmtLogbookDateTime", () => {
  it("formats a valid logbook timestamp as a locale string", () => {
    const result = fmtLogbookDateTime("2026-06-03 12:00:00", "en-US");
    expect(result).toContain("2026");
  });

  it("returns the raw value for invalid input", () => {
    expect(fmtLogbookDateTime("invalid-date", "en-US")).toBe("invalid-date");
  });
});

describe("fmtDateFromEpochMillis", () => {
  it("formats epoch milliseconds to a readable date", () => {
    // 946684800000 = 2000-01-01T00:00:00Z
    const result = fmtDateFromEpochMillis(946684800000, "en-US");
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2000/);
  });

  it("returns -- for NaN", () => {
    expect(fmtDateFromEpochMillis(NaN)).toBe("--");
  });

  it("returns -- for Infinity", () => {
    expect(fmtDateFromEpochMillis(Infinity)).toBe("--");
  });
});

describe("todayKeyUtc", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a YYYY-MM-DD string", () => {
    expect(todayKeyUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches the frozen UTC date", () => {
    expect(todayKeyUtc()).toBe("2026-06-03");
  });
});

describe("dayKeyEpochMillis", () => {
  it("converts 2000-01-01 to UTC midnight epoch ms", () => {
    expect(dayKeyEpochMillis("2000-01-01")).toBe(946684800000);
  });

  it("converts 2026-06-03 correctly", () => {
    // 2026-06-03T00:00:00Z
    const result = dayKeyEpochMillis("2026-06-03");
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
    // Verify it round-trips: converting back to a day key should give the same string
    const back = new Date(result).toISOString().slice(0, 10);
    expect(back).toBe("2026-06-03");
  });

  it("returns NaN for invalid key", () => {
    expect(dayKeyEpochMillis("not-a-date")).toBeNaN();
    expect(dayKeyEpochMillis("")).toBeNaN();
  });
});
