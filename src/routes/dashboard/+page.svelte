<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import WorkoutList from '$components/WorkoutList.svelte';
	import WorkoutListFilters from '$components/WorkoutListFilters.svelte';
	import TrainingHeatmap from '$components/TrainingHeatmap.svelte';
	import EngagementPanel from '$components/EngagementPanel.svelte';
	import CriticalPowerPanel from '$components/CriticalPowerPanel.svelte';
	import SportIcon from '$components/SportIcon.svelte';
	import { fmtDate, fmtDateFromEpochMillis, fmtDistance, fmtPace, fmtPaceBare, fmtTime, SPORT_LABEL } from '$lib/format';
	import { logbookEpochMillis } from '$lib/datetime';
	import {
		distanceBand,
		distancePBs,
		detectNewPBs,
		distancePerStroke,
		pbWorkoutIds,
		linearTrend,
		summariseBySport,
		trainingLoad,
		type FormBand
	} from '$lib/analytics';
	import type { Sport, Workout } from '$lib/types';
	import { MACHINE_COLOR } from '$lib/replay/sports';
	import { goto, invalidateAll } from '$app/navigation';
	import { serializeWorkoutListQuery, type WorkoutListQuery } from '$lib/workoutQuery';
	import { toast } from 'svelte-sonner';
	import { RefreshCw, TrendingUp, TrendingDown, MoveRight, Play, Activity } from '@lucide/svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import { chartTheme, baseOptions } from '$lib/chartTheme';

	// Static lookup — never changes, shared across instances.
	const formBandClass: Record<FormBand, string> = {
		transition: 'info',
		fresh: 'good',
		neutral: 'neutral',
		productive: 'accent',
		overreaching: 'bad'
	};

	let { data } = $props();
	const t = getI18nContext().t;
	const uiTheme = getThemeContext();
	const workouts = $derived<Workout[]>(data.workouts);
	const listWorkouts = $derived<Workout[]>(data.listWorkouts);
	const listQuery = $derived(data.listQuery);

	const sportFilter = $derived<Sport | 'all'>(listQuery.sport ?? 'all');

	const workoutTypes = $derived(
		[...new Set(workouts.map((w) => w.workoutType).filter((t): t is string => !!t))].sort()
	);

	function applyListQuery(q: WorkoutListQuery) {
		const params = serializeWorkoutListQuery(q);
		const qs = params.toString();
		goto(qs ? `/dashboard?${qs}` : '/dashboard', {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function setSportFilter(s: Sport | 'all') {
		applyListQuery({ ...listQuery, sport: s === 'all' ? undefined : s });
	}
	type Metric = 'pace' | 'distance' | 'spm' | 'dps';
	let metric = $state<Metric>('pace');
	// Selected distance band for pace/DPS trends; '' = auto (most-rowed band).
	let bandKey = $state<string>('');

	let syncing = $state(false);
	let compareAnchor = $state<number | null>(null);
	let newPbIds = $state<Set<number>>(new Set());
	const pbIds = $derived(pbWorkoutIds(workouts));

	function onCompareWorkout(w: Workout) {
		if (compareAnchor == null) {
			compareAnchor = w.id;
			toast.message(t('workoutList.comparePick'));
			return;
		}
		if (compareAnchor === w.id) {
			compareAnchor = null;
			return;
		}
		const a = compareAnchor;
		const b = w.id;
		compareAnchor = null;
		goto(`/compare?a=${a}&b=${b}`);
	}
	async function sync() {
		if (syncing) return;
		syncing = true;
		const toastId = toast.loading(t('sync.loading'));
		const pbsBefore = distancePBs(workouts);
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
			const body = (await res.json()) as {
				added: number;
				total: number;
				newPbs?: ReturnType<typeof distancePBs>;
			};
			await invalidateAll();
			toast.success(t('sync.done', { added: body.added, total: body.total }), { id: toastId });
			const newPbs =
				body.newPbs?.length ? body.newPbs : detectNewPBs(pbsBefore, distancePBs(workouts));
			if (newPbs.length === 1) {
				const pb = newPbs[0];
				const dist = pb.distance >= 1000 ? `${pb.distance / 1000}k` : `${pb.distance}m`;
				toast.success(t('dashboard.pbCelebrate', { distance: dist, time: fmtTime(pb.time, true) }));
			} else if (newPbs.length > 1) {
				toast.success(t('dashboard.pbCelebrateMore', { count: newPbs.length }));
			}
			newPbIds = new Set(
				newPbs
					.map((pb) =>
						workouts.find(
							(w) =>
								w.sport === pb.sport &&
								Math.abs(w.distance - pb.distance) <= pb.distance * 0.02 &&
								w.time === pb.time
						)?.id
					)
					.filter((id): id is number => id != null)
			);
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
		return logbookEpochMillis(w.date);
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

	const bySport = $derived.by(() => {
		const agg = data.aggregates?.bySport;
		if (!agg?.length) return summariseBySport(filtered);
		return sportFilter === 'all' ? agg : agg.filter((s) => s.sport === sportFilter);
	});

	const pbs = $derived.by(() => {
		const agg = data.aggregates?.pbs;
		if (!agg?.length) return distancePBs(filtered);
		if (sportFilter !== 'all') return agg.filter((pb) => pb.sport === sportFilter);
		const best = new Map<number, (typeof agg)[0]>();
		for (const pb of agg) {
			const cur = best.get(pb.distance);
			if (!cur || pb.pace < cur.pace) best.set(pb.distance, pb);
		}
		return [...best.values()];
	});

	const totalMeters = $derived(bySport.reduce((s, r) => s + r.distance, 0));
	const totalTime = $derived(bySport.reduce((s, r) => s + r.time, 0));
	const avgPace = $derived(totalMeters > 0 ? totalTime / (totalMeters / 500) : 0);

	// ---- Fitness & Freshness (Performance Management Chart) ----
	// Whole-athlete training load — independent of the sport filter, since form
	// is systemic. Needs ~2 weeks of history before it reads meaningfully.
	const load = $derived(trainingLoad(workouts));
	const formReady = $derived(!!load && load.series.length >= 14);
	const bandLabel: Record<FormBand, string> = $derived({
		transition: t('dashboard.bandTransition'),
		fresh: t('dashboard.bandFresh'),
		neutral: t('dashboard.bandNeutral'),
		productive: t('dashboard.bandProductive'),
		overreaching: t('dashboard.bandOverreaching')
	});
	const bandDesc: Record<FormBand, string> = $derived({
		transition: t('dashboard.descTransition'),
		fresh: t('dashboard.descFresh'),
		neutral: t('dashboard.descNeutral'),
		productive: t('dashboard.descProductive'),
		overreaching: t('dashboard.descOverreaching')
	});
	const formData = $derived.by((): uPlot.AlignedData => {
		// Match the series count in formOptions (x + 3) so uPlot never sees a
		// shape it can't render, even in the empty state.
		if (!load) return [[], [], [], []];
		return [
			load.series.map((p) => p.day / 1000),
			load.series.map((p) => p.ctl),
			load.series.map((p) => p.atl),
			load.series.map((p) => p.tsb)
		];
	});
	// Single palette source for every chart on this page; recomputes on theme
	// toggle and reads the live design tokens (see chartTheme).
	const chart = $derived(chartTheme(uiTheme.value));

	// Fitness/fatigue/form (CTL/ATL/TSB) have no dedicated palette tokens; they
	// deliberately borrow dps (blue) / power (amber) / ahead (green) for three
	// distinct, on-brand hues. The matching stat readouts below reuse the same
	// borrow. If a dedicated token is ever wanted, add a role rather than inlining
	// hex. (Same borrowing applies to trendOptions and CriticalPowerPanel.)
	const formOptions = $derived.by(() =>
		baseOptions({
			theme: chart,
			time: true,
			yAxes: [
				{ scale: 'y', size: 40 },
				{ scale: 'tsb', side: 1, size: 40, grid: false }
			],
			series: [
				{ label: t('dashboard.formChartFitness'), role: 'dps', width: 2, fill: true, scale: 'y' },
				{ label: t('dashboard.formChartFatigue'), role: 'power', width: 1.5, scale: 'y' },
				{ label: t('dashboard.formChartForm'), role: 'ahead', width: 1.5, dash: [4, 3], scale: 'tsb' }
			]
		})
	);
	const signed = (n: number) => {
		// Round before testing the sign so a value like −0.1 doesn't render as "−0".
		const r = Math.round(n);
		return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}`;
	};

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

	function metricFmt(v: number) {
		switch (metric) {
			case 'pace':
				return fmtPaceBare(v);
			case 'distance':
				return fmtDistance(v);
			case 'dps':
				return `${v.toFixed(1)}m`;
			default:
				return `${Math.round(v)}`;
		}
	}

	function metricChangeFmt(better: boolean, delta: number) {
		if (metric === 'pace') {
			return t(better ? 'dashboard.faster' : 'dashboard.slower', { delta: fmtPaceBare(delta, true) });
		}
		const sign = better ? '+' : '−';
		const suffix = metric === 'dps' ? '/stroke' : '';
		return `${sign}${metricFmt(delta)}${suffix}`;
	}

	const trendOptions = $derived.by(() => {
		// pace/dps map to their own tokens; distance borrows ahead (green) and rate
		// (spm) borrows the rate token — see the formOptions note on borrowing.
		const role =
			metric === 'pace' ? 'pace' : metric === 'distance' ? 'ahead' : metric === 'dps' ? 'dps' : 'rate';
		return baseOptions({
			theme: chart,
			time: true,
			yAxes: [{ size: 56, fmt: metricFmt, invert: metric === 'pace' }],
			series: [
				{ label: metric, role, width: 2, points: 5 },
				{ label: 'trend', role: 'fit', width: 1.5, dash: [6, 4] }
			]
		});
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
		const change = metricChangeFmt(verdict.better, verdict.delta);
		return t(verdict.better ? 'dashboard.improving' : 'dashboard.slipping', { change, days });
	});
</script>

<div class="container">
	<div class="head">
		<div>
			<p class="eyebrow">{t('dashboard.eyebrow')}</p>
			<h1>{t('dashboard.title')}</h1>
		</div>
		<div class="headright">
			<div class="filters" role="group" aria-label="Sport filter">
				{#each sports as s}
					<button class="chip" class:on={sportFilter === s} aria-pressed={sportFilter === s} onclick={() => setSportFilter(s)}>
						{s === 'all' ? t('dashboard.all') : SPORT_LABEL[s]}
					</button>
				{/each}
			</div>
			{#if !data.demo}
				<button class="btn btn-ghost btn-sm sync" onclick={sync} disabled={syncing}>
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
				date: fmtDateFromEpochMillis(data.sync.lastSyncAt)
			})}
		</p>
	{:else if !data.demo && !data.sync}
		<p class="syncnote muted">{t('dashboard.recentNote')}</p>
	{/if}

	<!-- Latest session: pace front and centre -->
	{#if latest}
		<a class="card latest" href="/replay/{latest.id}">
			<div class="herolead">
				<div class="herotop muted">
					<span class="hicon" style:color={MACHINE_COLOR[latest.sport]}
						><SportIcon sport={latest.sport} size={16} /></span
					>
					{t('dashboard.latest')} · {latest.workoutType || SPORT_LABEL[latest.sport]} · {fmtDate(latest.date)}
				</div>
				<div class="heropace mono">{fmtPaceBare(latest.pace)}<span class="perunit">/500m</span></div>
				{#if paceDelta != null}
					<div class="herodelta" class:faster={paceDelta < 0} class:slower={paceDelta > 0}>
						{paceDelta < 0 ? '▼' : '▲'}
						{fmtPaceBare(Math.abs(paceDelta), true)}
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
			<div class="herocta badge badge-primary"><Play size={12} /> {t('common.replay')}</div>
		</a>
	{/if}

	<div class="stats">
		<div class="card stat">
			<div class="muted label">{t('dashboard.sessions')}</div>
			<div class="value mono">{bySport.reduce((s, r) => s + r.sessions, 0)}</div>
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

	<EngagementPanel
		workouts={workouts}
		annualGoal={data.annualGoal}
		goalYear={data.goalYear}
		endDay={data.calendarEndDay}
	/>

	{#if filtered.length}
		<TrainingHeatmap workouts={filtered} endDay={data.calendarEndDay} />
	{/if}

	<!-- Fitness & Freshness — the Performance Management Chart -->
	<CriticalPowerPanel workouts={workouts} />

	{#if load}
		<div class="card formcard">
			<div class="formhead">
				<div class="formtitle">
					<Activity size={18} />
					<span class="label">{t('dashboard.formTitle')}</span>
					<span class="badge badge-primary">{t('dashboard.formPremium')}</span>
				</div>
				<span class="badge {formBandClass[load.band]}">{bandLabel[load.band]}</span>
			</div>
			<p class="formsub muted">{t('dashboard.formSub')}</p>

			<div class="formstats">
				<div class="fs">
					<div class="fsv mono" style="color: var(--dps)">{Math.round(load.ctl)}</div>
					<div class="fsl">{t('dashboard.formFitness')}</div>
					<div class="fsh muted">{t('dashboard.formFitnessHint')}</div>
				</div>
				<div class="fs">
					<div class="fsv mono" style="color: var(--power)">{Math.round(load.atl)}</div>
					<div class="fsl">{t('dashboard.formFatigue')}</div>
					<div class="fsh muted">{t('dashboard.formFatigueHint')}</div>
				</div>
				<div class="fs">
					<div class="fsv mono {formBandClass[load.band]}">{signed(load.tsb)}</div>
					<div class="fsl">{t('dashboard.formForm')}</div>
					<div class="fsh muted">{t('dashboard.formFormHint')}</div>
				</div>
				<div class="fs">
					<div class="fsv mono">{load.ftp}<span class="unit">W</span></div>
					<div class="fsl">{t('dashboard.formFtp')}</div>
					<div class="fsh muted">
						{load.cp.method === 'model' ? t('dashboard.formModelled') : t('dashboard.formEstimated')}
						{#if load.cp.wPrime > 0} · W′ {(load.cp.wPrime / 1000).toFixed(1)}kJ{/if}
					</div>
				</div>
			</div>

			<div class="formread {formBandClass[load.band]}">
				<strong>{bandLabel[load.band]}.</strong>
				{bandDesc[load.band]}
				{#if formReady}
					<span class="muted">· {t('dashboard.formRamp')}: {signed(load.ramp)}</span>
				{/if}
			</div>

			{#if formReady}
				<UPlotChart
					data={formData}
					options={formOptions}
					height={190}
					caption={`${t('dashboard.formChartFitness')} · ${t('dashboard.formChartFatigue')} · ${t('dashboard.formChartForm')}`}
					description={`${bandLabel[load.band]}. ${bandDesc[load.band]}`}
				/>
				<div class="formlegend muted">
					<span><i style="background: var(--dps)"></i> {t('dashboard.formChartFitness')}</span>
					<span><i style="background: var(--power)"></i> {t('dashboard.formChartFatigue')}</span>
					<span><i style="background: var(--ahead)"></i> {t('dashboard.formChartForm')}</span>
				</div>
			{:else}
				<p class="muted emptytrend">{t('dashboard.formEmpty')}</p>
			{/if}
		</div>
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
			<div class="tablescroll">
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
				<div class="metrics" role="group" aria-label="Metric filter">
					{#each metrics as m}
						<button class="mchip" class:on={metric === m.id} aria-pressed={metric === m.id} onclick={() => (metric = m.id)}>{t(m.labelKey)}</button>
					{/each}
				</div>
			</div>

			{#if bandScoped && bands.length > 1}
				<div class="bands" role="group" aria-label="Distance band">
					{#each bands as b}
						<button
							class="bchip"
							class:on={activeBand === b.key}
							aria-pressed={activeBand === b.key}
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
				<UPlotChart
					data={trend}
					options={trendOptions}
					height={190}
					caption={t('dashboard.trendTitle')}
					description={verdictText}
				/>
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

	<WorkoutListFilters
		query={listQuery}
		{workoutTypes}
		resultCount={listWorkouts.length}
		onchange={applyListQuery}
		onclear={() => applyListQuery({ sport: listQuery.sport, sort: 'date', dir: 'desc' })}
	/>
	{#if compareAnchor != null}
		<p class="compare-hint card muted">
			{t('workoutList.comparePick')}
			<button type="button" class="linkish" onclick={() => (compareAnchor = null)}>{t('workoutList.compareCancel')}</button>
		</p>
	{/if}
	<WorkoutList workouts={listWorkouts} {compareAnchor} onCompare={onCompareWorkout} pbIds={pbIds} newPbIds={newPbIds} />
</div>

<style>
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.5rem;
		padding-bottom: 0.75rem;
		border-bottom: var(--bd-heavy);
	}
	.head h1 {
		font-size: clamp(1.7rem, 7vw, 2.4rem);
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: -0.02em;
		margin-top: 0.15rem;
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
	.mchip,
	.bchip {
		background: var(--paper-raised);
		border: var(--bd-heavy);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.35rem 0.85rem;
		font-family: var(--display);
		font-size: 0.85rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		cursor: pointer;
	}
	.chip.on,
	.mchip.on,
	.bchip.on {
		background: var(--ink);
		color: var(--paper-raised);
		border-color: var(--ink);
	}
	.latest {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 1.5rem;
		color: var(--ink);
		margin-bottom: 1rem;
		box-shadow: var(--stamp-live);
		transition:
			transform 0.05s ease,
			box-shadow 0.05s ease;
	}
	.latest:hover {
		text-decoration: none;
		transform: translateY(-2px);
		box-shadow: var(--shadow-lg);
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
	}
	.heropace {
		font-family: var(--display);
		font-size: var(--clock-size);
		font-weight: 900;
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
		color: var(--ahead);
		font-family: var(--mono);
	}
	.herodelta.slower {
		color: var(--behind);
		font-family: var(--mono);
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
	.chartcard,
	.formcard {
		margin-bottom: 1rem;
	}
	.formcard {
		background: linear-gradient(135deg, color-mix(in srgb, var(--ghost) 8%, var(--paper-raised)), var(--bg-elev) 65%);
		border-color: color-mix(in srgb, var(--ghost) 30%, var(--bg-elev));
	}
	.formhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.formtitle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--accent);
	}
	.formtitle .label {
		color: var(--text);
		font-weight: 700;
		font-size: 0.95rem;
	}
	.premium {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: color-mix(in srgb, var(--behind) 16%, var(--paper-raised));
		color: color-mix(in srgb, var(--behind) 45%, var(--ink));
		border: 1px solid color-mix(in srgb, var(--behind) 40%, var(--paper-raised));
	}
	.formsub {
		font-size: 0.82rem;
		margin: 0.4rem 0 0.9rem;
	}
	.badge {
		font-size: 0.78rem;
		font-weight: 700;
		padding: 0.25rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--bg-elev-2);
		color: var(--text);
	}
	.badge.good,
	.fsv.good {
		color: var(--accent-2);
	}
	.badge.good {
		background: color-mix(in srgb, var(--accent-2) 14%, var(--paper-raised));
		border-color: color-mix(in srgb, var(--accent-2) 40%, var(--paper-raised));
	}
	.badge.bad,
	.fsv.bad {
		/* Raw --warn is ~2.6:1 on its pale tint; darken toward --ink like .premium (theme-aware). */
		color: color-mix(in srgb, var(--warn) 45%, var(--ink));
	}
	.badge.bad {
		background: color-mix(in srgb, var(--warn) 14%, var(--paper-raised));
		border-color: color-mix(in srgb, var(--warn) 40%, var(--paper-raised));
	}
	.badge.accent,
	.fsv.accent {
		color: var(--accent);
	}
	.badge.accent {
		background: color-mix(in srgb, var(--accent) 14%, var(--paper-raised));
		border-color: color-mix(in srgb, var(--accent) 40%, var(--paper-raised));
	}
	.badge.info,
	.fsv.info {
		color: var(--ghost);
	}
	.badge.info {
		background: color-mix(in srgb, var(--ghost) 14%, var(--paper-raised));
		border-color: color-mix(in srgb, var(--ghost) 40%, var(--paper-raised));
	}
	.badge.neutral,
	.fsv.neutral {
		color: var(--text-dim);
	}
	.formstats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
		margin-bottom: 0.9rem;
	}
	.fs {
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.6rem 0.75rem;
	}
	.fsv {
		font-size: 1.7rem;
		font-weight: 800;
		line-height: 1.05;
	}
	.fsv .unit {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-dim);
		margin-left: 0.15rem;
	}
	.fsl {
		font-size: 0.82rem;
		font-weight: 700;
		margin-top: 0.15rem;
	}
	.fsh {
		font-size: 0.7rem;
		margin-top: 0.05rem;
	}
	.formread {
		font-size: 0.9rem;
		padding: 0.55rem 0.8rem;
		border-radius: 8px;
		margin-bottom: 0.9rem;
		background: var(--bg-elev-2);
		border-left: 3px solid var(--border);
	}
	.formread.good {
		border-left-color: var(--accent-2);
	}
	.formread.bad {
		border-left-color: var(--warn);
	}
	.formread.accent {
		border-left-color: var(--accent);
	}
	.formread.info {
		border-left-color: var(--ghost);
	}
	.formlegend {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.78rem;
		margin-top: 0.5rem;
		justify-content: center;
	}
	.formlegend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.formlegend i {
		width: 12px;
		height: 3px;
		border-radius: 2px;
		display: inline-block;
	}
	.pbgrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.75rem;
		margin-top: 0.6rem;
	}
	.pb {
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: var(--r-ctrl);
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
	}
	.tablescroll {
		overflow-x: auto;
		margin-top: 0.4rem;
	}
	.breakdown table {
		width: 100%;
		min-width: max-content;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.breakdown th {
		text-align: left;
		color: var(--ink-2);
		font-weight: 600;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.3rem 0.5rem;
		border-bottom: var(--bd);
	}
	.breakdown td {
		padding: 0.35rem 0.5rem;
		border-bottom: var(--bd);
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
		font-family: var(--display);
		font-size: 0.95rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.5rem 0.8rem;
		border-radius: var(--r-ctrl);
		margin-bottom: 0.75rem;
		background: var(--paper-inset);
		border: var(--bd);
		color: var(--ink);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.verdict.good {
		border-color: var(--ahead);
		color: var(--ahead);
	}
	.verdict.bad {
		border-color: var(--behind);
		color: var(--alarm);
	}
	.compare-hint {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.85rem;
		margin-bottom: 0.65rem;
		font-size: 0.88rem;
	}
	.linkish {
		background: none;
		border: none;
		color: var(--live);
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
		font-size: inherit;
	}
	@media (max-width: 720px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.latest {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}
		.heropace {
			font-size: 2.6rem;
		}
		.herometrics {
			gap: 1.25rem;
		}
		.head {
			flex-direction: column;
			align-items: stretch;
		}
		.headright {
			width: 100%;
		}
		.filters {
			flex-wrap: wrap;
		}
		.formhead {
			flex-wrap: wrap;
			gap: 0.5rem;
		}
	}
	@media (max-width: 400px) {
		.stats {
			gap: 0.6rem;
		}
		.stat .value {
			font-size: 1.25rem;
		}
		.fsv {
			font-size: 1.35rem;
		}
	}
	@media (max-width: 390px) {
		.chip,
		.mchip,
		.bchip {
			padding: 0.3rem 0.55rem;
			font-size: 0.75rem;
		}
		.heropace {
			font-size: 2.2rem;
		}
		.herometrics {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 0.75rem;
		}
		.pbgrid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
