<script lang="ts">
	import { onMount } from 'svelte';
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import MetricGauge from '$components/MetricGauge.svelte';
	import { ReplayEngine, sampleAt, type Frame } from '$lib/replay/engine';
	import { CourseRenderer } from '$lib/replay/renderer';
	import { themeFor } from '$lib/replay/sports';
	import { fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import type { WorkoutDetail } from '$lib/types';

	let { data } = $props();
	const detail: WorkoutDetail = data.detail;
	const theme = themeFor(detail.sport);
	const total = detail.distance;
	const strokes = detail.strokes;

	let frame = $state<Frame>(sampleAt(strokes, 0));
	let playing = $state(false);
	let speed = $state(1);

	let engine = $state<ReplayEngine | null>(null);
	let renderer: CourseRenderer | null = null;
	let canvasEl: HTMLCanvasElement;
	let courseWrap: HTMLDivElement;

	const SPEEDS = [0.5, 1, 2, 4, 8];

	function renderCurrent() {
		renderer?.render({ frame, distFrac: total ? frame.d / total : 0, totalDistance: total }, playing);
	}

	onMount(() => {
		renderer = new CourseRenderer(canvasEl, theme);

		engine = new ReplayEngine(strokes, (f, p) => {
			frame = f;
			playing = p;
			renderer?.render({ frame: f, distFrac: total ? f.d / total : 0, totalDistance: total }, p);
		});

		const sizeIt = () => {
			const w = courseWrap.clientWidth;
			renderer?.resize(w, 150);
			renderCurrent();
		};
		sizeIt();
		const ro = new ResizeObserver(sizeIt);
		ro.observe(courseWrap);

		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				e.preventDefault();
				engine?.toggle();
			}
		};
		window.addEventListener('keydown', onKey);

		return () => {
			ro.disconnect();
			window.removeEventListener('keydown', onKey);
			engine?.destroy();
		};
	});

	function setSpeed(s: number) {
		speed = s;
		engine?.setSpeed(s);
	}

	function onScrub(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		engine?.seek(v);
	}

	// ---- Telemetry charts (static; the moving marker tracks playback) ----
	const xs = strokes.map((s) => s.t);
	const hasHr = strokes.some((s) => s.hr != null);

	function metricOpts(
		label: string,
		color: string,
		invert: boolean,
		fmt: (v: number) => string
	): Omit<uPlot.Options, 'width' | 'height'> {
		return {
			scales: { x: { time: false }, y: invert ? { dir: -1 } : {} },
			cursor: { show: true, x: true, y: false },
			axes: [
				{
					stroke: '#8b949e',
					grid: { stroke: '#1c2230' },
					values: (_u, sp) => sp.map((v) => fmtTime(v))
				},
				{
					stroke: '#8b949e',
					grid: { stroke: '#1c2230' },
					size: 52,
					values: (_u, sp) => sp.map(fmt)
				}
			],
			series: [{}, { label, stroke: color, width: 1.5, fill: color + '22' }],
			legend: { show: false }
		};
	}

	const paceData: uPlot.AlignedData = [xs, strokes.map((s) => s.pace)];
	const rateData: uPlot.AlignedData = [xs, strokes.map((s) => s.spm)];
	const powerData: uPlot.AlignedData = [xs, strokes.map((s) => s.watts)];
	const hrData: uPlot.AlignedData = [xs, strokes.map((s) => s.hr ?? null)];

	const paceOpts = metricOpts('pace', theme.color, true, (v) => fmtPace(v).replace('/500m', ''));
	const rateOpts = metricOpts('rate', '#3fb950', false, (v) => `${Math.round(v)}`);
	const powerOpts = metricOpts('power', '#d2a8ff', false, (v) => `${Math.round(v)}w`);
	const hrOpts = metricOpts('hr', '#f778ba', false, (v) => `${Math.round(v)}`);

	// Gauge ranges derived from the data so arcs are meaningful.
	const paceRange = (() => {
		const ps = strokes.map((s) => s.pace).filter((p) => p > 0);
		return { min: Math.min(...ps) - 5, max: Math.max(...ps) + 5 };
	})();
	const wattRange = { min: 0, max: Math.max(...strokes.map((s) => s.watts)) * 1.1 };
</script>

<svelte:head><title>Replay · {detail.workoutType || SPORT_LABEL[detail.sport]} · rowplay</title></svelte:head>

<div class="container">
	<a href="/dashboard" class="back muted">← Back to dashboard</a>
	<div class="head">
		<h1>{theme.icon} {detail.workoutType || SPORT_LABEL[detail.sport]}</h1>
		<div class="summary mono muted">
			{fmtDistance(detail.distance)} · {fmtTime(detail.time, true)} · {fmtPace(detail.pace)}
			{#if !detail.hasStrokeData}<span class="tag">low-res replay</span>{/if}
		</div>
	</div>

	<!-- Course -->
	<div class="card course" bind:this={courseWrap}>
		<canvas bind:this={canvasEl}></canvas>
	</div>

	<!-- Transport controls -->
	<div class="card controls">
		<button class="btn play" onclick={() => engine?.toggle()}>
			{playing ? '⏸ Pause' : '▶ Play'}
		</button>
		<div class="clock mono">
			{fmtTime(frame.t, true)} <span class="muted">/ {fmtTime(detail.time)}</span>
		</div>
		<input
			class="scrub"
			type="range"
			min="0"
			max={engine?.duration ?? detail.time}
			step="0.1"
			value={frame.t}
			oninput={onScrub}
		/>
		<div class="dist mono">{fmtDistance(frame.d)}</div>
		<div class="speeds">
			{#each SPEEDS as s}
				<button class="sbtn" class:on={speed === s} onclick={() => setSpeed(s)}>{s}×</button>
			{/each}
		</div>
	</div>

	<!-- Live gauges -->
	<div class="gauges card">
		<MetricGauge
			label="Pace"
			unit="/500m"
			display={fmtPace(frame.pace).replace('/500m', '')}
			value={frame.pace}
			min={paceRange.max}
			max={paceRange.min}
			color={theme.color}
		/>
		<MetricGauge
			label="Rate"
			unit={theme.cadenceUnit}
			display={`${Math.round(frame.spm)}`}
			value={frame.spm}
			min={0}
			max={60}
			color="#3fb950"
		/>
		<MetricGauge
			label="Power"
			unit="watts"
			display={`${Math.round(frame.watts)}`}
			value={frame.watts}
			min={wattRange.min}
			max={wattRange.max}
			color="#d2a8ff"
		/>
		{#if hasHr}
			<MetricGauge
				label="Heart"
				unit="bpm"
				display={frame.hr != null ? `${Math.round(frame.hr)}` : '--'}
				value={frame.hr ?? 0}
				min={90}
				max={200}
				color="#f778ba"
			/>
		{/if}
	</div>

	<!-- Telemetry traces -->
	<div class="charts">
		<div class="card">
			<div class="ctitle muted">Pace</div>
			<UPlotChart data={paceData} options={paceOpts} height={150} marker={frame.t} />
		</div>
		<div class="card">
			<div class="ctitle muted">Stroke rate</div>
			<UPlotChart data={rateData} options={rateOpts} height={150} marker={frame.t} />
		</div>
		<div class="card">
			<div class="ctitle muted">Power</div>
			<UPlotChart data={powerData} options={powerOpts} height={150} marker={frame.t} />
		</div>
		{#if hasHr}
			<div class="card">
				<div class="ctitle muted">Heart rate</div>
				<UPlotChart data={hrData} options={hrOpts} height={150} marker={frame.t} />
			</div>
		{/if}
	</div>

	<!-- Splits -->
	{#if detail.splits.length}
		<div class="card splits">
			<h3>Splits</h3>
			<table class="mono">
				<thead>
					<tr><th>#</th><th>Dist</th><th>Time</th><th>Pace</th><th>Rate</th><th>HR</th></tr>
				</thead>
				<tbody>
					{#each detail.splits as sp}
						<tr>
							<td>{sp.index + 1}</td>
							<td>{fmtDistance(sp.distance)}</td>
							<td>{fmtTime(sp.time, true)}</td>
							<td>{fmtPace(sp.pace)}</td>
							<td>{sp.spm ?? '–'}</td>
							<td>{sp.hr ? Math.round(sp.hr) : '–'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.back {
		display: inline-block;
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.head h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	.summary {
		font-size: 0.95rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.course {
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.course canvas {
		display: block;
		width: 100%;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.play {
		min-width: 110px;
	}
	.clock {
		font-size: 1.1rem;
		font-weight: 700;
		min-width: 130px;
	}
	.scrub {
		flex: 1;
		min-width: 160px;
		accent-color: var(--accent);
	}
	.dist {
		min-width: 90px;
		text-align: right;
		color: var(--text-dim);
	}
	.speeds {
		display: flex;
		gap: 0.3rem;
	}
	.sbtn {
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		border-radius: 6px;
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
		cursor: pointer;
		font-family: var(--mono);
	}
	.sbtn.on {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	.gauges {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.charts {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.ctitle {
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.splits table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.splits th {
		text-align: left;
		color: var(--text-dim);
		font-weight: 600;
		padding: 0.3rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.splits td {
		padding: 0.3rem 0.5rem;
		border-bottom: 1px solid var(--bg-elev-2);
	}
	@media (max-width: 760px) {
		.gauges {
			grid-template-columns: repeat(2, 1fr);
		}
		.charts {
			grid-template-columns: 1fr;
		}
	}
</style>
