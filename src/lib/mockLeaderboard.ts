import type { Sport } from "./types";
import { mockWorkoutDetail, mockWorkouts } from "./mockData";
import type { WorkoutDetail } from "./types";
import {
  boardKey,
  matchStandardDistance,
  STANDARD_DISTANCES,
  type LeaderboardEntry,
} from "./leaderboard";

/**
 * Deterministic leaderboard data for demo mode so every board is populated and
 * fully explorable with zero configuration — and with NO KV/D1 writes on read.
 *
 * Entries are the demo athlete's own standard-distance results (flagged `isYou`,
 * carrying their real workout id so the replay link works) plus a fixed roster
 * of synthetic rivals seeded per board. Rivals expose only a neutral handle and
 * their metrics — no PII. Most rivals race via a pace ghost; "Otter" on the
 * rower 2k board also carries a demo share token for stroke-accurate racing.
 */

const RIVAL_NAMES = ["Otter", "Heron", "Marlin", "Falcon", "Lynx", "Orca"] as const;

/**
 * Stable demo share token for rival "Otter" on the rower 2k board — resolves to
 * mock workout 1007 without KV writes (see `resolveDemoBoardShare`).
 */
export const DEMO_RIVAL_OTTER_TOKEN = "c0ffee000000000000000000000000000000000000000001";

/** Demo-only board share tokens → mock workout detail (read-only, no KV). */
const DEMO_BOARD_SHARES: Record<string, number> = {
  [DEMO_RIVAL_OTTER_TOKEN]: 1007,
};

/** Resolve a pre-seeded demo board share token to stroke data. */
export function resolveDemoBoardShare(token: string): WorkoutDetail | null {
  const id = DEMO_BOARD_SHARES[token];
  return id != null ? mockWorkoutDetail(id) : null;
}

/** Base pace (sec/500m) per sport, before per-rival offsets. */
const BASE_PACE: Record<Sport, number> = { rower: 106, skierg: 117, bike: 90 };

/** Per-rival pace offset (sec/500m) so each board has a believable spread. */
const RIVAL_OFFSETS = [-4, -1.5, 0.5, 2, 3.5, 5.5];

const SPORTS: Sport[] = ["rower", "skierg", "bike"];

/** Tiny seeded PRNG so rival jitter and dates are stable across reloads. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Synthetic rival entries for one (sport, distance) board. */
function rivalsForBoard(sport: Sport, distance: number): LeaderboardEntry[] {
  const sportIdx = SPORTS.indexOf(sport);
  const rand = rng(sportIdx * 100000 + distance);
  return RIVAL_NAMES.map((name, i) => {
    const jitter = (rand() - 0.5) * 3; // ±1.5 sec/500m
    const pace = BASE_PACE[sport] + RIVAL_OFFSETS[i] + jitter;
    const time = round1((pace * distance) / 500);
    // Deterministic date spread over the past few weeks.
    const day = String(1 + Math.floor(rand() * 27)).padStart(2, "0");
    const shareToken =
      name === "Otter" && sport === "rower" && distance === 2000
        ? DEMO_RIVAL_OTTER_TOKEN
        : undefined;
    return {
      sport,
      distance,
      displayName: name,
      time,
      pace: round1(pace),
      date: `2026-05-${day} 07:00:00`,
      workoutId: shareToken ? DEMO_BOARD_SHARES[shareToken] : 0,
      shareToken,
      isYou: false,
    } satisfies LeaderboardEntry;
  });
}

/** The demo athlete's own best result on each standard board they have rowed. */
function demoAthleteEntries(): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>();
  for (const w of mockWorkouts()) {
    const std = matchStandardDistance(w.distance);
    if (std == null) continue;
    const key = boardKey(w.sport, std);
    const candidate: LeaderboardEntry = {
      sport: w.sport,
      distance: std,
      displayName: "You",
      time: round1(w.time),
      pace: round1(w.pace),
      date: w.date,
      workoutId: w.id,
      isYou: true,
    };
    const prev = best.get(key);
    if (!prev || candidate.time < prev.time) best.set(key, candidate);
  }
  return [...best.values()];
}

/** Full deterministic demo leaderboard: rivals on every board plus the athlete. */
export function mockLeaderboard(): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const sport of SPORTS) {
    for (const distance of STANDARD_DISTANCES) {
      entries.push(...rivalsForBoard(sport, distance));
    }
  }
  entries.push(...demoAthleteEntries());
  return entries;
}
