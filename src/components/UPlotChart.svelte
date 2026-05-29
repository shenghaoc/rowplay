<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	interface Props {
		data: uPlot.AlignedData;
		options: Omit<uPlot.Options, 'width' | 'height'>;
		height?: number;
		/** Optional x position (in data units) to draw a vertical cursor line. */
		marker?: number | null;
	}

	let { data, options, height = 220, marker = null }: Props = $props();

	let el: HTMLDivElement;
	let plot: uPlot | null = null;
	let UPlotCtor: typeof uPlot | null = null;
	let width = 600;
	let ro: ResizeObserver | null = null;

	function build() {
		if (!UPlotCtor) return;
		if (plot) plot.destroy();
		const hooks = options.hooks ?? {};
		const drawHook = (u: uPlot) => {
			if (marker == null) return;
			const cx = u.valToPos(marker, 'x', true);
			if (!isFinite(cx)) return;
			const ctx = u.ctx;
			ctx.save();
			ctx.strokeStyle = 'rgba(255,255,255,0.65)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(cx, u.bbox.top);
			ctx.lineTo(cx, u.bbox.top + u.bbox.height);
			ctx.stroke();
			ctx.restore();
		};
		plot = new UPlotCtor(
			{
				...options,
				width,
				height,
				hooks: { ...hooks, draw: [...(hooks.draw ?? []), drawHook] }
			},
			data,
			el
		);
	}

	onMount(async () => {
		const mod = await import('uplot');
		UPlotCtor = mod.default;
		width = el.clientWidth || 600;
		build();
		ro = new ResizeObserver(() => {
			const w = el.clientWidth;
			if (w && plot) {
				width = w;
				plot.setSize({ width: w, height });
			}
		});
		ro.observe(el);
	});

	onDestroy(() => {
		ro?.disconnect();
		plot?.destroy();
	});

	// React to data changes.
	$effect(() => {
		data;
		if (plot) plot.setData(data);
	});

	// React to marker changes (redraw to move the cursor line).
	$effect(() => {
		marker;
		if (plot) plot.redraw();
	});
</script>

<div class="uplot-host" bind:this={el}></div>

<style>
	.uplot-host {
		width: 100%;
	}
</style>
