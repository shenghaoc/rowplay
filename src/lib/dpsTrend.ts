import type { Sport, Workout } from './types';

export interface DpsPoint {
	date: string;
	workoutId: number;
	sport: Sport;
	rawDps: number;
	normDps: number;
	avgPaceSecs: number;
	strokeCount: number;
}

export interface MovingAvgPoint {
	date: string;
	value: number;
}

const DEFAULT_REFERENCE_PACE = 120;

function dayKey(date: string): string {
	return date.slice(0, 10);
}

/** Signed calendar-day distance from `from` to `to`. */
function calendarDayDiff(from: string, to: string): number {
	const a = Date.parse(`${dayKey(from)}T00:00:00Z`);
	const b = Date.parse(`${dayKey(to)}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

function median(values: number[]): number {
	if (values.length === 0) return DEFAULT_REFERENCE_PACE;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? sorted[mid]!
		: (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Compute one DpsPoint per workout that has a stroke count.
 * Workouts without strokeCount are excluded (not imputed).
 */
export function computeDpsTrend(workouts: Workout[], sport?: Sport): DpsPoint[] {
	let pool = workouts.filter(
		(w) => w.strokeCount != null && w.strokeCount > 0 && w.distance > 0 && w.pace > 0
	);
	if (sport) pool = pool.filter((w) => w.sport === sport);

	const preliminary = pool.map((w) => ({
		date: w.date,
		workoutId: w.id,
		sport: w.sport,
		rawDps: w.distance / w.strokeCount!,
		avgPaceSecs: w.pace,
		strokeCount: w.strokeCount!
	}));

	const paces = preliminary.map((p) => p.avgPaceSecs);
	const referencePace = paces.length >= 3 ? median(paces) : DEFAULT_REFERENCE_PACE;

	const points: DpsPoint[] = preliminary.map((p) => ({
		...p,
		normDps: p.rawDps * Math.sqrt(referencePace / p.avgPaceSecs)
	}));

	return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Centred rolling mean over `windowDays` calendar days.
 * Points outside the window at either end use a shrinking window.
 */
export function movingAverage(
	points: DpsPoint[],
	metric: 'rawDps' | 'normDps',
	windowDays: number
): MovingAvgPoint[] {
	if (points.length === 0) return [];
	const half = windowDays / 2;

	return points.map((p) => {
		const inWindow = points.filter((q) => Math.abs(calendarDayDiff(p.date, q.date)) <= half);
		const value = inWindow.reduce((sum, q) => sum + q[metric], 0) / inWindow.length;
		return { date: p.date, value };
	});
}
