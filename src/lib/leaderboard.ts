import type { Sport } from './types';

/**
 * Pure leaderboard logic — no DOM, no server imports. Safe on server or client
 * and the unit-test surface for the feature (see leaderboard.test.ts).
 *
 * A "board" is the ranked standings for one (sport, distance) pair. Athletes
 * publish a result onto the board matching their workout's standard distance,
 * and the board ranks every athlete's best effort fastest-first.
 */

/** Canonical race distances boards group by — mirrors STANDARD_PB_DISTANCES in db.ts. */
export const STANDARD_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097] as const;

/** Stable sport order for laying boards out predictably. */
export const SPORT_ORDER: Sport[] = ['rower', 'skierg', 'bike'];

/** One athlete's published result on a board. `isYou` flags the viewer's row. */
export interface LeaderboardEntry {
	sport: Sport;
	distance: number;
	displayName: string;
	/** Elapsed time in seconds — the rank key. */
	time: number;
	/** Average pace, seconds per 500m. */
	pace: number;
	date: string;
	workoutId: number;
	/** Public replay capability token, when the result has been shared. */
	shareToken?: string;
	isYou?: boolean;
}

/** A leaderboard entry decorated with its standing. */
export interface RankedEntry extends LeaderboardEntry {
	/** 1-based; entries with equal time share a rank. */
	rank: number;
	/** Seconds behind the board leader (0 for the leader). */
	gapSeconds: number;
}

/** A ranked board for one (sport, distance) pair. */
export interface Board {
	sport: Sport;
	distance: number;
	entries: RankedEntry[];
}

/** Stable map key for a (sport, distance) board. */
export function boardKey(sport: Sport, distance: number): string {
	return `${sport}:${distance}`;
}

/**
 * Snap a workout distance onto the nearest standard board distance, or null if
 * it is outside tolerance of every standard distance. Tolerance is the larger
 * of ±2% or ±10m so short pieces (500m) and long ones (half-marathon) both
 * absorb the small under/over-run a real erg records.
 */
export function matchStandardDistance(distance: number): number | null {
	if (!Number.isFinite(distance) || distance <= 0) return null;
	let best: number | null = null;
	let bestDiff = Infinity;
	for (const std of STANDARD_DISTANCES) {
		const diff = Math.abs(distance - std);
		const tolerance = Math.max(std * 0.02, 10);
		if (diff <= tolerance && diff < bestDiff) {
			best = std;
			bestDiff = diff;
		}
	}
	return best;
}

/**
 * Rank a single board's entries fastest-first. Equal times share a rank
 * (standard competition ranking — the next distinct time skips the tied
 * positions); the gap is seconds behind the leader. Ties break by newer date so
 * the more recent effort lists first.
 */
export function rankEntries(entries: LeaderboardEntry[]): RankedEntry[] {
	const sorted = [...entries].sort((a, b) => {
		if (a.time !== b.time) return a.time - b.time;
		return b.date.localeCompare(a.date);
	});
	if (!sorted.length) return [];
	const leaderTime = sorted[0].time;
	const ranked: RankedEntry[] = [];
	for (let i = 0; i < sorted.length; i++) {
		const e = sorted[i];
		// Share the previous rank on an exact time tie, else rank is position+1.
		const prev = ranked[i - 1];
		const rank = prev && prev.time === e.time ? prev.rank : i + 1;
		ranked.push({ ...e, rank, gapSeconds: round1(e.time - leaderTime) });
	}
	return ranked;
}

/**
 * Group entries into ranked boards. Boards come back in a stable order: by
 * sport (rower, skierg, bike) then ascending distance.
 */
export function buildBoards(entries: LeaderboardEntry[]): Board[] {
	const groups = new Map<string, LeaderboardEntry[]>();
	for (const e of entries) {
		const key = boardKey(e.sport, e.distance);
		const bucket = groups.get(key);
		if (bucket) bucket.push(e);
		else groups.set(key, [e]);
	}

	const boards: Board[] = [];
	for (const [, group] of groups) {
		boards.push({
			sport: group[0].sport,
			distance: group[0].distance,
			entries: rankEntries(group)
		});
	}

	boards.sort((a, b) => {
		const sportDiff = SPORT_ORDER.indexOf(a.sport) - SPORT_ORDER.indexOf(b.sport);
		if (sportDiff !== 0) return sportDiff;
		return a.distance - b.distance;
	});
	return boards;
}

/** Find one board within a set, or null. */
export function findBoard(
	boards: Board[],
	sport: Sport,
	distance: number
): Board | null {
	return boards.find((b) => b.sport === sport && b.distance === distance) ?? null;
}

function round1(x: number): number {
	return Math.round(x * 10) / 10;
}
