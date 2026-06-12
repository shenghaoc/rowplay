import type { DistancePB } from "$lib/analytics";
import type { Workout } from "$lib/types";
import { safeStorage } from "./safeStorage";

/** Polling interval presets (seconds). Minimum 30 per Concept2 rate guidance. */
export const LIVE_INTERVALS = [30, 60, 120, 300] as const;
export type LiveIntervalSec = (typeof LIVE_INTERVALS)[number];

export type LiveDataSource = "poll" | "webhook";

export interface LiveModePrefs {
  enabled: boolean;
  intervalSec: LiveIntervalSec;
  soundEnabled: boolean;
  source: LiveDataSource;
}

export const DEFAULT_LIVE_PREFS: LiveModePrefs = {
  enabled: false,
  intervalSec: 60,
  soundEnabled: false,
  source: "poll",
};

const STORAGE_KEY = "live_mode_prefs";

export interface LivePollResult {
  workouts: Workout[];
  added: number;
  total: number;
  newPbs: DistancePB[];
}

function parseInterval(n: unknown): LiveIntervalSec {
  const v = Number(n);
  return (LIVE_INTERVALS as readonly number[]).includes(v) ? (v as LiveIntervalSec) : 60;
}

/** Read persisted live mode preferences (client-only). */
export function loadLivePrefs(): LiveModePrefs {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LIVE_PREFS };
    const p = JSON.parse(raw) as Partial<LiveModePrefs>;
    return {
      enabled: !!p.enabled,
      intervalSec: parseInterval(p.intervalSec),
      soundEnabled: !!p.soundEnabled,
      source: p.source === "webhook" ? "webhook" : "poll",
    };
  } catch {
    return { ...DEFAULT_LIVE_PREFS };
  }
}

/** Persist live mode preferences and mirror to a cookie for SSR hints. */
export function saveLivePrefs(prefs: LiveModePrefs): void {
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  if (typeof document !== "undefined") {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `live_mode=${prefs.enabled ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }
}

/** Exponential backoff after failures: 30s → 60s → 120s → 300s cap. */
export function nextBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const steps = [30_000, 60_000, 120_000, 300_000];
  return steps[Math.min(consecutiveFailures - 1, steps.length - 1)];
}

const HIDDEN_MIN_INTERVAL_SEC = 300;

/** Active tab uses configured interval; hidden tab slows to at least 5 minutes. */
export function effectiveIntervalSec(baseSec: number, tabVisible: boolean): number {
  if (tabVisible) return baseSec;
  return Math.max(baseSec, HIDDEN_MIN_INTERVAL_SEC);
}

/** Random delay for demo mock polls: 30s–3min. */
export function randomMockDelayMs(): number {
  return 30_000 + Math.floor(Math.random() * 150_000);
}
