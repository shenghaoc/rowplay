<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import {
		alignRepsForChart,
		repColor,
		type RepMetric,
		type RepSeries
	} from '$lib/repComparison';
	import { chartTheme, withAlpha } from '$lib/chartTheme';
	import { fmtPaceBare, fmtTime } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';

	interface Props {
		reps: RepSeries[];
		metric: RepMetric;
		/** Rep index to emphasise; null shows all series equally. */
		highlight: number | null;
	}

	let { reps, metric, highlight }: Props = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const uiTheme = getThemeContext();
	const chart = $derived(chartTheme(uiTheme.value));

	let el: HTMLDivElement;
	let plot: uPlot | null = null;
	let width = 600;
	let ro: ResizeObserver | null = null;

	const alignedData = $derived(alignRepsForChart(reps, metric));

	function yFmt(v: number): string {
		switch (metric) {
			case 'pace':
				return fmtPaceBare(v).replace(/\/500m$/, '');
			case 'rate':
				return `${Math.round(v)}`;
			case 'power':
				return `${Math.round(v)}`;
			case 'hr':
				return `${Math.round(v)}`;
		}
	}

	function buildOptions(): Omit<uPlot.Options, 'width' | 'height'> {
		const invertY = metric === 'pace';
		const series: uPlot.Series[] = [{}];
		for (let i = 0; i < reps.length; i++) {
			const color = repColor(i);
			const dim = highlight != null && highlight !== i;
			const stroke = dim ? withAlpha(color, 0.25) : color;
			series.push({
				label: `rep-${i + 1}`,
				scale: 'y',
				stroke,
				width: highlight === i ? 3 : dim ? 1 : 2,
				spanGaps: false,
				points: { show: false }
			});
		}

		return {
			scales: {
				x: { time: false },
				y: invertY ? { dir: -1 } : {}
			},
			axes: [
				{
					stroke: chart.axis,
					grid: { stroke: chart.grid },
					values: (_u, splits) => splits.map((v) => fmtTime(v, true))
				},
				{
					stroke: chart.axis,
					grid: { stroke: chart.grid },
					size: 52,
					values: (_u, splits) => splits.map(yFmt)
				}
			],
			series,
			legend: { show: false },
			cursor: { show: true, x: true, y: false }
		};
	}

	function build() {
		if (!el) return;
		plot?.destroy();
		plot = new uPlot({ ...buildOptions(), width, height: 220 }, alignedData, el);
	}

	onMount(() => {
		width = el.clientWidth || 600;
		ro = new ResizeObserver(() => {
			const w = el.clientWidth;
			if (w && plot) {
				width = w;
				plot.setSize({ width: w, height: 220 });
			}
		});
		ro.observe(el);
		build();
	});

	onDestroy(() => {
		ro?.disconnect();
		plot?.destroy();
	});

	$effect(() => {
		alignedData;
		highlight;
		if (plot) build();
	});
</script>

<div
	class="uplot-host"
	bind:this={el}
	role="img"
	aria-label={t('replay.repComparison')}
></div>

<style>
	.uplot-host {
		width: 100%;
		contain: layout paint;
	}
</style>
