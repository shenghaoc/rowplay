import type { Sport } from "../types";

export interface SportTheme {
  label: string;
  /** Word for the per-minute cadence metric. */
  cadenceUnit: string;
}

export const SPORT_THEME: Record<Sport, SportTheme> = {
  rower: {
    label: "RowErg",
    cadenceUnit: "spm",
  },
  skierg: {
    label: "SkiErg",
    cadenceUnit: "spm",
  },
  bike: {
    label: "BikeErg",
    cadenceUnit: "rpm",
  },
};

export function themeFor(sport: Sport): SportTheme {
  return SPORT_THEME[sport];
}

/** CSS color for machine icons and accents (DOM contexts that resolve var()). */
export const MACHINE_COLOR: Record<Sport, string> = {
  rower: "var(--m-rower)",
  skierg: "var(--m-skierg)",
  bike: "var(--m-bike)",
};

/** Canvas mirror of --m-* in app.css; renderer.test.ts enforces sync. */
export const MACHINE_HEX: Record<"light" | "dark", Record<Sport, string>> = {
  light: { rower: "#2b5e78", skierg: "#2e8c7e", bike: "#6257b8" },
  dark: { rower: "#5a8aaa", skierg: "#5aaa9a", bike: "#8a7ad0" },
};
