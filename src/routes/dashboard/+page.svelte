<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import { fmtDate, fmtDistance, fmtPace, fmtTime, SPORT_ICON, SPORT_LABEL } from '$lib/format';
	import type { Sport, Workout } from '$lib/types';

	let { data } = $props();
	const workouts = $derived<Workout[]>(data.workouts);

	let sportFilter = $state<Sport | 'all'>('all');
	const filtered = $derived(
		sportFilter === 'all' ? workouts : workouts.filter((w) => w.sport === sportFilter)
	);

	const totalMeters = $derived(filtered.reduce((s, w) => s + w.distance, 0));
	const totalTime = $derived(filtered.reduce((s, w) => s + w.time, 0));
	const avgPace = $derived(
		filtered.length ? filtered.reduce((s, w) => s + w.pace, 0) / filtered.length : 0
	);

	// Pace trend (oldest -> newest) for the chart.
	const trend = $derived.by((): uPlot.AlignedData => {
		const ordered = [...filtered].reverse();
		const xs = ordered.map((_, i) => i);
		const ys = ordered.map((w) => w.pace);
		return [xs, ys];
	});

	const trendOptions: Omit<uPlot.Options, 'width' | 'height'> = {
		scales: { x: { time: false }, y: { dir: -1 } }, // lower pace = better -> invert
		axes: [
			{ stroke: '#8b949e', grid: { stroke: '#2a3240' }, show: false },
			{
				stroke: '#8b949e',
				grid: { stroke: '#1c2230' },
				values: (_u, splits) => splits.map((v) => fmtPace(v).replace('/500m', ''))
			}
		],
		series: [
			{},
			{ label: 'avg pace', stroke: '#2f81f7', width: 2, points: { show: true, size: 6 } }
		],
		legend: { show: false }
	};

	const sports: (Sport | 'all')[] = ['all', 'rower', 'skierg', 'bike'];
</script>

<div class="container">
	<div class="head">
		<h1>Dashboard</h1>
		<div class="filters">
			{#each sports as s}
				<button class="chip" class:on={sportFilter === s} onclick={() => (sportFilter = s)}>
					{s === 'all' ? 'All' : SPORT_LABEL[s]}
				</button>
			{/each}
		</div>
	</div>

	<div class="stats">
		<div class="card stat">
			<div class="muted label">Sessions</div>
			<div class="value mono">{filtered.length}</div>
		</div>
		<div class="card stat">
			<div class="muted label">Total distance</div>
			<div class="value mono">{fmtDistance(totalMeters)}</div>
		</div>
		<div class="card stat">
			<div class="muted label">Total time</div>
			<div class="value mono">{fmtTime(totalTime)}</div>
		</div>
		<div class="card stat">
			<div class="muted label">Avg pace</div>
			<div class="value mono">{fmtPace(avgPace)}</div>
		</div>
	</div>

	{#if filtered.length > 1}
		<div class="card chartcard">
			<div class="muted label">Pace trend (oldest → newest, higher is faster)</div>
			<UPlotChart data={trend} options={trendOptions} height={180} />
		</div>
	{/if}

	<div class="list">
		{#each filtered as w (w.id)}
			<a class="card row" href="/replay/{w.id}">
				<div class="sport">{SPORT_ICON[w.sport]}</div>
				<div class="rowmain">
					<div class="rowtop">
						<strong>{w.workoutType || SPORT_LABEL[w.sport]}</strong>
						<span class="muted">{fmtDate(w.date)}</span>
					</div>
					<div class="rowmeta mono muted">
						{fmtDistance(w.distance)} · {fmtTime(w.time, true)} · {fmtPace(w.pace)}
						{#if w.strokeRate}· {w.strokeRate} spm{/if}
						{#if w.heartRateAvg}· {Math.round(w.heartRateAvg)} bpm{/if}
					</div>
				</div>
				<div class="play">
					<span class="tag">{w.hasStrokeData ? 'replay ▶' : 'replay (low-res)'}</span>
				</div>
			</a>
		{/each}
		{#if filtered.length === 0}
			<p class="muted">No workouts for this filter.</p>
		{/if}
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.filters {
		display: flex;
		gap: 0.4rem;
	}
	.chip {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--text-dim);
		border-radius: 999px;
		padding: 0.35rem 0.85rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}
	.chip.on {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.stat .label {
		font-size: 0.8rem;
	}
	.stat .value {
		font-size: 1.6rem;
		font-weight: 700;
		margin-top: 0.25rem;
	}
	.chartcard {
		margin-bottom: 1.5rem;
	}
	.chartcard .label {
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
	}
	.list {
		display: grid;
		gap: 0.6rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--text);
		transition: border-color 0.15s ease;
	}
	.row:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.sport {
		font-size: 1.6rem;
	}
	.rowmain {
		flex: 1;
		min-width: 0;
	}
	.rowtop {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.rowmeta {
		font-size: 0.85rem;
		margin-top: 0.2rem;
	}
	@media (max-width: 720px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
		.play {
			display: none;
		}
	}
</style>
