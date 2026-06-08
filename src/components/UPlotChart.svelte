<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	interface Props {
		data: uPlot.AlignedData;
		options: Omit<uPlot.Options, 'width' | 'height'>;
		height?: number;
		/** Optional x position (in data units) to draw a vertical cursor line. */
		marker?: number | null;
		/**
		 * Accessible name for the chart. uPlot paints to <canvas>, which is opaque
		 * to assistive tech, so this becomes the chart's `aria-label`. Required so
		 * a chart can't ship without a text alternative.
		 */
		caption: string;
		/** Optional longer text alternative read out after the caption. */
		description?: string;
	}

	let { data, options, height = 220, marker = null, caption, description }: Props = $props();

	const uid = $props.id();
	const descId = `${uid}-desc`;

	let el: HTMLDivElement;
	let plot = $state.raw<uPlot | null>(null);
	let UPlotCtor: typeof uPlot | null = null;
	// Flipped once the host element is measured, so the build effect only fires
	// after the constructor and container are both ready.
	let ready = $state(false);
	let width = 600;
	let ro: ResizeObserver | null = null;

	function build() {
		if (!UPlotCtor || !el) return;
		untrack(() => plot)?.destroy();
		const hooks = options.hooks ?? {};
		// Resolve the cursor colour once outside the draw hook to avoid repeated
		// forced synchronous layouts (getComputedStyle thrashing).
		const markerColor =
			typeof document !== 'undefined'
				? getComputedStyle(document.documentElement).getPropertyValue('--ink-3').trim() || '#7a7062'
				: '#7a7062';
		const drawHook = (u: uPlot) => {
			// Read `marker` untracked. uPlot draws synchronously during construction,
			// so this hook runs inside the build `$effect`; a tracked read would make
			// the rebuild effect depend on `marker` and tear down/recreate the whole
			// chart on every animation frame of a replay. Marker moves are handled
			// cheaply by the dedicated redraw effect below instead.
			const m = untrack(() => marker);
			if (m == null) return;
			const cx = u.valToPos(m, 'x', true);
			if (!isFinite(cx)) return;
			const ctx = u.ctx;
			ctx.save();
			ctx.strokeStyle = markerColor;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(cx, u.bbox.top);
			ctx.lineTo(cx, u.bbox.top + u.bbox.height);
			ctx.stroke();
			ctx.restore();
		};
		// Read `data` untracked: this build path is driven by `options`/`height`
		// changes (theme, metric, labels). Plain data updates are far cheaper via
		// `setData` in the effect below, so they must not trigger a full rebuild.
		plot = new UPlotCtor(
			{
				...options,
				width,
				height,
				hooks: { ...hooks, draw: [...(hooks.draw ?? []), drawHook] }
			},
			untrack(() => data),
			el
		);
	}

	onMount(() => {
		UPlotCtor = uPlot;
		width = el.clientWidth || 600;
		ro = new ResizeObserver(() => {
			const w = el.clientWidth;
			if (w && plot) {
				width = w;
				plot.setSize({ width: w, height });
			}
		});
		ro.observe(el);
		ready = true;
	});

	onDestroy(() => {
		ro?.disconnect();
		plot?.destroy();
	});

	// Single build path. Rebuilds when the options object or height changes
	// (theme toggle, metric switch, new labels). `ready` gates the first run so
	// there is no duplicate build on mount.
	$effect(() => {
		options;
		height;
		if (ready) build();
	});

	// Data updates are cheap — uPlot diffs internally; no teardown needed.
	// Also re-fires after each build because plot is $state.raw, ensuring
	// the latest derived data is applied even if untrack() read stale data.
	$effect(() => {
		if (plot) plot.setData(data);
	});

	// The marker just needs a redraw (the draw hook reads the latest value).
	$effect(() => {
		marker;
		if (plot) plot.redraw();
	});
</script>

<div
	class="uplot-host"
	bind:this={el}
	role="img"
	aria-label={caption}
	aria-describedby={description ? descId : undefined}
></div>
{#if description}
	<p id={descId} class="sr-only">{description}</p>
{/if}

<style>
	.uplot-host {
		width: 100%;
		contain: layout paint;
	}

	/* Visually hidden but exposed to assistive tech. */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
