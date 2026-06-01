<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import SportIcon from '$components/SportIcon.svelte';
	import {
		buildDistanceOverlay,
		compareIntervalReps,
		compareVerdict,
		workoutSideStats,
		type CompareWinner
	} from '$lib/analytics';
	import { fmtDate, fmtDistance, fmtLogbookDateTime, fmtPace, fmtPaceBare, fmtTime, SPORT_LABEL } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import { chartTheme, baseOptions, type SeriesRole } from '$lib/chartTheme';
	import { MACHINE_COLOR } from '$lib/replay/sports';
	import type { Workout, WorkoutDetail } from '$lib/types';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, GitCompare, TrendingDown, TrendingUp, MoveRight } from '@lucide/svelte';

	let { data } = $props();
	const t = getI18nContext().t;
	const uiTheme = getThemeContext();

	const detailA = $derived(data.detailA);
	const detailB = $derived(data.detailB);

	let pickA = $state(untrack(() => String(data.idA ?? '')));
	let pickB = $state(untrack(() => String(data.idB ?? '')));

	$effect(() => {
		pickA = String(data.idA ?? '');
		pickB = String(data.idB ?? '');
	});

	function workoutLabel(w: Workout): string {
		return `${fmtDate(w.date)} · ${fmtDistance(w.distance)} · ${fmtPace(w.pace)}`;
	}

	function applyCompare() {
		const a = pickA.trim();
		const b = pickB.trim();
		if (!a || !b) return;
		goto(`/compare?a=${a}&b=${b}`);
	}

	function swapWorkouts() {
		if (!data.idA || !data.idB) return;
		goto(`/compare?a=${data.idB}&b=${data.idA}`);
	}

	const overlay = $derived.by(() => {
		if (!detailA?.strokes.length || !detailB?.strokes.length) return null;
		return buildDistanceOverlay(detailA.strokes, detailB.strokes);
	});

	const statsA = $derived(detailA ? workoutSideStats(detailA) : null);
	const statsB = $derived(detailB ? workoutSideStats(detailB) : null);
	const verdict = $derived(detailA && detailB ? compareVerdict(detailA, detailB) : null);
	const intervalRows = $derived(
		detailA && detailB ? compareIntervalReps(detailA, detailB) : null
	);

	const hasHr = $derived(
		Boolean(
			overlay &&
				(overlay.hrA.some((v) => v != null) || overlay.hrB.some((v) => v != null))
		)
	);

	const chart = $derived(chartTheme(uiTheme.value));

	function overlayOpts(
		labelA: string,
		labelB: string,
		roleA: SeriesRole,
		roleB: SeriesRole,
		invert: boolean,
		fmtY: (v: number) => string
	): Omit<uPlot.Options, 'width' | 'height'> {
		return baseOptions({
			theme: chart,
			xFmt: (v) => fmtDistance(v),
			yAxes: [{ size: 52, fmt: fmtY, invert }],
			series: [
				{ label: labelA, role: roleA, width: 2 },
				{ label: labelB, role: roleB, width: 1.75, dash: [6, 4] }
			],
			legend: true,
			cursor: { x: true, y: true }
		});
	}

	const labelA = $derived(
		detailA ? fmtDate(detailA.date) : t('compare.workoutA')
	);
	const labelB = $derived(
		detailB ? fmtDate(detailB.date) : t('compare.workoutB')
	);

	const paceData = $derived<uPlot.AlignedData | null>(
		overlay ? [overlay.xs, overlay.paceA, overlay.paceB] : null
	);
	const powerData = $derived<uPlot.AlignedData | null>(
		overlay ? [overlay.xs, overlay.powerA, overlay.powerB] : null
	);
	const hrData = $derived<uPlot.AlignedData | null>(
		overlay ? [overlay.xs, overlay.hrA, overlay.hrB] : null
	);

	const paceOpts = $derived(
		overlayOpts(labelA, labelB, 'live', 'ghost', true, (v) => fmtPace(v).replace(/\/\d+m$/, ''))
	);
	const powerOpts = $derived(
		overlayOpts(labelA, labelB, 'live', 'ghost', false, (v) => `${Math.round(v)} W`)
	);
	const hrOpts = $derived(
		overlayOpts(labelA, labelB, 'live', 'ghost', false, (v) => `${Math.round(v)}`)
	);

	function signedDelta(delta: number, decimals = 1): string {
		if (!isFinite(delta) || Math.abs(delta) < 0.05) return '—';
		const sign = delta > 0 ? '+' : '−';
		return `${sign}${Math.abs(delta).toFixed(decimals)}`;
	}

	function paceDeltaCell(delta: number): 'good' | 'bad' | '' {
		if (Math.abs(delta) < 0.05) return '';
		return delta < 0 ? 'good' : 'bad';
	}

	function timeDeltaCell(delta: number): 'good' | 'bad' | '' {
		if (Math.abs(delta) < 0.5) return '';
		return delta > 0 ? 'good' : 'bad';
	}

	function winnerLabel(w: CompareWinner): string {
		if (w === 'a') return t('compare.winnerA');
		if (w === 'b') return t('compare.winnerB');
		return t('compare.tie');
	}

	function verdictText(v: NonNullable<typeof verdict>): string {
		if (v.timeDeltaSec != null && Math.abs(v.timeDeltaSec) >= 0.5) {
			const faster = v.timeDeltaSec > 0 ? 'a' : 'b';
			const sec = Math.abs(v.timeDeltaSec);
			if (faster === 'a') {
				return t('compare.verdictTimeA', { seconds: sec.toFixed(1) });
			}
			return t('compare.verdictTimeB', { seconds: sec.toFixed(1) });
		}
		if (v.paceDelta != null && Math.abs(v.paceDelta) >= 0.1) {
			const delta = fmtPaceBare(Math.abs(v.paceDelta), true);
			if (v.paceDelta < 0) return t('compare.verdictPaceA', { delta });
			return t('compare.verdictPaceB', { delta });
		}
		return t('compare.tie');
	}

	interface StatRow {
		key: string;
		a: string;
		b: string;
		delta: string;
		deltaClass: 'good' | 'bad' | '';
	}

	const statRows = $derived.by((): StatRow[] => {
		if (!statsA || !statsB) return [];
		const rows: StatRow[] = [];

		const timeDelta = statsB.time - statsA.time;
		rows.push({
			key: 'time',
			a: fmtTime(statsA.time, true),
			b: fmtTime(statsB.time, true),
			delta: signedDelta(timeDelta, 1) + ' s',
			deltaClass: timeDeltaCell(timeDelta)
		});

		const paceDelta = statsA.pace - statsB.pace;
		rows.push({
			key: 'pace',
			a: fmtPace(statsA.pace),
			b: fmtPace(statsB.pace),
			delta: signedDelta(paceDelta, 1),
			deltaClass: paceDeltaCell(paceDelta)
		});

		if (statsA.avgWatts > 0 || statsB.avgWatts > 0) {
			const d = statsA.avgWatts - statsB.avgWatts;
			rows.push({
				key: 'avgPower',
				a: `${statsA.avgWatts} W`,
				b: `${statsB.avgWatts} W`,
				delta: signedDelta(d, 0) + ' W',
				deltaClass: d > 0 ? 'good' : d < 0 ? 'bad' : ''
			});
		}

		if (statsA.best5sPower > 0 || statsB.best5sPower > 0) {
			const d = statsA.best5sPower - statsB.best5sPower;
			rows.push({
				key: 'best5sPower',
				a: `${statsA.best5sPower} W`,
				b: `${statsB.best5sPower} W`,
				delta: signedDelta(d, 0) + ' W',
				deltaClass: d > 0 ? 'good' : d < 0 ? 'bad' : ''
			});
		}

		if (statsA.avgHr != null || statsB.avgHr != null) {
			const d = (statsA.avgHr ?? 0) - (statsB.avgHr ?? 0);
			rows.push({
				key: 'avgHr',
				a: statsA.avgHr != null ? `${statsA.avgHr}` : '—',
				b: statsB.avgHr != null ? `${statsB.avgHr}` : '—',
				delta: statsA.avgHr != null && statsB.avgHr != null ? signedDelta(d, 0) : '—',
				deltaClass: ''
			});
		}

		const dpsDelta = statsA.avgDps - statsB.avgDps;
		rows.push({
			key: 'dps',
			a: `${statsA.avgDps.toFixed(2)} m`,
			b: `${statsB.avgDps.toFixed(2)} m`,
			delta: signedDelta(dpsDelta, 2) + ' m',
			deltaClass: dpsDelta > 0 ? 'good' : dpsDelta < 0 ? 'bad' : ''
		});

		const consDelta = statsA.paceConsistency - statsB.paceConsistency;
		rows.push({
			key: 'consistency',
			a: `${statsA.paceConsistency.toFixed(1)}%`,
			b: `${statsB.paceConsistency.toFixed(1)}%`,
			delta: signedDelta(consDelta, 1) + '%',
			deltaClass: consDelta < 0 ? 'good' : consDelta > 0 ? 'bad' : ''
		});

		return rows;
	});

	const statLabel: Record<string, string> = {
		time: 'compare.statTime',
		pace: 'compare.statPace',
		avgPower: 'compare.statAvgPower',
		best5sPower: 'compare.statBest5sPower',
		avgHr: 'compare.statAvgHr',
		dps: 'compare.statDps',
		consistency: 'compare.statConsistency'
	};
</script>

<svelte:head><title>{t('compare.title')} · rowplay</title></svelte:head>

<div class="container">
	<a href="/dashboard" class="back muted"><ArrowLeft size={14} /> {t('compare.back')}</a>

	<div class="head">
		<h1><GitCompare size={26} /> {t('compare.title')}</h1>
		<p class="muted lead">{t('compare.lead')}</p>
	</div>

	<div class="card picker">
		<div class="pickrow">
			<label>
				<span class="lbl">{t('compare.workoutA')}</span>
				<select bind:value={pickA}>
					<option value="">{t('compare.choose')}</option>
					{#each data.workouts as w (w.id)}
						<option value={String(w.id)}>{workoutLabel(w)}</option>
					{/each}
				</select>
			</label>
			<label>
				<span class="lbl">{t('compare.workoutB')}</span>
				<select bind:value={pickB}>
					<option value="">{t('compare.choose')}</option>
					{#each data.workouts as w (w.id)}
						<option value={String(w.id)}>{workoutLabel(w)}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="pickactions">
			<button class="btn" type="button" disabled={!pickA || !pickB || pickA === pickB} onclick={applyCompare}>
				{t('compare.run')}
			</button>
			{#if detailA && detailB}
				<button class="btn ghost" type="button" onclick={swapWorkouts}>{t('compare.swap')}</button>
			{/if}
		</div>
	</div>

	{#if detailA && detailB}
		<div class="summaries">
			{#each [{ d: detailA, side: 'a' }, { d: detailB, side: 'b' }] as { d, side }}
				<div class="card summary">
					<div class="sumhead">
						<span class="badge" class:a={side === 'a'} class:b={side === 'b'}>
							{side === 'a' ? t('compare.workoutA') : t('compare.workoutB')}
						</span>
						<span class="h1icon" style:color={MACHINE_COLOR[d.sport]}
							><SportIcon sport={d.sport} size={20} /></span
						>
						<strong>{d.workoutType || SPORT_LABEL[d.sport]}</strong>
					</div>
					<p class="muted mono meta">
						{fmtLogbookDateTime(d.date)} · {fmtDistance(d.distance)} · {fmtTime(d.time, true)} ·
						{fmtPace(d.pace)}
					</p>
					<a class="replaylink" href="/replay/{d.id}">{t('common.replay')} →</a>
				</div>
			{/each}
		</div>

		{#if detailA.sport !== detailB.sport}
			<div class="sportwarn card">{t('compare.crossSport')}</div>
		{/if}

		{#if verdict}
			<div
				class="verdict card"
				class:good={verdict.winner === 'a'}
				class:bad={verdict.winner === 'b'}
			>
				{#if verdict.winner === 'tie'}
					<MoveRight size={18} />
				{:else if verdict.winner === 'a'}
					<TrendingUp size={18} />
				{:else}
					<TrendingDown size={18} />
				{/if}
				<div>
					<strong>{winnerLabel(verdict.winner)}</strong>
					<span class="muted">{verdictText(verdict)}</span>
				</div>
			</div>
		{/if}

		{#if overlay}
			<p class="muted align-note">
				{t('compare.alignedNote', { distance: fmtDistance(overlay.alignedMetres) })}
			</p>
			<div class="charts">
				<div class="card">
					<div class="ctitle muted">{t('replay.cPace')} · {t('compare.vsDistance')}</div>
					<UPlotChart
						data={paceData!}
						options={paceOpts}
						height={200}
						caption={`${t('replay.cPace')} · ${t('compare.vsDistance')} · ${labelA} / ${labelB}`}
					/>
				</div>
				<div class="card">
					<div class="ctitle muted">{t('replay.cPower')} · {t('compare.vsDistance')}</div>
					<UPlotChart
						data={powerData!}
						options={powerOpts}
						height={200}
						caption={`${t('replay.cPower')} · ${t('compare.vsDistance')} · ${labelA} / ${labelB}`}
					/>
				</div>
				{#if hasHr}
					<div class="card">
						<div class="ctitle muted">{t('replay.cHeart')} · {t('compare.vsDistance')}</div>
						<UPlotChart
							data={hrData!}
							options={hrOpts}
							height={200}
							caption={`${t('replay.cHeart')} · ${t('compare.vsDistance')} · ${labelA} / ${labelB}`}
						/>
					</div>
				{/if}
			</div>
		{:else}
			<p class="muted card empty">{t('compare.noStrokeData')}</p>
		{/if}

		{#if statRows.length}
			<div class="card tablecard">
				<h2 class="sectitle">{t('compare.deltaTable')}</h2>
				<p class="muted hint">{t('compare.deltaHint')}</p>
				<div class="tablewrap">
					<table class="deltatable">
						<thead>
							<tr>
								<th>{t('compare.statMetric')}</th>
								<th>{labelA}</th>
								<th>{labelB}</th>
								<th>{t('compare.statDelta')}</th>
							</tr>
						</thead>
						<tbody>
							{#each statRows as row (row.key)}
								<tr>
									<td>{t(statLabel[row.key])}</td>
									<td class="mono">{row.a}</td>
									<td class="mono">{row.b}</td>
									<td class="mono delta" class:good={row.deltaClass === 'good'} class:bad={row.deltaClass === 'bad'}>
										{row.delta}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		{#if intervalRows?.length}
			<div class="card tablecard">
				<h2 class="sectitle">{t('compare.intervalTitle')}</h2>
				<p class="muted hint">{t('compare.intervalHint')}</p>
				<div class="tablewrap">
					<table class="deltatable">
						<thead>
							<tr>
								<th>#</th>
								<th>{labelA} {t('replay.thPace')}</th>
								<th>{labelB} {t('replay.thPace')}</th>
								<th>{t('compare.statDelta')}</th>
								<th>{t('compare.repTimeDelta')}</th>
							</tr>
						</thead>
						<tbody>
							{#each intervalRows as row (row.index)}
								<tr>
									<td class="mono">{row.index}</td>
									<td class="mono">{fmtPace(row.paceA)}</td>
									<td class="mono">{fmtPace(row.paceB)}</td>
									<td
										class="mono delta"
										class:good={paceDeltaCell(row.paceDelta) === 'good'}
										class:bad={paceDeltaCell(row.paceDelta) === 'bad'}
									>
										{signedDelta(row.paceDelta, 1)}
									</td>
									<td
										class="mono delta"
										class:good={timeDeltaCell(row.timeDelta) === 'good'}
										class:bad={timeDeltaCell(row.timeDelta) === 'bad'}
									>
										{signedDelta(row.timeDelta, 1)} s
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{:else}
		<p class="muted pickhint">{t('compare.pickTwo')}</p>
	{/if}
</div>

<style>
	.head {
		margin: 1rem 0 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: var(--bd-heavy);
	}
	.head h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: clamp(1.5rem, 6vw, 2.1rem);
		font-weight: 900;
		text-transform: uppercase;
	}
	.lead {
		margin-top: 0.35rem;
		max-width: 42rem;
	}
	.picker {
		padding: 1rem 1.1rem;
		margin-bottom: 1.25rem;
	}
	.pickrow {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.lbl {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}
	select {
		font-family: var(--mono);
		font-size: 0.85rem;
		padding: 0.45rem 0.5rem;
		border: var(--bd);
		border-radius: var(--r-ctrl);
		background: var(--paper-raised);
		color: var(--ink);
	}
	.pickactions {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.85rem;
		flex-wrap: wrap;
	}
	.summaries {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.85rem;
		margin-bottom: 1rem;
	}
	.summary {
		padding: 0.85rem 1rem;
	}
	.sumhead {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.badge {
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: var(--r-ctrl);
		border: var(--bd);
	}
	.badge.a {
		background: color-mix(in srgb, var(--live) 12%, transparent);
		color: var(--live);
	}
	.badge.b {
		background: color-mix(in srgb, var(--ghost) 12%, transparent);
		color: var(--ghost);
	}
	.meta {
		font-size: 0.82rem;
		margin: 0.35rem 0;
	}
	.replaylink {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.verdict {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		padding: 0.85rem 1rem;
		margin-bottom: 1rem;
		border-left: 4px solid var(--ink-3);
	}
	.verdict.good {
		border-left-color: var(--good);
		background: color-mix(in srgb, var(--good) 8%, var(--paper-raised));
	}
	.verdict.bad {
		border-left-color: var(--bad);
		background: color-mix(in srgb, var(--bad) 8%, var(--paper-raised));
	}
	.verdict strong {
		display: block;
	}
	.sportwarn {
		padding: 0.7rem 1rem;
		margin-bottom: 1rem;
		border-left: 4px solid var(--warn, #f0ad4e);
		background: color-mix(in srgb, var(--warn, #f0ad4e) 10%, var(--paper-raised));
		font-size: 0.9rem;
		color: var(--ink-2);
	}
	.align-note {
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}
	.charts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.85rem;
		margin-bottom: 1.25rem;
	}
	.charts .card:only-child,
	.charts .card:last-child:nth-child(odd) {
		grid-column: 1 / -1;
	}
	.ctitle {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		margin-bottom: 0.35rem;
		padding: 0.65rem 0.75rem 0;
	}
	.sectitle {
		font-size: 1rem;
		font-weight: 800;
		text-transform: uppercase;
		margin: 0 0 0.25rem;
	}
	.hint {
		font-size: 0.82rem;
		margin-bottom: 0.75rem;
	}
	.tablecard {
		padding: 1rem;
		margin-bottom: 1rem;
	}
	.tablewrap {
		overflow-x: auto;
	}
	.deltatable {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}
	.deltatable th,
	.deltatable td {
		padding: 0.45rem 0.6rem;
		text-align: left;
		border-bottom: var(--bd);
	}
	.deltatable th {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}
	.delta.good {
		color: var(--good);
		font-weight: 600;
	}
	.delta.bad {
		color: var(--bad);
		font-weight: 600;
	}
	.empty,
	.pickhint {
		padding: 1rem;
		text-align: center;
	}
	@media (max-width: 760px) {
		.pickrow,
		.summaries,
		.charts {
			grid-template-columns: 1fr;
		}
	}
</style>
