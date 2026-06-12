import type { Workout } from "./types";

/**
 * True when `source` matches the observed EXR value (case-insensitive).
 * Concept2 docs do not enumerate `source`; EXR is observed in the wild — verify
 * against real logbook data before extending matchers.
 */
export function isExrSource(workout?: Pick<Workout, "source"> | null): boolean {
  return workout?.source?.toUpperCase() === "EXR";
}
