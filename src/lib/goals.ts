import type { AnnualGoal, AnnualGoalKind } from './analytics';

export const GOALS_COOKIE = 'annual_goal';
export const DEFAULT_ANNUAL_METERS = 1_000_000;

/** Default annual goal for demo mode and first-time users. */
export function defaultAnnualGoal(year: number): AnnualGoal {
	return { year, kind: 'meters', target: DEFAULT_ANNUAL_METERS };
}

export function parseGoalsCookie(raw: string | undefined): AnnualGoal | null {
	if (!raw) return null;
	try {
		const o = JSON.parse(raw) as { year?: number; kind?: string; target?: number };
		if (
			typeof o.year !== 'number' ||
			(o.kind !== 'meters' && o.kind !== 'hours') ||
			typeof o.target !== 'number' ||
			o.target <= 0
		) {
			return null;
		}
		return { year: o.year, kind: o.kind as AnnualGoalKind, target: o.target };
	} catch {
		return null;
	}
}

export function serializeGoalsCookie(goal: AnnualGoal): string {
	return JSON.stringify(goal);
}
