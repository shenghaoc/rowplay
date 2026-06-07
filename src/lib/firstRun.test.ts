import { describe, expect, it } from 'vitest';
import {
	DASHBOARD_HINT_IDS,
	dashboardHintKey,
	dismissDashboardHint,
	dismissFirstRunSurface,
	firstRunEligible,
	firstRunSurfaceKey,
	isDashboardHintDismissed,
	isFirstRunSurfaceDismissed,
	resetFirstRunSurface,
	visibleDashboardHints
} from './firstRun';

function memoryStorage(seed: Record<string, string> = {}) {
	const store = new Map(Object.entries(seed));
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		store
	};
}

describe('firstRun', () => {
	it('is only eligible for unauthenticated demo mode', () => {
		expect(firstRunEligible(true, null)).toBe(true);
		expect(firstRunEligible(true, undefined)).toBe(true);
		expect(firstRunEligible(true, { id: 7 })).toBe(false);
		expect(firstRunEligible(false, null)).toBe(false);
	});

	it('persists and clears surface dismissal state', () => {
		const storage = memoryStorage();

		expect(isFirstRunSurfaceDismissed('landing', storage)).toBe(false);
		dismissFirstRunSurface('landing', storage);
		expect(storage.store.get(firstRunSurfaceKey('landing'))).toBe('1');
		expect(isFirstRunSurfaceDismissed('landing', storage)).toBe(true);

		resetFirstRunSurface('landing', storage);
		expect(isFirstRunSurfaceDismissed('landing', storage)).toBe(false);
	});

	it('filters dismissed dashboard hints', () => {
		const storage = memoryStorage();

		expect(visibleDashboardHints(storage)).toEqual([...DASHBOARD_HINT_IDS]);
		dismissDashboardHint('criticalPower', storage);

		expect(storage.store.get(dashboardHintKey('criticalPower'))).toBe('1');
		expect(isDashboardHintDismissed('criticalPower', storage)).toBe(true);
		expect(visibleDashboardHints(storage)).toEqual([
			'latestReplay',
			'workoutFilters',
			'leaderboardGhost'
		]);
	});

	it('hides every dashboard hint when the dashboard surface is dismissed', () => {
		const storage = memoryStorage();

		dismissDashboardHint('latestReplay', storage);
		dismissFirstRunSurface('dashboard', storage);

		expect(visibleDashboardHints(storage)).toEqual([]);
	});
});
