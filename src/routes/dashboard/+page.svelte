<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import WorkoutList from '$components/WorkoutList.svelte';
	import TrainingHeatmap from '$components/TrainingHeatmap.svelte';
	import SportIcon from '$components/SportIcon.svelte';
	import { fmtDate, fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import {
		distanceBand,
		distancePBs,
		distancePerStroke,
		linearTrend,
		summariseBySport
	} from '$lib/analytics';
	import type { Sport, Workout } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { RefreshCw, TrendingUp, TrendingDown, MoveRight, Play } from '@lucide/svelte';
	import { getI18nContext } from '$lib/i18n.svelte';

	let { data } = $props();
	const t = getI18nContext().t;
	const workouts = $derived<Workout[]>(data.workouts);

	let sportFilter = $state<Sport | 'all'>('all');
	type Metric = 'pace' | 'distance' | 'spm' | 'dps';
	let metric = $state<Metric>('pace');
	// Selected distance band for pace/DPS trends; '' = auto (most-rowed band).
	let bandKey = $state<string>('');

	let syncing = $state(false);
	async function sync() {
		if (syncing) return;
		syncing = true;
		const toastId = toast.loading(t('sync.loading'));
		try {
			const res = await fetch('/api/sync', { method: 'POST' });
			if (!res.ok) {
				let message = `HTTP ${res.status}`;
				try {
					const body = (await res.json()) as { message?: string };
					if (body?.message) message = body.message;
				} catch {
					/* non-JSON error body */
				}
				throw new Error(message);
			}
			const { added, total } = (await res.json()) as { added: number; total: number };
			await invalidateAll();
			toast.success(t('sync.done', { added, total }), { id: toastId });
		} catch (e) {
			toast.error(t('sync.failed'), {
				id: toastId,
				description: e instanceof Error ? e.message : t('common.tryAgain')
			});
		} finally {
			syncing = false;
		}
	}

	/** Whether the current metric only makes sense within one distance band. */
	const bandScoped = $derived(metric === 'pace' || metric === 'dps');

	function metricValue(w: Workout, m: Metric): number | null {
		switch (m) {
			case 'pace':
				return w.pace > 0 ? w.pace : null;
			case 'distance':
				return w.distance;
			case 'spm':
				return w.strokeRate ?? null;
			case 'dps':
				return w.strokeRate ? distancePerStroke(w.pace, w.strokeRate) : null;
		}
	}

	function workoutEpoch(w: Workout): number {
		return new Date(w.date.replace(' ', 'T')).getTime();
	}

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

	// Cross-session trend, plotted against real dates so spacing reflects how
	// often you actually train. For pace/DPS we restrict to one sport (mixing
	// sports muddies the metric) — default to the dominant sport.
	const dominantSport = $derived.by((): Sport => {
		const counts = new Map<Sport, number>();
		for (const w of filtered) counts.set(w.sport, (counts.get(w.sport) ?? 0) + 1);
		let best: Sport = 'rower';
		let n = -1;
		for (const [s, c] of counts) if (c > n) { n = c; best = s; }
		return best;
	});

	// Lower pace = better, so improving means the metric goes DOWN for pace.
	const lowerIsBetter = $derived(metric === 'pace');

	// Distance bands available for the dominant sport, ordered by distance,
	// each annotated with how many sessions fall in it.
	const bands = $derived.by(() => {
		if (!bandScoped) return [];
		const counts = new Map<string, { label: string; nominal: number; n: number }>();
		for (const w of filtered) {
			if (w.sport !== dominantSport) continue;
			const b = distanceBand(w.distance);
			const e = counts.get(b.key) ?? { label: b.label, nominal: b.nominal, n: 0 };
			e.n++;
			counts.set(b.key, e);
		}
		return [...counts.entries()]
			.map(([key, v]) => ({ key, ...v }))
			.sort((a, b) => a.nominal - b.nominal);
	});

	// The band actually in use: explicit selection, else the most-rowed one.
	const activeBand = $derived.by(() => {
		if (!bandScoped || bands.length === 0) return '';
		if (bandKey && bands.some((b) => b.key === bandKey)) return bandKey;
		return [...bands].sort((a, b) => b.n - a.n)[0].key;
	});

	const trendPoints = $derived.by(() => {
		// Pace and DPS are sport-specific and band-specific; distance/rate can
		// span sports and distances.
		let base = filtered;
		if (bandScoped) {
			base = filtered.filter(
				(w) => w.sport === dominantSport && distanceBand(w.distance).key === activeBand
			);
		}
		return base
			.map((w) => ({ x: workoutEpoch(w), y: metricValue(w, metric) }))
			.filter((p): p is { x: number; y: number } => p.y != null && isFinite(p.x))
			.sort((a, b) => a.x - b.x);
	});

	const fit = $derived(linearTrend(trendPoints));

	// Verdict over the visible span.
	const verdict = $derived.by(() => {
		if (!fit || trendPoints.length < 3) return null;
		const span = trendPoints[trendPoints.length - 1].x - trendPoints[0].x;
		const days = Math.max(1, span / 86_400_000);
		const range = Math.max(...trendPoints.map((p) => p.y)) - Math.min(...trendPoints.map((p) => p.y));
		// "Flat" if the modelled change is small relative to session-to-session spread.
		const flat = range === 0 || Math.abs(fit.delta) < range * 0.15;
		const better = lowerIsBetter ? fit.delta < 0 : fit.delta > 0;
		return { flat, better, delta: Math.abs(fit.delta), days, sport: dominantSport };
	});

	const trend = $derived.by((): uPlot.AlignedData => {
		const xs = trendPoints.map((p) => p.x / 1000); // uPlot time scale wants seconds
		const ys = trendPoints.map((p) => p.y);
		// Second series = the fit line (same x, linearly interpolated y endpoints).
		let fitY: (number | null)[] = ys.map(() => null);
		if (fit && trendPoints.length >= 2) {
			const x0 = trendPoints[0].x;
			const x1 = trendPoints[trendPoints.length - 1].x;
			const span = x1 - x0 || 1;
			fitY = trendPoints.map((p) => fit.y0 + ((fit.y1 - fit.y0) * (p.x - x0)) / span);
		}
		return [xs, ys, fitY];
	});

	const metricFmt = $derived((v: number) => {
		switch (metric) {
			case 'pace':
				return fmtPace(v).replace('/500m', '');
			case 'distance':
				return fmtDistance(v);
			case 'dps':
				return `${v.toFixed(1)}m`;
			default:
				return `${Math.round(v)}`;
		}
	});

	const trendOptions = $derived.by((): Omit<uPlot.Options, 'width' | 'height'> => {
		const color =
			metric === 'pace' ? '#2f81f7' : metric === 'distance' ? '#3fb950' : metric === 'dps' ? '#56d4ff' : '#d2a8ff';
		return {
			scales: { x: { time: true }, y: metric === 'pace' ? { dir: -1 } : {} },
			axes: [
				{ stroke: '#8b949e', grid: { stroke: '#1c2230' } },
				{ stroke: '#8b949e', grid: { stroke: '#1c2230' }, size: 56, values: (_u, sp) => sp.map(metricFmt) }
			],
			series: [
				{},
				{ label: metric, stroke: color, width: 2, points: { show: true, size: 5 } },
				{ label: 'trend', stroke: '#8b949e', width: 1.5, dash: [6, 4], points: { show: false } }
			],
			legend: { show: false }
		};
	});

	const sports: (Sport | 'all')[] = ['all', 'rower', 'skierg', 'bike'];
	const metrics: { id: Metric; labelKey: string }[] = [
		{ id: 'pace', labelKey: 'dashboard.mPace' },
		{ id: 'dps', labelKey: 'dashboard.mDistStroke' },
		{ id: 'distance', labelKey: 'dashboard.mDistance' },
		{ id: 'spm', labelKey: 'dashboard.mRate' }
	];

	const metricName = $derived(
		t(metrics.find((m) => m.id === metric)?.labelKey ?? 'dashboard.mPace')
	);
	const verdictText = $derived.by(() => {
		if (!verdict) return '';
		const days = Math.round(verdict.days);
		if (verdict.flat) return t('dashboard.holdingSteady', { metric: metricName, days });
		const change =
			metric === 'pace'
				? t(verdict.better ? 'dashboard.faster' : 'dashboard.slower', { delta: metricFmt(verdict.delta) })
				: metric === 'dps'
					? `${verdict.better ? '+' : '−'}${verdict.delta.toFixed(1)}m/stroke`
					: `${verdict.better ? '+' : '−'}${metricFmt(verdict.delta)}`;
		return t(verdict.better ? 'dashboard.improving' : 'dashboard.slipping', { change, days });
	});
</script>

<div class="container">
	<div class="head">
		<h1>{t('dashboard.title')}</h1>
		<div class="headright">
			<div class="filters">
				{#each sports as s}
					<button class="chip" class:on={sportFilter === s} onclick={() => (sportFilter = s)}>
						{s === 'all' ? t('dashboard.all') : SPORT_LABEL[s]}
					</button>
				{/each}
			</div>
			{#if !data.demo}
				<button class="btn ghost small sync" onclick={sync} disabled={syncing}>
					<span class="syncicon" class:spin={syncing}><RefreshCw size={14} /></span>
					{syncing ? t('dashboard.syncing') : t('dashboard.sync')}
				</button>
			{/if}
		</div>
	</div>
	{#if !data.demo && data.sync}
		<p class="syncnote muted">
			{t('dashboard.syncedNote', {
				total: data.sync.total,
				date: fmtDate(new Date(data.sync.lastSyncAt).toISOString())
			})}
		</p>
	{:else if !data.demo && !data.sync}
		<p class="syncnote muted">{t('dashboard.recentNote')}</p>
	{/if}

	<!-- Latest session: pace front and centre -->
	{#if latest}
		<a class="card hero" href="/replay/{latest.id}">
			<div class="herolead">
				<div class="herotop muted">
					<span class="hicon"><SportIcon sport={latest.sport} size={16} /></span>
					{t('dashboard.latest')} · {latest.workoutType || SPORT_LABEL[latest.sport]} · {fmtDate(latest.date)}
				</div>
				<div class="heropace mono">{fmtPace(latest.pace).replace('/500m', '')}<span class="perunit">/500m</span></div>
				{#if paceDelta != null}
					<div class="herodelta" class:faster={paceDelta < 0} class:slower={paceDelta > 0}>
						{paceDelta < 0 ? '▼' : '▲'}
						{fmtPace(Math.abs(paceDelta)).replace('/500m', '')}
						<span class="muted">{t('dashboard.vsAvg', { sport: SPORT_LABEL[latest.sport] })}</span>
					</div>
				{/if}
			</div>
			<div class="herometrics">
				<div class="hm">
					<div class="hmv mono">{fmtDistance(latest.distance)}</div>
					<div class="hml muted">{t('dashboard.distance')}</div>
				</div>
				<div class="hm">
					<div class="hmv mono">{fmtTime(latest.time, true)}</div>
					<div class="hml muted">{t('dashboard.time')}</div>
				</div>
				{#if latest.strokeRate}
					<div class="hm">
						<div class="hmv mono">{latest.strokeRate}</div>
						<div class="hml muted">{t('dashboard.avgRate')}</div>
					</div>
				{/if}
				{#if heroDps > 0}
					<div class="hm">
						<div class="hmv mono">{heroDps.toFixed(1)}m</div>
						<div class="hml muted">{t('dashboard.distStroke')}</div>
					</div>
				{/if}
				{#if latest.heartRateAvg}
					<div class="hm">
						<div class="hmv mono">{Math.round(latest.heartRateAvg)}</div>
						<div class="hml muted">{t('dashboard.avgBpm')}</div>
					</div>
				{/if}
			</div>
			<div class="herocta tag"><Play size={12} /> {t('common.replay')}</div>
		</a>
	{/if}

	<div class="stats">
		<div class="card stat">
			<div class="muted label">{t('dashboard.sessions')}</div>
			<div class="value mono">{filtered.length}</div>
		</div>
		<div class="card stat">
			<div class="muted label">{t('dashboard.totalDistance')}</div>
			<div class="value mono">{fmtDistance(totalMeters)}</div>
		</div>
		<div class="card stat">
			<div class="muted label">{t('dashboard.totalTime')}</div>
			<div class="value mono">{fmtTime(totalTime)}</div>
		</div>
		<div class="card stat">
			<div class="muted label">{t('dashboard.avgPace')}</div>
			<div class="value mono">{fmtPace(avgPace)}</div>
		</div>
	</div>

	{#if filtered.length}
		<TrainingHeatmap workouts={filtered} endDay={data.calendarEndDay} />
	{/if}

	<!-- Personal bests -->
	{#if pbs.length}
		<div class="card pbcard">
			<div class="muted label">{t('dashboard.pbTitle')}</div>
			<div class="pbgrid">
				{#each pbs as pb}
					<div class="pb">
						<div class="pbdist mono">{pb.distance >= 1000 ? `${pb.distance / 1000}k` : `${pb.distance}m`}</div>
						<div class="pbtime mono">{fmtTime(pb.time, true)}</div>
						<div class="pbsub muted"><SportIcon sport={pb.sport} size={12} /> {fmtPace(pb.pace)} · {fmtDate(pb.date)}</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Per-sport breakdown -->
	{#if bySport.length > 1}
		<div class="card breakdown">
			<div class="muted label">{t('dashboard.bySport')}</div>
			<table class="mono">
				<thead>
					<tr><th>{t('dashboard.thSport')}</th><th>{t('dashboard.thSessions')}</th><th>{t('dashboard.thDistance')}</th><th>{t('dashboard.thTime')}</th><th>{t('dashboard.thAvgPace')}</th><th>{t('dashboard.thBestPace')}</th></tr>
				</thead>
				<tbody>
					{#each bySport as s}
						<tr>
							<td class="sportcell"><SportIcon sport={s.sport} size={14} /> {SPORT_LABEL[s.sport]}</td>
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
				<div class="label">
					{t('dashboard.trendTitle')}
					{#if bandScoped}
						<span class="muted">· {t('dashboard.likeForLike', { sport: SPORT_LABEL[dominantSport] })}</span>
					{/if}
				</div>
				<div class="metrics">
					{#each metrics as m}
						<button class="mchip" class:on={metric === m.id} onclick={() => (metric = m.id)}>{t(m.labelKey)}</button>
					{/each}
				</div>
			</div>

			{#if bandScoped && bands.length > 1}
				<div class="bands">
					{#each bands as b}
						<button
							class="bchip"
							class:on={activeBand === b.key}
							onclick={() => (bandKey = b.key)}
						>{b.label} <span class="bn">{b.n}</span></button>
					{/each}
				</div>
			{/if}

			{#if verdict}
				<div class="verdict" class:good={verdict.better && !verdict.flat} class:bad={!verdict.better && !verdict.flat}>
					{#if verdict.flat}<MoveRight size={16} />{:else if verdict.better}<TrendingUp size={16} />{:else}<TrendingDown size={16} />{/if}
					{verdictText}
				</div>
			{/if}

			{#if trendPoints.length > 1}
				<UPlotChart data={trend} options={trendOptions} height={190} />
			{:else}
				<p class="muted emptytrend">
					{t('dashboard.emptyTrend', {
						n: trendPoints.length,
						band: bandScoped ? (bands.find((b) => b.key === activeBand)?.label ?? '') : ''
					})}
				</p>
			{/if}
		</div>
	{/if}

	<WorkoutList workouts={filtered} />
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}
	.headright {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.sync {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.syncicon {
		display: inline-flex;
	}
	.syncicon.spin {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.syncnote {
		font-size: 0.82rem;
		margin: 0 0 1.25rem;
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
		display: inline-flex;
		align-items: center;
		color: var(--accent);
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
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
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
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.sportcell :global(svg) {
		vertical-align: -2px;
		color: var(--accent);
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
	.bands {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}
	.bchip {
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		border-radius: 8px;
		padding: 0.25rem 0.6rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--mono);
	}
	.bchip.on {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	.bn {
		opacity: 0.6;
		font-size: 0.72rem;
		margin-left: 0.15rem;
	}
	.emptytrend {
		padding: 1.5rem 0;
		text-align: center;
		font-size: 0.9rem;
	}
	.verdict {
		font-size: 0.95rem;
		font-weight: 700;
		padding: 0.5rem 0.8rem;
		border-radius: 8px;
		margin-bottom: 0.75rem;
		background: var(--bg-elev-2);
		color: var(--text);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.verdict.good {
		background: rgba(63, 185, 80, 0.12);
		color: var(--accent-2);
	}
	.verdict.bad {
		background: rgba(210, 153, 34, 0.12);
		color: var(--warn);
	}
	@media (max-width: 720px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
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
