import { describe, expect, it } from 'vitest';
import { baseOptions, chartTheme, withAlpha, type ChartTheme } from './chartTheme';

describe('withAlpha', () => {
	it('converts 6-digit hex to rgba', () => {
		expect(withAlpha('#dc4327', 0.5)).toBe('rgba(220, 67, 39, 0.5)');
	});

	it('expands 3-digit hex before converting', () => {
		expect(withAlpha('#abc', 1)).toBe('rgba(170, 187, 204, 1)');
	});

	it('drops the alpha nibble of an 8-digit hex and applies the requested alpha', () => {
		expect(withAlpha('#dc4327ff', 0.2)).toBe('rgba(220, 67, 39, 0.2)');
	});

	it('re-wraps an rgb()/rgba() colour with the new alpha', () => {
		expect(withAlpha('rgb(10, 20, 30)', 0.4)).toBe('rgba(10, 20, 30, 0.4)');
		expect(withAlpha('rgba(10, 20, 30, 0.9)', 0.1)).toBe('rgba(10, 20, 30, 0.1)');
	});

	it('clamps alpha into [0, 1]', () => {
		expect(withAlpha('#000000', 5)).toBe('rgba(0, 0, 0, 1)');
		expect(withAlpha('#000000', -2)).toBe('rgba(0, 0, 0, 0)');
	});

	it('returns unrecognised colour strings untouched', () => {
		expect(withAlpha('rebeccapurple', 0.5)).toBe('rebeccapurple');
	});
});

describe('chartTheme (no DOM)', () => {
	it('falls back to the light palette and exposes every role', () => {
		const theme = chartTheme('dark');
		expect(theme.axis).toBe('#6a6052');
		expect(theme.grid).toBe('#c9bfa9');
		expect(theme.role.pace).toBe('#dc4327');
		// Every role key is resolvable (no undefined leaking into uPlot).
		for (const color of Object.values(theme.role)) {
			expect(color).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});
});

// A deterministic palette so baseOptions assertions don't depend on the DOM.
const theme: ChartTheme = {
	axis: '#axis0',
	grid: '#grid0',
	cursor: '#curs0',
	role: {
		pace: '#pace0',
		rate: '#rate0',
		power: '#powr0',
		hr: '#hr0000',
		dps: '#dps000',
		live: '#live00',
		ghost: '#ghost0',
		ahead: '#ahead0',
		behind: '#behnd0',
		fit: '#fit000'
	}
};

describe('baseOptions', () => {
	it('builds a single themed y-axis and resolves series colours by role', () => {
		const o = baseOptions({
			theme,
			series: [{ label: 'Pace', role: 'pace' }]
		});
		expect(o.scales).toEqual({ x: { time: false }, y: {} });
		// uPlot needs a leading x placeholder series.
		expect(o.series[0]).toEqual({});
		expect(o.series[1]).toMatchObject({ label: 'Pace', scale: 'y', stroke: '#pace0', width: 2 });
		expect(o.axes?.[0]).toMatchObject({ stroke: '#axis0', grid: { stroke: '#grid0' } });
		expect(o.legend).toEqual({ show: false });
		// No cursor key unless asked.
		expect(o.cursor).toBeUndefined();
	});

	it('inverts a scale when requested', () => {
		const o = baseOptions({ theme, yAxes: [{ invert: true }], series: [{ label: 'P', role: 'pace' }] });
		expect(o.scales?.y).toEqual({ dir: -1 });
	});

	it('applies area fill with the default alpha for fill:true and a custom alpha otherwise', () => {
		const dflt = baseOptions({ theme, series: [{ label: 'P', role: 'rate', fill: true }] });
		expect(dflt.series[1].fill).toBe(withAlpha('#rate0', 0.13));
		const custom = baseOptions({ theme, series: [{ label: 'P', role: 'rate', fill: 0.5 }] });
		expect(custom.series[1].fill).toBe(withAlpha('#rate0', 0.5));
		const none = baseOptions({ theme, series: [{ label: 'P', role: 'rate' }] });
		expect(none.series[1].fill).toBeUndefined();
	});

	it('shows sized point markers or hides them', () => {
		const pts = baseOptions({ theme, series: [{ label: 'P', role: 'dps', points: 7 }] });
		expect(pts.series[1].points).toEqual({ show: true, size: 7, stroke: '#dps000', fill: '#dps000' });
		const off = baseOptions({ theme, series: [{ label: 'P', role: 'dps' }] });
		expect(off.series[1].points).toEqual({ show: false });
	});

	it('supports multiple y-axes with distinct scales, sides and hidden grids', () => {
		const o = baseOptions({
			theme,
			time: true,
			yAxes: [
				{ scale: 'y', size: 40 },
				{ scale: 'tsb', side: 1, size: 40, grid: false }
			],
			series: [
				{ label: 'Fitness', role: 'dps', scale: 'y' },
				{ label: 'Form', role: 'ahead', scale: 'tsb' }
			]
		});
		expect(o.scales).toMatchObject({ x: { time: true }, y: {}, tsb: {} });
		expect(o.axes).toHaveLength(3); // x + 2 y axes
		expect(o.axes?.[2]).toMatchObject({ scale: 'tsb', side: 1, grid: { show: false } });
		expect(o.series[2]).toMatchObject({ scale: 'tsb', stroke: '#ahead0' });
	});

	it('wires axis tick formatters through to uPlot values functions', () => {
		const o = baseOptions({
			theme,
			xFmt: (v) => `x${v}`,
			yAxes: [{ fmt: (v) => `y${v}` }],
			series: [{ label: 'P', role: 'pace' }]
		});
		const xValues = o.axes?.[0].values as (u: unknown, sp: number[]) => unknown[];
		const yValues = o.axes?.[1].values as (u: unknown, sp: number[]) => unknown[];
		expect(xValues(null, [1, 2])).toEqual(['x1', 'x2']);
		expect(yValues(null, [3, 4])).toEqual(['y3', 'y4']);
	});

	it('maps the cursor config and toggles the legend', () => {
		expect(baseOptions({ theme, series: [{ label: 'P', role: 'pace' }], legend: true }).legend).toEqual({
			show: true
		});
		expect(
			baseOptions({ theme, series: [{ label: 'P', role: 'pace' }], cursor: { x: true, y: true } }).cursor
		).toEqual({ show: true, x: true, y: true });
		expect(
			baseOptions({ theme, series: [{ label: 'P', role: 'pace' }], cursor: false }).cursor
		).toEqual({ show: false });
	});
});
