import type { Sport } from '../types';

export interface SportTheme {
	label: string;
	/** Word for the per-minute cadence metric. */
	cadenceUnit: string;
}

export const SPORT_THEME: Record<Sport, SportTheme> = {
	rower: {
		label: 'RowErg',
		cadenceUnit: 'spm'
	},
	skierg: {
		label: 'SkiErg',
		cadenceUnit: 'spm'
	},
	bike: {
		label: 'BikeErg',
		cadenceUnit: 'rpm'
	}
};

export function themeFor(sport: Sport): SportTheme {
	return SPORT_THEME[sport];
}

/** CSS color for machine icons and accents (DOM contexts that resolve var()). */
export const MACHINE_COLOR: Record<Sport, string> = {
	rower: 'var(--m-rower)',
	skierg: 'var(--m-skierg)',
	bike: 'var(--m-bike)'
};

/**
 * Machine accent as a concrete hex per theme — the <canvas> mirror of
 * `--m-rower/-skierg/-bike` in app.css, for canvas contexts (the race-card
 * PNG export) that can't resolve CSS custom properties. MUST stay in sync with
 * app.css: `renderer.test.ts` parses both and fails if the mirror drifts.
 */
export const MACHINE_HEX: Record<'light' | 'dark', Record<Sport, string>> = {
	light: { rower: '#2b5468', skierg: '#3c7a6e', bike: '#a65d2e' },
	dark: { rower: '#5a8aaa', skierg: '#5aaa9a', bike: '#d09060' }
};
