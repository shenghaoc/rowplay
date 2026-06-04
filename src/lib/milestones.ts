import { addDaysToKey, trainingStreakStats, workoutDayKey } from '$lib/analytics';
import type { Sport, Workout } from '$lib/types';

export interface Milestone {
	id: string;
	/** i18n key for the display label, e.g. `milestone.lifetime_distance_rower_500k` */
	labelKey: string;
	achieved: boolean;
	/** ISO calendar day (`YYYY-MM-DD`) of first achievement */
	achievedAt?: string;
	/** 0–1 fraction toward the threshold; 1.0 when achieved */
	progress: number;
	currentValue: number;
	threshold: number;
}

export type MilestonePersonalBest = {
	distance: number;
	sport: Sport;
	time: number;
	date: string;
};

const SPORTS: Sport[] = ['rower', 'skierg', 'bike'];
const COMBINED = 'combined' as const;

const DISTANCE_THRESHOLDS = [
	{ metres: 100_000, suffix: '100k' },
	{ metres: 250_000, suffix: '250k' },
	{ metres: 500_000, suffix: '500k' },
	{ metres: 1_000_000, suffix: '1M' },
	{ metres: 2_000_000, suffix: '2M' },
	{ metres: 5_000_000, suffix: '5M' },
	{ metres: 10_000_000, suffix: '10M' }
] as const;

const SESSION_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000, 2500] as const;

const STREAK_THRESHOLDS = [7, 14, 30, 60, 100] as const;

const PB_2K_GATES = [
	{ id: 'pb_2k_sub8', seconds: 8 * 60 },
	{ id: 'pb_2k_sub730', seconds: 7 * 60 + 30 },
	{ id: 'pb_2k_sub7', seconds: 7 * 60 },
	{ id: 'pb_2k_sub630', seconds: 6 * 60 + 30 }
] as const;

function clampProgress(current: number, threshold: number): number {
	if (threshold <= 0) return 0;
	return Math.min(current / threshold, 1);
}

function isConsecutiveDay(prev: string, next: string): boolean {
	return addDaysToKey(prev, 1) === next;
}

function workoutDay(w: Workout, homeTz?: string): string {
	return workoutDayKey(w.date, w.timezone, homeTz);
}


/** First calendar day a running total crosses `threshold` (ascending workout order). */
function crossingDayByCumulative(
	workoutsAsc: Workout[],
	valueOf: (w: Workout) => number,
	threshold: number,
	homeTz?: string
): string | undefined {
	let total = 0;
	for (const w of workoutsAsc) {
		total += valueOf(w);
		if (total >= threshold) return workoutDay(w, homeTz);
	}
	return undefined;
}

function lifetimeDistanceMilestones(workouts: Workout[], homeTz?: string): Milestone[] {
	const asc = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
	const workoutsBySport = new Map<typeof COMBINED | Sport, Workout[]>();
	workoutsBySport.set(COMBINED, asc);
	for (const sport of SPORTS) {
		workoutsBySport.set(sport, asc.filter((w) => w.sport === sport));
	}
	const perSport = new Map<typeof COMBINED | Sport, number>();
	for (const [sport, list] of workoutsBySport) {
		perSport.set(sport, list.reduce((s, w) => s + w.distance, 0));
	}
	const out: Milestone[] = [];
	for (const { metres, suffix } of DISTANCE_THRESHOLDS) {
		for (const sport of [...SPORTS, COMBINED]) {
			const id = `lifetime_distance_${sport}_${suffix}`;
			const labelKey = `milestone.${id}`;
			const current = perSport.get(sport)!;
			const achieved = current >= metres;
			const sportAsc = workoutsBySport.get(sport)!;
			const achievedAt = achieved
				? crossingDayByCumulative(sportAsc, (w) => w.distance, metres, homeTz)
				: undefined;
			out.push({
				id,
				labelKey,
				achieved,
				achievedAt,
				progress: clampProgress(current, metres),
				currentValue: current,
				threshold: metres
			});
		}
	}
	return out;
}

function sessionCountMilestones(workouts: Workout[], homeTz?: string): Milestone[] {
	const asc = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
	const count = workouts.length;
	return SESSION_THRESHOLDS.map((threshold) => {
		const id = `session_count_${threshold}`;
		const achieved = count >= threshold;
		const achievedAt = achieved
			? workoutDay(asc[threshold - 1], homeTz)
			: undefined;
		return {
			id,
			labelKey: `milestone.${id}`,
			achieved,
			achievedAt,
			progress: clampProgress(count, threshold),
			currentValue: count,
			threshold
		};
	});
}

function streakAchievementDays(activeDays: string[]): Map<number, string> {
	const sorted = [...new Set(activeDays)].sort();
	const firstHit = new Map<number, string>();
	let run = 0;
	let prev: string | null = null;
	for (const day of sorted) {
		if (prev && isConsecutiveDay(prev, day)) run++;
		else run = 1;
		for (const threshold of STREAK_THRESHOLDS) {
			if (run >= threshold && !firstHit.has(threshold)) firstHit.set(threshold, day);
		}
		prev = day;
	}
	return firstHit;
}

function streakMilestones(workouts: Workout[], homeTz?: string, endDay?: string): Milestone[] {
	const activeDays = workouts.map((w) => workoutDay(w, homeTz));
	const { currentStreak, longestStreak } = trainingStreakStats(workouts, endDay, homeTz);
	const firstHits = streakAchievementDays(activeDays);
	return STREAK_THRESHOLDS.map((threshold) => {
		const id = `streak_${threshold}d`;
		const achieved = longestStreak >= threshold;
		return {
			id,
			labelKey: `milestone.${id}`,
			achieved,
			achievedAt: firstHits.get(threshold),
			progress: achieved ? 1 : clampProgress(currentStreak, threshold),
			currentValue: currentStreak,
			threshold
		};
	});
}

function pb2kMilestones(personalBests: MilestonePersonalBest[]): Milestone[] {
	const best = personalBests
		.filter((pb) => pb.sport === 'rower' && pb.distance === 2000)
		.reduce<MilestonePersonalBest | null>((a, b) => (!a || b.time < a.time ? b : a), null);
	const bestTime = best?.time ?? Infinity;
	return PB_2K_GATES.map(({ id, seconds }) => {
		const achieved = bestTime < seconds;
		const slowBaseline = seconds + 60; // 1 minute above threshold
		const denominator = slowBaseline - seconds; // always 60
		const progress = achieved
			? 1
			: Number.isFinite(bestTime) && denominator > 0
				? Math.max(0, Math.min(1, (slowBaseline - bestTime) / denominator))
				: 0;
		return {
			id,
			labelKey: `milestone.${id}`,
			achieved,
			achievedAt: achieved && best ? best.date.slice(0, 10) : undefined,
			progress,
			currentValue: Number.isFinite(bestTime) ? bestTime : 0,
			threshold: seconds
		};
	});
}

/**
 * Compute the full milestone list from dashboard data (no network).
 */
export interface MilestoneComputeOptions {
	homeTz?: string;
	/** Calendar end for active-streak progress (`YYYY-MM-DD`). Defaults to today in home tz. */
	endDay?: string;
}

export function computeMilestones(
	workouts: Workout[],
	personalBests: MilestonePersonalBest[],
	options?: MilestoneComputeOptions
): Milestone[] {
	const homeTz = options?.homeTz;
	return [
		...lifetimeDistanceMilestones(workouts, homeTz),
		...sessionCountMilestones(workouts, homeTz),
		...streakMilestones(workouts, homeTz, options?.endDay),
		...pb2kMilestones(personalBests)
	];
}

/** Milestones newly achieved between two snapshots (for live-mode toasts). */
export function newlyAchievedMilestones(before: Milestone[], after: Milestone[]): Milestone[] {
	const prev = new Map(before.map((m) => [m.id, m.achieved]));
	return after.filter((m) => m.achieved && !prev.get(m.id));
}

/**
 * Unachieved milestones closest to completion (highest progress first).
 */
export function nextMilestones(all: Milestone[], limit: number): Milestone[] {
	return all
		.filter((m) => !m.achieved)
		.sort((a, b) => b.progress - a.progress || a.threshold - b.threshold)
		.slice(0, limit);
}

/** Whether the dashboard panel should render. */
export function showMilestonesPanel(workouts: Workout[], milestones: Milestone[]): boolean {
	if (workouts.length >= 3) return true;
	return milestones.some((m) => m.achieved);
}
