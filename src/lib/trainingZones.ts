import { distancePBs } from './analytics';
import { logbookEpochMillis } from './datetime';
import type { Split, Sport, Stroke, Workout } from './types';

// ---------------------------------------------------------------------------
// Training intensity zones — pure classification & aggregation (no DOM).
// ---------------------------------------------------------------------------

export const ZONES_5 = ['UT2', 'UT1', 'AT', 'TR', 'AN'] as const;
export const ZONES_3 = ['Easy', 'Moderate', 'Hard'] as const;
export type ZoneLabel = (typeof ZONES_5)[number] | (typeof ZONES_3)[number];

export type ZoneConfig =
	| { basePace: number; medianPace?: number; sportMedians?: Partial<Record<Sport, number>> }
	| { basePace: null; medianPace: number; sportMedians?: Partial<Record<Sport, number>> };

export interface ZoneSlice {
	zone: ZoneLabel;
	seconds: number;
	meters: number;
}

export interface ZoneDistribution {
	slices: ZoneSlice[];
	totalSeconds: number;
	totalMeters: number;
}

/** Workouts optionally carrying cached stroke/split detail for finer attribution. */
export type WorkoutForDistribution = Workout & {
	strokes?: Stroke[];
	splits?: Split[];
};

const REFERENCE_DAYS = 365;

function zoneList(config: ZoneConfig): readonly ZoneLabel[] {
	return config.basePace != null ? ZONES_5 : ZONES_3;
}

function emptySlices(config: ZoneConfig): ZoneSlice[] {
	return zoneList(config).map((zone) => ({ zone, seconds: 0, meters: 0 }));
}

function medianOfPaces(paces: number[]): number {
	if (!paces.length) return 0;
	const sorted = [...paces].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Median per-workout average pace. Optional `sport` scopes to one machine family.
 */
export function medianTrainingPace(workouts: Workout[], sport?: Sport): number {
	const paces = workouts
		.filter((w) => w.pace > 0 && w.distance > 0 && (!sport || w.sport === sport))
		.map((w) => w.pace);
	return medianOfPaces(paces);
}

/** RowErg 2k PB pace (sec/500m), or null when no qualifying piece exists. */
export function rower2kBasePace(workouts: Workout[]): number | null {
	const pb = distancePBs(workouts).find((p) => p.sport === 'rower' && p.distance === 2000);
	return pb?.pace ?? null;
}

/** Stable reference window for zone boundaries (not the TID period filter). */
export function referenceWorkouts(workouts: Workout[], nowMs = Date.now()): Workout[] {
	const cutoff = nowMs - REFERENCE_DAYS * 86_400_000;
	return workouts.filter((w) => {
		const ms = logbookEpochMillis(w.date);
		return Number.isFinite(ms) && ms >= cutoff;
	});
}

/**
 * Build zone config from history: 5-zone when a RowErg 2k PB exists; otherwise 3-zone
 * from a static median. Sport-specific medians power 3-zone fallback for SkiErg/BikeErg
 * when mixing sports under a 5-zone RowErg anchor.
 */
export function buildZoneConfig(workouts: Workout[], nowMs = Date.now()): ZoneConfig {
	const ref = referenceWorkouts(workouts, nowMs);
	const sportMedians: Partial<Record<Sport, number>> = {
		rower: medianTrainingPace(ref, 'rower'),
		skierg: medianTrainingPace(ref, 'skierg'),
		bike: medianTrainingPace(ref, 'bike')
	};
	const base = rower2kBasePace(ref);
	if (base != null) {
		return { basePace: base, medianPace: sportMedians.rower, sportMedians };
	}
	const global = medianTrainingPace(ref);
	return { basePace: null, medianPace: global || sportMedians.rower || 120, sportMedians };
}

function classify5(pace: number, base: number): (typeof ZONES_5)[number] {
	if (pace > base * 1.2) return 'UT2';
	if (pace > base * 1.1) return 'UT1';
	if (pace > base * 1.02) return 'AT';
	if (pace > base * 0.97) return 'TR';
	return 'AN';
}

function classify3(pace: number, median: number): (typeof ZONES_3)[number] {
	if (pace > median * 1.1) return 'Easy';
	if (pace > median * 0.95) return 'Moderate';
	return 'Hard';
}

function usesFiveZone(config: ZoneConfig, sport: Sport): boolean {
	return config.basePace != null && sport === 'rower';
}

function medianForSport(config: ZoneConfig, sport: Sport): number {
	return config.sportMedians?.[sport] ?? config.medianPace ?? 120;
}

/**
 * Classify a single pace (sec/500m). RowErg uses 5-zone when `basePace` is set;
 * other sports use 3-zone with sport-specific median under mixed-sport 5-zone config.
 */
export function classifyPace(pace: number, config: ZoneConfig, sport: Sport = 'rower'): ZoneLabel {
	if (pace <= 0) return usesFiveZone(config, sport) ? 'UT2' : 'Easy';
	if (usesFiveZone(config, sport)) return classify5(pace, config.basePace!);
	return classify3(pace, medianForSport(config, sport));
}

function addToSlice(slices: ZoneSlice[], zone: ZoneLabel, seconds: number, meters: number) {
	if (seconds <= 0 && meters <= 0) return;
	const s = slices.find((x) => x.zone === zone);
	if (!s) return;
	s.seconds += seconds;
	s.meters += meters;
}

function accumulateStrokes(
	strokes: Stroke[],
	sport: Sport,
	config: ZoneConfig,
	slices: ZoneSlice[]
) {
	if (!strokes.length) return;
	for (let i = 0; i < strokes.length; i++) {
		const prev = i > 0 ? strokes[i - 1]! : null;
		const cur = strokes[i]!;
		const dt = prev ? Math.max(0, cur.t - prev.t) : Math.max(0, cur.t);
		const dd = prev ? Math.max(0, cur.d - prev.d) : Math.max(0, cur.d);
		if (dt <= 0 && dd <= 0) continue;
		const zone = classifyPace(cur.pace, config, sport);
		addToSlice(slices, zone, dt, dd);
	}
}

function accumulateSplits(
	splits: Split[],
	sport: Sport,
	config: ZoneConfig,
	slices: ZoneSlice[]
) {
	for (const sp of splits) {
		if (sp.isRest || sp.time <= 0) continue;
		const zone = classifyPace(sp.pace, config, sport);
		addToSlice(slices, zone, sp.time, sp.distance);
	}
}

function accumulateSummary(w: Workout, config: ZoneConfig, slices: ZoneSlice[]) {
	if (w.time <= 0) return;
	const zone = classifyPace(w.pace, config, w.sport);
	addToSlice(slices, zone, w.time, w.distance);
}

/**
 * Aggregate workouts into zone slices. Per-stroke when available, else splits, else summary.
 */
export function buildDistribution(
	workouts: WorkoutForDistribution[],
	config: ZoneConfig
): ZoneDistribution {
	const slices = emptySlices(config);
	for (const w of workouts) {
		if (w.strokes?.length) {
			accumulateStrokes(w.strokes, w.sport, config, slices);
			continue;
		}
		if (w.splits?.length) {
			accumulateSplits(w.splits, w.sport, config, slices);
			continue;
		}
		accumulateSummary(w, config, slices);
	}
	const totalSeconds = slices.reduce((s, z) => s + z.seconds, 0);
	const totalMeters = slices.reduce((s, z) => s + z.meters, 0);
	return { slices, totalSeconds, totalMeters };
}

export type TidPeriod = '4w' | '3m' | '12m';

const PERIOD_DAYS: Record<TidPeriod, number> = {
	'4w': 28,
	'3m': 91,
	'12m': 365
};

/** Filter workouts to those on or after the period start (inclusive). */
export function workoutsInPeriod(workouts: Workout[], period: TidPeriod, nowMs = Date.now()): Workout[] {
	const days = PERIOD_DAYS[period];
	const cutoff = nowMs - days * 86_400_000;
	return workouts.filter((w) => {
		const ms = logbookEpochMillis(w.date);
		return Number.isFinite(ms) && ms >= cutoff;
	});
}

export function slicePercent(slice: ZoneSlice, total: number): number {
	if (total <= 0) return 0;
	return (slice.seconds / total) * 100;
}

export function slicePercentDistance(slice: ZoneSlice, total: number): number {
	if (total <= 0) return 0;
	return (slice.meters / total) * 100;
}
