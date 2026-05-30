import type { ThemeName } from '$lib/theme.svelte';

export interface UplotChrome {
	axis: string;
	grid: string;
	trend: string;
}

const LIGHT: UplotChrome = { axis: '#6a6052', grid: '#c9bfa9', trend: '#9a8f79' };
const DARK: UplotChrome = { axis: '#b5aa96', grid: '#3d3629', trend: '#7a7062' };

/** Axis/grid colours for uPlot, synced with CSS tokens and the active theme. */
export function uplotChrome(theme: ThemeName = 'light'): UplotChrome {
	const fb = theme === 'dark' ? DARK : LIGHT;
	if (typeof document === 'undefined') return fb;
	const s = getComputedStyle(document.documentElement);
	if (!s) return fb;
	const axis = s.getPropertyValue('--ink-2').trim();
	const grid = s.getPropertyValue('--hairline').trim();
	const trend = s.getPropertyValue('--ink-3').trim();
	return {
		axis: axis || fb.axis,
		grid: grid || fb.grid,
		trend: trend || fb.trend
	};
}
