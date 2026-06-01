import type uPlot from 'uplot';
import type { ThemeName } from '$lib/theme.svelte';

/**
 * Charting contract for rowplay.
 *
 * uPlot paints to <canvas>, where `ctx.strokeStyle` cannot resolve `var(--x)`,
 * so every colour handed to it must be a concrete value. The old approach
 * duplicated the palette as JS hex constants, which silently drifted from
 * `app.css` in dark mode (the constants held the *light* values). Instead we
 * read the **live computed values** of the design tokens: `app.css` is the
 * single source of truth, and light/dark plus any future palette edit flow
 * through automatically.
 */

/** Semantic roles a series can take, each backed by a CSS custom property. */
export type SeriesRole =
	| 'pace'
	| 'rate'
	| 'power'
	| 'hr'
	| 'dps'
	| 'live'
	| 'ghost'
	| 'ahead'
	| 'behind'
	| 'fit';

const ROLE_VAR: Record<SeriesRole, string> = {
	pace: '--pace',
	rate: '--rate',
	power: '--power',
	hr: '--hr',
	dps: '--dps',
	live: '--live',
	ghost: '--ghost',
	ahead: '--ahead',
	behind: '--behind',
	fit: '--ink-3'
};

type ChromeKey = 'axis' | 'grid' | 'cursor';

const CHROME_VAR: Record<ChromeKey, string> = {
	axis: '--ink-2',
	grid: '--hairline',
	cursor: '--ink-3'
};

// Light-theme fallbacks, used only when there is no DOM (SSR / unit tests).
// The chart is never painted in those contexts — the canvas only mounts on the
// client — so these values are never actually drawn. They exist solely to keep
// option-building total when `getComputedStyle` is unavailable.
const FALLBACK: Record<SeriesRole | ChromeKey, string> = {
	axis: '#6a6052',
	grid: '#c9bfa9',
	cursor: '#9a8f79',
	pace: '#dc4327',
	rate: '#2c6e63',
	power: '#9e5b2d',
	hr: '#8e4a6b',
	dps: '#3f6e8c',
	live: '#dc4327',
	ghost: '#1e4e6b',
	ahead: '#5e6b2c',
	behind: '#c2851a',
	fit: '#9a8f79'
};

export interface ChartTheme {
	/** Axis tick + label colour. */
	axis: string;
	/** Grid line colour. */
	grid: string;
	/** Cursor / cross-hair colour. */
	cursor: string;
	/** Resolved concrete colour per series role. */
	role: Record<SeriesRole, string>;
}

/**
 * Resolve the chart palette from the live design tokens.
 *
 * `_theme` is unused in the body — callers pass `uiTheme.value` inside a
 * `$derived` purely so the palette recomputes when the user toggles light/dark.
 * The actual colours come from `getComputedStyle`, which already reflects the
 * freshly-set `data-theme` attribute (the theme setter writes it synchronously
 * before any reactive recompute runs).
 */
export function chartTheme(_theme: ThemeName = 'light'): ChartTheme {
	const cs =
		typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
	const read = (cssVar: string, key: SeriesRole | ChromeKey): string =>
		cs?.getPropertyValue(cssVar).trim() || FALLBACK[key];

	const role = {} as Record<SeriesRole, string>;
	for (const r of Object.keys(ROLE_VAR) as SeriesRole[]) role[r] = read(ROLE_VAR[r], r);

	return {
		axis: read(CHROME_VAR.axis, 'axis'),
		grid: read(CHROME_VAR.grid, 'grid'),
		cursor: read(CHROME_VAR.cursor, 'cursor'),
		role
	};
}

/**
 * Apply an alpha channel to a hex or rgb() colour for area fills. Replaces the
 * old `color + '22'` trick, which only worked for 6-digit hex and silently
 * produced garbage for `#rgb` or `rgb(...)` inputs.
 */
export function withAlpha(color: string, alpha: number): string {
	const a = Math.max(0, Math.min(1, alpha));
	const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
	if (hex) {
		let h = hex[1];
		if (h.length === 3 || h.length === 4) {
			h = h
				.split('')
				.map((c) => c + c)
				.join('');
		}
		const r = parseInt(h.slice(0, 2), 16);
		const g = parseInt(h.slice(2, 4), 16);
		const b = parseInt(h.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${a})`;
	}
	const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
	if (rgb) {
		const [r, g, b] = rgb[1].split(',').map((p) => p.trim());
		return `rgba(${r}, ${g}, ${b}, ${a})`;
	}
	return color;
}

/** Default area-fill opacity (≈ the old `'22'` hex alpha of 0.13). */
const DEFAULT_FILL_ALPHA = 0.13;
/** Default point-marker radius. */
const DEFAULT_POINT_SIZE = 5;

export interface AxisConfig {
	/** Scale id this axis binds to. Defaults to `'y'`. */
	scale?: string;
	/** Edge to draw on, using uPlot side codes (1 = right). Defaults to left. */
	side?: 0 | 1 | 2 | 3;
	/** Tick formatter. */
	fmt?: (v: number) => string;
	/** Axis gutter size in px. */
	size?: number;
	/** Draw grid lines for this axis. Defaults to `true`. */
	grid?: boolean;
	/** Plot this scale descending (e.g. pace, where lower is better). */
	invert?: boolean;
}

export interface SeriesConfig {
	label: string;
	role: SeriesRole;
	/** Line width in px. Defaults to 2. Use 0 for a points-only scatter. */
	width?: number;
	/** Dash pattern, e.g. `[6, 4]`. */
	dash?: number[];
	/** Scale id. Defaults to `'y'`. */
	scale?: string;
	/** Show point markers; pass a number to set the radius. Defaults to off. */
	points?: boolean | number;
	/** Area fill: `true` for the default opacity, or a 0–1 alpha. Defaults to none. */
	fill?: boolean | number;
}

export interface BaseOptionsConfig {
	/** Resolved palette, typically `chartTheme(uiTheme.value)`. */
	theme: ChartTheme;
	/** x is a time scale (epoch seconds). Defaults to `false`. */
	time?: boolean;
	/** x-axis tick formatter (ignored when `time` is set). */
	xFmt?: (v: number) => string;
	/** y axes; defaults to a single left axis on scale `'y'`. */
	yAxes?: AxisConfig[];
	series: SeriesConfig[];
	/** Show the built-in legend. Defaults to `false`. */
	legend?: boolean;
	/** Cursor cross-hair lines that follow the pointer. Defaults to uPlot's. */
	cursor?: { x?: boolean; y?: boolean } | false;
}

/**
 * Build a themed uPlot options object from a declarative spec. This collapses
 * the near-identical `axes` / `scales` / `series` scaffolding that used to be
 * copy-pasted across every chart site into one place, so a chart can never
 * again forget to read the theme (the bug that left the dashboard form chart
 * painted in stale dark-mode hex).
 */
export function baseOptions(cfg: BaseOptionsConfig): Omit<uPlot.Options, 'width' | 'height'> {
	const { theme } = cfg;
	const yAxes = cfg.yAxes && cfg.yAxes.length > 0 ? cfg.yAxes : [{}];

	const scales: uPlot.Scales = { x: { time: cfg.time ?? false } };
	for (const ax of yAxes) scales[ax.scale ?? 'y'] = ax.invert ? { dir: -1 } : {};

	const xAxis: uPlot.Axis = { stroke: theme.axis, grid: { stroke: theme.grid } };
	if (cfg.xFmt) xAxis.values = (_u, splits) => splits.map(cfg.xFmt!);
	const axes: uPlot.Axis[] = [xAxis];
	for (const ax of yAxes) {
		const a: uPlot.Axis = {
			scale: ax.scale ?? 'y',
			stroke: theme.axis,
			grid: ax.grid === false ? { show: false } : { stroke: theme.grid }
		};
		if (ax.side != null) a.side = ax.side;
		if (ax.size != null) a.size = ax.size;
		if (ax.fmt) a.values = (_u, splits) => splits.map(ax.fmt!);
		axes.push(a);
	}

	const series: uPlot.Series[] = [{}];
	for (const s of cfg.series) {
		const color = theme.role[s.role];
		const ser: uPlot.Series = {
			label: s.label,
			scale: s.scale ?? 'y',
			stroke: color,
			width: s.width ?? 2
		};
		if (s.dash) ser.dash = s.dash;
		if (s.fill) ser.fill = withAlpha(color, s.fill === true ? DEFAULT_FILL_ALPHA : s.fill);
		ser.points = s.points
			? { show: true, size: typeof s.points === 'number' ? s.points : DEFAULT_POINT_SIZE, stroke: color, fill: color }
			: { show: false };
		series.push(ser);
	}

	const opts: Omit<uPlot.Options, 'width' | 'height'> = {
		scales,
		axes,
		series,
		legend: { show: cfg.legend ?? false }
	};
	if (cfg.cursor !== undefined) {
		opts.cursor =
			cfg.cursor === false
				? { show: false }
				: { show: true, x: cfg.cursor.x ?? true, y: cfg.cursor.y ?? false };
	}
	return opts;
}
