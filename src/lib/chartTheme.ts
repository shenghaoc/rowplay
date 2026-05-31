import type { ThemeName } from '$lib/theme.svelte';

export interface UplotChrome {
	axis: string;
	grid: string;
	trend: string;
}

const LIGHT: UplotChrome = { axis: '#6a6052', grid: '#c9bfa9', trend: '#9a8f79' };
const DARK: UplotChrome = { axis: '#b5aa96', grid: '#3d3629', trend: '#7a7062' };

export function uplotChrome(theme: ThemeName = 'light'): UplotChrome {
	return theme === 'dark' ? DARK : LIGHT;
}
