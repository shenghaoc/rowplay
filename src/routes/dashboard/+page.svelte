<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import { fmtDate, fmtDistance, fmtPace, fmtTime, SPORT_ICON, SPORT_LABEL } from '$lib/format';
	import { distancePBs, distancePerStroke, summariseBySport } from '$lib/analytics';
	import type { Sport, Workout } from '$lib/types';

	let { data } = $props();
	const workouts = $derived<Workout[]>(data.workouts);

	let sportFilter = $state<Sport | 'all'>('all');
	type Metric = 'pace' | 'distance' | 'spm';
	let metric = $state<Metric>('pace');

	const filtered = $derived(
		sportFilter === 'all' ? workouts : workouts.filter((w) => w.sport === sportFilter)
	);

	// ---- Latest-session hero: pace is the number you check first ----
	// `workouts` arrives newest-first from the logbook.
	const latest = $derived<Workout | undefined>(filtered[0]);

	const heroDps = $derived(
		latest && latest.strokeRate ? distancePerStroke(latest.pace, latest.strokeRate) : 0
	);

	// Pace delta vs the average of the previous same-sport sessions (lower pace
	// is faster, so a negative delta is an improvement).
	const paceDelta = $derived.by(() => {
		if (!latest) return null;
		const prior = filtered.filter((w) => w.sport === latest.sport && w.id !== latest.id);
		if (!prior.length) return null;
		const avg = prior.reduce((s, w) => s + w.pace, 0) / prior.length;
		return latest.pace - avg; // seconds/500m; negative = faster than usual
	});

	const totalMeters = $derived(filtered.reduce((s, w) => s + w.distance, 0));
	const totalTime = $derived(filtered.reduce((s, w) => s + w.time, 0));
	const avgPace = $derived(
		totalMeters > 0 ? totalTime / (totalMeters / 500) : 0
	);

	const bySport = $derived(summariseBySport(filtered));
	const pbs = $derived(distancePBs(filtered));

	// Trend chart (oldest -> newest), metric switchable.
	const trend = $derived.by((): uPlot.AlignedData => {
		const ordered = [...filtered].reverse();
		const xs = ordered.map((_, i) => i);
		const ys = ordered.map((w) =>
			metric === 'pace' ? w.pace : metric === 'distance' ? w.distance : (w.strokeRate ?? 0)
		);
		return [xs, ys];
	});

	const trendOptions = $derived.by((): Omit<uPlot.Options, 'width' | 'height'> => {
		const fmt =
			metric === 'pace'
				? (v: number) => fmtPace(v).replace('/500m', '')
				: metric === 'distance'
					? (v: number) => fmtDistance(v)
					: (v: number) => `${Math.round(v)}`;
		const color = metric === 'pace' ? '#2f81f7' : metric === 'distance' ? '#3fb950' : '#d2a8ff';
		return {
			scales: { x: { time: false }, y: metric === 'pace' ? { dir: -1 } : {} },
			axes: [
				{ stroke: '#8b949e', show: false },
				{ stroke: '#8b949e', grid: { stroke: '#1c2230' }, size: 56, values: (_u, sp) => sp.map(fmt) }
			],
			series: [{}, { label: metric, stroke: color, width: 2, points: { show: true, size: 5 } }],
			legend: { show: false }
		};
	});

	const sports: (Sport | 'all')[] = ['all', 'rower', 'skierg', 'bike'];
	const metrics: { id: Metric; label: string }[] = [
		{ id: 'pace', label: 'Pace' },
		{ id: 'distance', label: 'Distance' },
		{ id: 'spm', label: 'Rate' }
	];
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

	<!-- Latest session: pace front and centre -->
	{#if latest}
		<a class="card hero" href="/replay/{latest.id}">
			<div class="herolead">
				<div class="herotop muted">
					<span class="hicon">{SPORT_ICON[latest.sport]}</span>
					Latest · {latest.workoutType || SPORT_LABEL[latest.sport]} · {fmtDate(latest.date)}
				</div>
				<div class="heropace mono">{fmtPace(latest.pace).replace('/500m', '')}<span class="perunit">/500m</span></div>
				{#if paceDelta != null}
					<div class="herodelta" class:faster={paceDelta < 0} class:slower={paceDelta > 0}>
						{paceDelta < 0 ? '▼' : '▲'}
						{fmtPace(Math.abs(paceDelta)).replace('/500m', '')}
						<span class="muted">vs your {SPORT_LABEL[latest.sport]} avg</span>
					</div>
				{/if}
			</div>
			<div class="herometrics">
				<div class="hm">
					<div class="hmv mono">{fmtDistance(latest.distance)}</div>
					<div class="hml muted">distance</div>
				</div>
				<div class="hm">
					<div class="hmv mono">{fmtTime(latest.time, true)}</div>
					<div class="hml muted">time</div>
				</div>
				{#if latest.strokeRate}
					<div class="hm">
						<div class="hmv mono">{latest.strokeRate}</div>
						<div class="hml muted">avg rate</div>
					</div>
				{/if}
				{#if heroDps > 0}
					<div class="hm">
						<div class="hmv mono">{heroDps.toFixed(1)}m</div>
						<div class="hml muted">dist/stroke</div>
					</div>
				{/if}
				{#if latest.heartRateAvg}
					<div class="hm">
						<div class="hmv mono">{Math.round(latest.heartRateAvg)}</div>
						<div class="hml muted">avg bpm</div>
					</div>
				{/if}
			</div>
			<div class="herocta tag">replay ▶</div>
		</a>
	{/if}

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

	<!-- Personal bests -->
	{#if pbs.length}
		<div class="card pbcard">
			<div class="muted label">Personal bests · standard distances</div>
			<div class="pbgrid">
				{#each pbs as pb}
					<div class="pb">
						<div class="pbdist mono">{pb.distance >= 1000 ? `${pb.distance / 1000}k` : `${pb.distance}m`}</div>
						<div class="pbtime mono">{fmtTime(pb.time, true)}</div>
						<div class="pbsub muted">{fmtPace(pb.pace)} · {SPORT_ICON[pb.sport]} {fmtDate(pb.date)}</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Per-sport breakdown -->
	{#if bySport.length > 1}
		<div class="card breakdown">
			<div class="muted label">By sport</div>
			<table class="mono">
				<thead>
					<tr><th>Sport</th><th>Sessions</th><th>Distance</th><th>Time</th><th>Avg pace</th><th>Best pace</th></tr>
				</thead>
				<tbody>
					{#each bySport as s}
						<tr>
							<td>{SPORT_ICON[s.sport]} {SPORT_LABEL[s.sport]}</td>
							<td>{s.sessions}</td>
							<td>{fmtDistance(s.distance)}</td>
							<td>{fmtTime(s.time)}</td>
							<td>{fmtPace(s.avgPace)}</td>
							<td>{fmtPace(s.bestPace)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Trend -->
	{#if filtered.length > 1}
		<div class="card chartcard">
			<div class="trendhead">
				<div class="muted label">Trend (oldest → newest)</div>
				<div class="metrics">
					{#each metrics as m}
						<button class="mchip" class:on={metric === m.id} onclick={() => (metric = m.id)}>{m.label}</button>
					{/each}
				</div>
			</div>
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
	.filters,
	.metrics {
		display: flex;
		gap: 0.4rem;
	}
	.chip,
	.mchip {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--text-dim);
		border-radius: 999px;
		padding: 0.35rem 0.85rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}
	.chip.on,
	.mchip.on {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	.hero {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 1.5rem;
		color: var(--text);
		margin-bottom: 1rem;
		background: linear-gradient(135deg, rgba(47, 129, 247, 0.12), var(--bg-elev) 60%);
		border-color: rgba(47, 129, 247, 0.35);
		transition: border-color 0.15s ease;
	}
	.hero:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.herotop {
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.hicon {
		font-size: 1.1rem;
	}
	.heropace {
		font-size: 3.2rem;
		font-weight: 800;
		line-height: 1;
		margin: 0.3rem 0;
		letter-spacing: -0.02em;
	}
	.perunit {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text-dim);
		margin-left: 0.3rem;
	}
	.herodelta {
		font-size: 0.95rem;
		font-weight: 700;
	}
	.herodelta.faster {
		color: var(--accent-2);
	}
	.herodelta.slower {
		color: var(--warn);
	}
	.herometrics {
		display: flex;
		gap: 1.75rem;
		flex-wrap: wrap;
	}
	.hmv {
		font-size: 1.4rem;
		font-weight: 700;
	}
	.hml {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-top: 0.15rem;
	}
	.herocta {
		align-self: start;
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
	.label {
		font-size: 0.8rem;
	}
	.pbcard,
	.breakdown,
	.chartcard {
		margin-bottom: 1rem;
	}
	.pbgrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.75rem;
		margin-top: 0.6rem;
	}
	.pb {
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.6rem 0.75rem;
	}
	.pbdist {
		font-size: 0.8rem;
		color: var(--text-dim);
	}
	.pbtime {
		font-size: 1.35rem;
		font-weight: 700;
		margin: 0.1rem 0;
	}
	.pbsub {
		font-size: 0.72rem;
	}
	.breakdown table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		margin-top: 0.4rem;
	}
	.breakdown th {
		text-align: left;
		color: var(--text-dim);
		font-weight: 600;
		padding: 0.3rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.breakdown td {
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--bg-elev-2);
	}
	.trendhead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
		gap: 0.5rem;
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
		.hero {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}
		.heropace {
			font-size: 2.6rem;
		}
		.herometrics {
			gap: 1.25rem;
		}
	}
</style>
