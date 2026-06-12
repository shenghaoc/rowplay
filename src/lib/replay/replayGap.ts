import { sampleAt } from "./engine";
import type { Stroke } from "../types";

/** Gap in metres between player and ghost; positive means player is ahead. */
export function raceGapMetres(playerD: number, ghostD: number): number {
  return playerD - ghostD;
}

/**
 * Gap converted to approximate seconds using current player pace.
 * Returns 0 when pace is zero (stationary start or end of workout).
 */
export function raceGapSeconds(gapM: number, playerPace500m: number): number {
  const speedMps = playerPace500m > 0 ? 500 / playerPace500m : 0;
  return speedMps > 0 ? gapM / speedMps : 0;
}

/**
 * Finish-time delta in seconds (player − ghost).
 * Negative = player was faster; positive = ghost was faster.
 */
export function finishDeltaSec(playerStrokes: Stroke[], ghostStrokes: Stroke[]): number {
  if (!playerStrokes.length || !ghostStrokes.length) return 0;
  return playerStrokes[playerStrokes.length - 1].t - ghostStrokes[ghostStrokes.length - 1].t;
}

/** Distance the ghost has covered at the moment the player crosses the finish. */
export function ghostDistAtPlayerFinish(ghostStrokes: Stroke[], playerTime: number): number {
  return sampleAt(ghostStrokes, playerTime).d;
}

/** Distance the player has covered at the moment the ghost crosses the finish. */
export function playerDistAtGhostFinish(playerStrokes: Stroke[], ghostTime: number): number {
  return sampleAt(playerStrokes, ghostTime).d;
}
