<script lang="ts">
	import { onMount } from 'svelte';
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import MetricGauge from '$components/MetricGauge.svelte';
	import { ReplayEngine, sampleAt, type Frame } from '$lib/replay/engine';
	import { CourseRenderer, type RenderState } from '$lib/replay/renderer';
	import { themeFor } from '$lib/replay/sports';
	import {
		hrZones,
		powerCurve,
		techniqueSummary,
		efficiencyByRate,
		intervalBreakdown
	} from '$lib/analytics';
	import { fmtDate, fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import type { Stroke, Workout, WorkoutDetail } from '$lib/types';
	import { toast } from 'svelte-sonner';
	import { ArrowLeft, Play, Pause, Ghost } from '@lucide/svelte';
	import SportIcon from '$components/SportIcon.svelte';

	let { data } = $props();
	const detail: WorkoutDetail = data.detail;
	const candidates: Workout[] = data.candidates;
	const theme = themeFor(detail.sport);
	const total = detail.distance;
	const strokes = detail.strokes;

	let frame = $state<Frame>(sampleAt(strokes, 0));
	let playing = $state(false);
	let speed = $state(1);

	// Ghost (race a past session) state.
	let ghostId = $state<string>('');
	let ghostDetail = $state<WorkoutDetail | null>(null);
	let ghostStrokes: Stroke[] | null = null;
	let ghostFrame = $state<Frame | null>(null);
	let loadingGhost = $state(false);

	let engine = $state<ReplayEngine | null>(null);
	let renderer: CourseRenderer | null = null;
	let canvasEl: HTMLCanvasElement;
	let courseWrap: HTMLDivElement;

	const SPEEDS = [0.5, 1, 2, 4, 8];

	function buildState(f: Frame): RenderState {
		const g = ghostStrokes ? sampleAt(ghostStrokes, f.t) : null;
		ghostFrame = g;
		return {
			frame: f,
			distFrac: total ? f.d / total : 0,
			totalDistance: total,
			ghost: g ? { distFrac: total ? g.d / total : 0, pace: g.pace, spm: g.spm } : undefined
		};
	}

	function renderCurrent() {
		renderer?.render(buildState(frame), playing);
	}

	onMount(() => {
		renderer = new CourseRenderer(canvasEl, theme);
		engine = new ReplayEngine(strokes, (f, p) => {
			frame = f;
			playing = p;
			renderer?.render(buildState(f), p);
		});

		const sizeIt = () => {
			const w = courseWrap.clientWidth;
			renderer?.resize(w, ghostDetail ? 190 : 150);
			renderCurrent();
		};
		sizeIt();
		const ro = new ResizeObserver(sizeIt);
		ro.observe(courseWrap);

		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'Space' && !(e.target as HTMLElement)?.matches?.('select, input, button')) {
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
		engine?.seek(Number((e.target as HTMLInputElement).value));
	}

	async function selectGhost(e: Event) {
		const id = (e.target as HTMLSelectElement).value;
		ghostId = id;
		if (!id) {
			ghostStrokes = null;
			ghostDetail = null;
			ghostFrame = null;
			renderer?.resize(courseWrap.clientWidth, 150);
			renderCurrent();
			return;
		}
		loadingGhost = true;
		try {
			const res = await fetch(`/api/workouts/${id}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = (await res.json()) as WorkoutDetail;
			ghostDetail = d;
			ghostStrokes = d.strokes;
			renderer?.resize(courseWrap.clientWidth, 190);
			renderCurrent();
			toast.success(`Racing your ${fmtDate(d.date)} session`, {
				description: `${fmtDistance(d.distance)} · ${fmtPace(d.pace)}`
			});
		} catch (e) {
			ghostId = '';
			toast.error('Could not load that session', {
				description: e instanceof Error ? e.message : 'Please try again.'
			});
		} finally {
			loadingGhost = false;
		}
	}

	// Race gap (positive = player ahead of ghost), in metres and seconds.
	const gapMeters = $derived(ghostFrame ? frame.d - ghostFrame.d : 0);
	const gapSeconds = $derived.by(() => {
		if (!ghostFrame) return 0;
		const speedMs = frame.pace > 0 ? 500 / frame.pace : 0;
		return speedMs > 0 ? gapMeters / speedMs : 0;
	});

	// ---- Telemetry charts ----
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
				{ stroke: '#8b949e', grid: { stroke: '#1c2230' }, values: (_u, sp) => sp.map((v) => fmtTime(v)) },
				{ stroke: '#8b949e', grid: { stroke: '#1c2230' }, size: 52, values: (_u, sp) => sp.map(fmt) }
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

	// ---- Analysis ----
	const zones = hasHr ? hrZones(strokes) : [];
	const pc = powerCurve(strokes);
	const pcData: uPlot.AlignedData = [pc.map((p) => p.duration), pc.map((p) => p.watts)];
	const pcOpts = metricOpts('best avg power', '#d2a8ff', false, (v) => `${Math.round(v)}w`);

	// ---- Technique (stroke quality from logged pace/rate) ----
	const tech = techniqueSummary(strokes);
	const dpsData: uPlot.AlignedData = [tech.dps.map((d) => d.t), tech.dps.map((d) => d.v)];
	const dpsOpts = metricOpts('dist/stroke', '#56d4ff', false, (v) => `${v.toFixed(1)}m`);

	const eff = efficiencyByRate(strokes);
	// Scatter: pace (y, inverted) vs rate (x); a uPlot line over rate-sorted medians.
	const effData: uPlot.AlignedData = [eff.map((e) => e.spm), eff.map((e) => e.pace)];
	const effOpts: Omit<uPlot.Options, 'width' | 'height'> = {
		scales: { x: { time: false }, y: { dir: -1 } },
		cursor: { show: true },
		axes: [
			{ stroke: '#8b949e', grid: { stroke: '#1c2230' }, values: (_u, sp) => sp.map((v) => `${Math.round(v)}`) },
			{ stroke: '#8b949e', grid: { stroke: '#1c2230' }, size: 52, values: (_u, sp) => sp.map((v) => fmtPace(v).replace('/500m', '')) }
		],
		series: [{}, { label: 'pace@rate', stroke: '#56d4ff', width: 2, points: { show: true, size: 7 } }],
		legend: { show: false }
	};

	const paceRange = (() => {
		const ps = strokes.map((s) => s.pace).filter((p) => p > 0);
		return { min: Math.min(...ps) - 5, max: Math.max(...ps) + 5 };
	})();
	const wattRange = { min: 0, max: Math.max(...strokes.map((s) => s.watts)) * 1.1 };

	// ---- Interval / rep breakdown (null for single-segment pieces) ----
	const intervals = intervalBreakdown(detail.splits, strokes);
	// "Interval breakdown" (reps with rest) vs "Splits" (even splits of a
	// continuous piece) — same comparison, honest label.
	const segLabel = detail.isInterval ? 'Interval breakdown' : 'Split breakdown';
	const segUnit = detail.isInterval ? 'reps' : 'splits';
	// Bar widths for the per-rep pace comparison, scaled to the slowest rep.
	function repBarPct(pace: number): number {
		if (!intervals || intervals.slowest <= 0) return 0;
		return (pace / intervals.slowest) * 100;
	}
</script>

<svelte:head><title>Replay · {detail.workoutType || SPORT_LABEL[detail.sport]} · rowplay</title></svelte:head>

<div class="container">
	<a href="/dashboard" class="back muted"><ArrowLeft size={14} /> Back to dashboard</a>
	<div class="head">
		<h1><span class="h1icon"><SportIcon sport={detail.sport} size={22} /></span> {detail.workoutType || SPORT_LABEL[detail.sport]}</h1>
		<div class="summary mono muted">
			{fmtDistance(detail.distance)} · {fmtTime(detail.time, true)} · {fmtPace(detail.pace)}
			{#if !detail.hasStrokeData}<span class="tag">low-res replay</span>{/if}
		</div>
	</div>

	<!-- Ghost / race selector -->
	{#if candidates.length}
		<div class="card ghostbar">
			<label for="ghost"><Ghost size={15} /> Race a past {SPORT_LABEL[detail.sport]} session:</label>
			<select id="ghost" value={ghostId} onchange={selectGhost}>
				<option value="">None</option>
				{#each candidates as c}
					<option value={c.id}>
						{fmtDate(c.date)} · {fmtDistance(c.distance)} · {fmtPace(c.pace)}
					</option>
				{/each}
			</select>
			{#if loadingGhost}<span class="muted small">loading…</span>{/if}
			{#if ghostDetail && ghostFrame}
				<div class="gap mono" class:ahead={gapMeters >= 0} class:behind={gapMeters < 0}>
					{gapMeters >= 0 ? '▲ ahead' : '▼ behind'} by
					{Math.abs(Math.round(gapMeters))}m
					<span class="muted">({Math.abs(gapSeconds).toFixed(1)}s)</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Course -->
	<div class="card course" bind:this={courseWrap}>
		<canvas bind:this={canvasEl}></canvas>
	</div>

	<!-- Transport controls -->
	<div class="card controls">
		<button class="btn play" onclick={() => engine?.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
			{#if playing}<Pause size={16} /> Pause{:else}<Play size={16} /> Play{/if}
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
			aria-label="Seek"
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
			label="Pace" unit="/500m"
			display={fmtPace(frame.pace).replace('/500m', '')}
			value={frame.pace} min={paceRange.max} max={paceRange.min} color={theme.color}
		/>
		<MetricGauge
			label="Rate" unit={theme.cadenceUnit}
			display={`${Math.round(frame.spm)}`}
			value={frame.spm} min={0} max={60} color="#3fb950"
		/>
		<MetricGauge
			label="Power" unit="watts"
			display={`${Math.round(frame.watts)}`}
			value={frame.watts} min={wattRange.min} max={wattRange.max} color="#d2a8ff"
		/>
		{#if hasHr}
			<MetricGauge
				label="Heart" unit="bpm"
				display={frame.hr != null ? `${Math.round(frame.hr)}` : '--'}
				value={frame.hr ?? 0} min={90} max={200} color="#f778ba"
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

	<!-- Technique (stroke quality) -->
	<div class="card technique">
		<div class="ctitle muted">Stroke quality</div>
		<div class="techstats">
			<div class="ts">
				<div class="tv mono">{tech.avgDps.toFixed(1)}<span class="tu">m</span></div>
				<div class="tl muted">avg dist / stroke</div>
			</div>
			<div class="ts">
				<div class="tv mono">{Math.round(tech.avgSpm)}<span class="tu">{theme.cadenceUnit}</span></div>
				<div class="tl muted">avg rate</div>
			</div>
			<div class="ts">
				<div class="tv mono">{tech.paceConsistency.toFixed(1)}<span class="tu">%</span></div>
				<div class="tl muted">pace variation <span class="hint">(lower = smoother)</span></div>
			</div>
			<div class="ts">
				<div class="tv mono" class:good={tech.fade <= 0} class:bad={tech.fade > 1.5}>
					{tech.fade > 0 ? '+' : ''}{tech.fade.toFixed(1)}<span class="tu">%</span>
				</div>
				<div class="tl muted">fade <span class="hint">({tech.fade <= 0 ? 'negative split' : 'slowed down'})</span></div>
			</div>
		</div>
	</div>

	<div class="analysis">
		<div class="card">
			<div class="ctitle muted">Distance per stroke <span class="hint">— higher = more powerful stroke</span></div>
			<UPlotChart data={dpsData} options={dpsOpts} height={150} marker={frame.t} />
		</div>
		{#if eff.length > 2}
			<div class="card">
				<div class="ctitle muted">Pace vs rate <span class="hint">— find your most efficient rating</span></div>
				<UPlotChart data={effData} options={effOpts} height={150} />
			</div>
		{/if}
	</div>

	<!-- Analysis -->
	<div class="analysis">
		{#if pc.length}
			<div class="card">
				<div class="ctitle muted">Power curve (best average over duration)</div>
				<UPlotChart data={pcData} options={pcOpts} height={170} />
			</div>
		{/if}
		{#if zones.length}
			<div class="card">
				<div class="ctitle muted">Heart-rate zones (time in zone)</div>
				<div class="zonebar">
					{#each zones as z}
						{#if z.fraction > 0}
							<div
								class="zoneseg"
								style:width="{z.fraction * 100}%"
								style:background={z.color}
								title="{z.label}: {fmtTime(z.seconds)}"
							></div>
						{/if}
					{/each}
				</div>
				<div class="zonelegend">
					{#each zones as z}
						<div class="zli">
							<span class="dot" style:background={z.color}></span>
							<span class="zname">{z.label}</span>
							<span class="mono muted">{(z.fraction * 100).toFixed(0)}% · {fmtTime(z.seconds)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Interval / split breakdown -->
	{#if intervals}
		<div class="card intervals">
			<div class="ctitle muted">{segLabel} — {intervals.reps.length} {segUnit}</div>

			<div class="setstats">
				<div class="ss">
					<div class="ssv mono">{fmtPace(intervals.avgPace).replace('/500m', '')}</div>
					<div class="ssl muted">avg {detail.isInterval ? 'rep' : 'split'} pace</div>
				</div>
				<div class="ss">
					<div class="ssv mono">{intervals.consistency.toFixed(1)}%</div>
					<div class="ssl muted">consistency <span class="hint">(lower = evener)</span></div>
				</div>
				<div class="ss">
					<div class="ssv mono" class:good={intervals.fade <= 0} class:bad={intervals.fade > 2}>
						{intervals.fade > 0 ? '+' : ''}{intervals.fade.toFixed(1)}%
					</div>
					<div class="ssl muted">set fade <span class="hint">({intervals.fade <= 0 ? 'negative split' : 'faded'})</span></div>
				</div>
				<div class="ss">
					<div class="ssv mono">{fmtPace(intervals.fastest).replace('/500m', '')} → {fmtPace(intervals.slowest).replace('/500m', '')}</div>
					<div class="ssl muted">fastest → slowest</div>
				</div>
			</div>

			<div class="reps">
				{#each intervals.reps as r}
					<div class="rep" class:fastest={r.isFastest} class:slowest={r.isSlowest}>
						<div class="repno mono">#{r.index + 1}</div>
						<div class="repbarwrap">
							<div class="repbar" style:width="{repBarPct(r.pace)}%" style:background={r.isFastest ? 'var(--accent-2)' : r.isSlowest ? 'var(--warn)' : theme.color}></div>
							<span class="repbarlabel mono">{fmtPace(r.pace).replace('/500m', '')}</span>
						</div>
						<div class="repmeta mono muted">
							{fmtDistance(r.distance)} · {fmtTime(r.time, true)} · {r.spm}{theme.cadenceUnit}
							{#if r.hr}· {r.hr}bpm{/if}
							{#if r.dps > 0}· {r.dps.toFixed(1)}m/st{/if}
						</div>
						<div class="repdelta mono" class:good={r.vsAverage < 0} class:bad={r.vsAverage > 0}>
							{r.vsAverage < 0 ? '−' : '+'}{fmtPace(Math.abs(r.vsAverage)).replace('/500m', '')}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if detail.splits.length}
		<!-- Single-segment piece: plain split table -->
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
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.h1icon {
		display: inline-flex;
		color: var(--accent);
	}
	.summary {
		font-size: 0.95rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.ghostbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
		padding: 0.6rem 1rem;
	}
	.ghostbar label {
		font-size: 0.9rem;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.ghostbar select {
		background: var(--bg-elev-2);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
	}
	.gap {
		margin-left: auto;
		font-weight: 700;
		font-size: 1rem;
		padding: 0.25rem 0.7rem;
		border-radius: 999px;
	}
	.gap.ahead {
		color: var(--accent-2);
		background: rgba(63, 185, 80, 0.12);
	}
	.gap.behind {
		color: var(--danger);
		background: rgba(248, 81, 73, 0.12);
	}
	.small {
		font-size: 0.8rem;
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
	.analysis {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.technique {
		margin-bottom: 0.75rem;
	}
	.techstats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.ts {
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.6rem 0.8rem;
	}
	.tv {
		font-size: 1.5rem;
		font-weight: 700;
	}
	.tv.good {
		color: var(--accent-2);
	}
	.tv.bad {
		color: var(--warn);
	}
	.tu {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-dim);
		margin-left: 0.15rem;
	}
	.tl {
		font-size: 0.78rem;
		margin-top: 0.2rem;
	}
	.hint {
		font-weight: 400;
		opacity: 0.7;
		text-transform: none;
		letter-spacing: 0;
	}
	.ctitle {
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.zonebar {
		display: flex;
		height: 22px;
		border-radius: 6px;
		overflow: hidden;
		background: var(--bg-elev-2);
		margin: 0.4rem 0 0.75rem;
	}
	.zoneseg {
		height: 100%;
	}
	.zonelegend {
		display: grid;
		gap: 0.3rem;
	}
	.zli {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}
	.zli .zname {
		flex: 1;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	.intervals {
		margin-bottom: 0.75rem;
	}
	.setstats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
	}
	.ss {
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.5rem 0.7rem;
	}
	.ssv {
		font-size: 1.15rem;
		font-weight: 700;
	}
	.ssv.good {
		color: var(--accent-2);
	}
	.ssv.bad {
		color: var(--warn);
	}
	.ssl {
		font-size: 0.72rem;
		margin-top: 0.15rem;
	}
	.reps {
		display: grid;
		gap: 0.4rem;
	}
	.rep {
		display: grid;
		grid-template-columns: 2.2rem 1fr auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.4rem 0.5rem;
		border-radius: 8px;
		background: var(--bg-elev-2);
	}
	.rep.fastest {
		box-shadow: inset 0 0 0 1px var(--accent-2);
	}
	.rep.slowest {
		box-shadow: inset 0 0 0 1px var(--warn);
	}
	.repno {
		font-weight: 700;
		color: var(--text-dim);
	}
	.repbarwrap {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}
	.repbar {
		height: 1.4rem;
		border-radius: 4px;
		min-width: 2px;
		transition: width 0.3s ease;
	}
	.repbarlabel {
		font-weight: 700;
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.repmeta {
		font-size: 0.78rem;
		grid-column: 2;
	}
	.repdelta {
		font-weight: 700;
		font-size: 0.85rem;
		text-align: right;
	}
	.repdelta.good {
		color: var(--accent-2);
	}
	.repdelta.bad {
		color: var(--warn);
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
		.gauges,
		.techstats,
		.setstats {
			grid-template-columns: repeat(2, 1fr);
		}
		.charts,
		.analysis {
			grid-template-columns: 1fr;
		}
		.rep {
			grid-template-columns: 1.8rem 1fr auto;
		}
		.repmeta {
			font-size: 0.72rem;
		}
		/* Transport: play + clock on row 1, scrub full width on row 2,
		   dist + speeds on row 3. */
		.controls {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 0.6rem 0.75rem;
			align-items: center;
		}
		.play {
			min-width: 0;
		}
		.clock {
			min-width: 0;
			justify-self: end;
			font-size: 1rem;
		}
		.scrub {
			grid-column: 1 / -1;
			min-width: 0;
			width: 100%;
		}
		.dist {
			min-width: 0;
			text-align: left;
		}
		.speeds {
			justify-self: end;
		}
		.head h1 {
			font-size: 1.25rem;
		}
		.summary {
			font-size: 0.85rem;
		}
	}
	@media (max-width: 420px) {
		.gauges {
			grid-template-columns: repeat(2, 1fr);
		}
		.sbtn {
			padding: 0.3rem 0.4rem;
		}
	}
</style>
