import type { Sport } from '../types';

export interface SportTheme {
	label: string;
	/** Machine accent (bibs, icons). */
	color: string;
	/** Course panel fill. */
	courseFill: string;
	/** Word for the per-minute cadence metric. */
	cadenceUnit: string;
}

export const SPORT_THEME: Record<Sport, SportTheme> = {
	rower: {
		label: 'RowErg',
		color: '#2b5468',
		courseFill: '#efe8da',
		cadenceUnit: 'spm'
	},
	skierg: {
		label: 'SkiErg',
		color: '#3c7a6e',
		courseFill: '#efe8da',
		cadenceUnit: 'spm'
	},
	bike: {
		label: 'BikeErg',
		color: '#a65d2e',
		courseFill: '#efe8da',
		cadenceUnit: 'rpm'
	}
};

/** Vermilion = live athlete; lake = ghost comparison. */
export const LIVE_COLOR = '#dc4327';
export const GHOST_COLOR = '#1e4e6b';

export function themeFor(sport: Sport): SportTheme {
	return SPORT_THEME[sport];
}

/** CSS color for machine icons and accents. */
export const MACHINE_COLOR: Record<Sport, string> = {
	rower: 'var(--m-rower)',
	skierg: 'var(--m-skierg)',
	bike: 'var(--m-bike)'
};
