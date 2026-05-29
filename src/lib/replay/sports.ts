import type { Sport } from '../types';

export interface SportTheme {
	label: string;
	/** Course accent colour. */
	color: string;
	/** Background gradient for the course strip. */
	courseTop: string;
	courseBottom: string;
	/** Word for the per-minute cadence metric. */
	cadenceUnit: string;
}

export const SPORT_THEME: Record<Sport, SportTheme> = {
	rower: {
		label: 'RowErg',
		color: '#2f81f7',
		courseTop: '#0b2a4a',
		courseBottom: '#08406b',
		cadenceUnit: 'spm'
	},
	skierg: {
		label: 'SkiErg',
		color: '#56d4ff',
		courseTop: '#1b2a3a',
		courseBottom: '#2a4a66',
		cadenceUnit: 'spm'
	},
	bike: {
		label: 'BikeErg',
		color: '#3fb950',
		courseTop: '#13301a',
		courseBottom: '#1c4a26',
		cadenceUnit: 'rpm'
	}
};

export function themeFor(sport: Sport): SportTheme {
	return SPORT_THEME[sport];
}
