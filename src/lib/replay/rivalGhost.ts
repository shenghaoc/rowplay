import type { Stroke, WorkoutDetail } from "../types";

/** Public rival trace returned by `/api/ghost/<token>` — no PII. */
export interface RivalGhostTrace {
  sport: WorkoutDetail["sport"];
  distance: number;
  time: number;
  pace: number;
  date: string;
  workoutType?: string;
  hasStrokeData: boolean;
  strokes: Stroke[];
}

const SHARE_TOKEN_RE = /^[a-f0-9]{48}$/;

export function isShareToken(token: string | null | undefined): token is string {
  return !!token && SHARE_TOKEN_RE.test(token);
}

/** Strip a shared workout down to what the ghost lane needs. */
export function toRivalGhostTrace(detail: WorkoutDetail): RivalGhostTrace {
  return {
    sport: detail.sport,
    distance: detail.distance,
    time: detail.time,
    pace: detail.pace,
    date: detail.date,
    workoutType: detail.workoutType,
    hasStrokeData: detail.hasStrokeData,
    strokes: detail.strokes,
  };
}

export interface RaceDeepLinkRival {
  pace: number;
  displayName: string;
  shareToken?: string;
}

/** Build `/replay/<id>?…` query for leaderboard "Race". */
export function buildRaceDeepLink(workoutId: number, rival: RaceDeepLinkRival): string {
  const params = new URLSearchParams({
    ghostPace: String(rival.pace),
    ghostName: rival.displayName,
  });
  if (rival.shareToken) params.set("ghostToken", rival.shareToken);
  return `/replay/${workoutId}?${params.toString()}`;
}
