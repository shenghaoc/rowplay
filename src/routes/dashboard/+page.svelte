<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import { base } from '$app/paths';
	import WorkoutList from '$components/WorkoutList.svelte';
	import WorkoutListFilters from '$components/WorkoutListFilters.svelte';
	import TrainingHeatmap from '$components/TrainingHeatmap.svelte';
	import TrainingIntensityChart from '$components/TrainingIntensityChart.svelte';
	import EngagementPanel from '$components/EngagementPanel.svelte';
	import MilestonesPanel from '$components/MilestonesPanel.svelte';
	import CriticalPowerPanel from '$components/CriticalPowerPanel.svelte';
	import PerformancePredictorCard from '$components/PerformancePredictorCard.svelte';
	import SportIcon from '$components/SportIcon.svelte';
	import { fmtDate, fmtDateFromEpochMillis, fmtDistance, fmtPace, fmtPaceBare, fmtTime, SPORT_LABEL } from '$lib/format';
	import {
		distanceBand,
		distancePBs,
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
	import { onMount } from 'svelte';
	import { readHomeTimezoneClient } from '$lib/homeTimezone';
	import { serializeWorkoutListQuery, filterAndSortWorkouts, type WorkoutListQuery } from '$lib/workoutQuery';
	import { WORKOUT_TAGS } from '$lib/workoutTag';
	import ChipButton from '$components/ChipButton.svelte';
	import ChipGroup from '$components/ChipGroup.svelte';
	import { toast } from 'svelte-sonner';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import Play from '@lucide/svelte/icons/play';
	import Activity from '@lucide/svelte/icons/activity';
	import X from '@lucide/svelte/icons/x';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import { chartTheme, baseOptions } from '$lib/chartTheme';
	import LiveModePanel from '$components/LiveModePanel.svelte';
	import { LiveMode } from '$lib/liveMode.svelte';
	import { computeMilestones, newlyAchievedMilestones } from '$lib/milestones';
	import {
		dismissDashboardHint,
		dismissFirstRunSurface,
		visibleDashboardHints,
		type DashboardHintId
	} from '$lib/firstRun';

	import { logbookEpochMillis, todayKeyForTz } from '$lib/datetime';
	import { computeDpsTrend, movingAverage } from '$lib/dpsTrend';

	// Static lookup — never changes, shared across instances.
	const formBandClass: Record<FormBand, string> = {
		transition: 'info',
		fresh: 'good',
		neutral: 'neutral',
		productive: 'accent',
		overreaching: 'bad'
	};

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const uiTheme = getThemeContext();
	let extraWorkouts = $state<Workout[]>([]);
	let newEntryIds = $state<Set<number>>(new Set());
	const listQuery = $derived(data.listQuery);
	const workouts = $derived.by(() => {
		const byId = new Map<number, Workout>();
		for (const w of [...extraWorkouts, ...data.workouts]) byId.set(w.id, w);
		return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
	});
	const listWorkouts = $derived.by(() => {
		return filterAndSortWorkouts(
			workouts,
			listQuery,
			listQuery.pbsOnly ? pbWorkoutIds(workouts) : undefined
		);
	});

	let liveMode = $state<LiveMode | null>(null);
	let demoHomeTz = $state<string | undefined>(undefined);
	let dashboardHintIds = $state<DashboardHintId[]>([]);

	const homeTz = $derived(data.demo ? demoHomeTz : data.homeTimezone);

	// In demo mode the server has no access to the client-stored home tz, so it
	// computed data.calendarEndDay/goalYear in UTC. Re-derive on the client once
	// the demo home tz is known so the calendar's right edge and goal year track it.
	const calendarEndDay = $derived(data.demo && homeTz ? todayKeyForTz(homeTz) : data.calendarEndDay);
	const goalYear = $derived(parseInt(calendarEndDay.slice(0, 4), 10));

	const sportFilter = $derived<Sport | 'all'>(listQuery.sport ?? 'all');

	const workoutTypes = $derived.by(() => {
		const types = new Set<string>();
		for (let i = 0; i < workouts.length; i++) {
			const t = workouts[i].workoutType;
			if (t) types.add(t);
		}
		return [...types].sort();
	});

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
	let dpsMetric = $state<'rawDps' | 'normDps'>('rawDps');
	let dpsMaWindow = $state<7 | 28>(28);
	let dpsHoverIdx = $state<number | null>(null);
	let newPbIds = $state<Set<number>>(new Set());
	const pbIds = $derived(pbWorkoutIds(workouts));
	const milestonePBs = $derived(distancePBs(workouts));

	function milestoneOpts() {
		return { endDay: calendarEndDay, homeTz };
	}

	function toastNewMilestones(before: ReturnType<typeof computeMilestones>, merged: Workout[]) {
		const after = computeMilestones(merged, distancePBs(merged), milestoneOpts());
		for (const m of newlyAchievedMilestones(before, after)) {
			toast.success(t(`${m.labelKey}.toast`));
		}
	}

	function handleLiveWorkouts(batch: Workout[], newPbs: ReturnType<typeof distancePBs>) {
		const milestonesBefore = computeMilestones(workouts, distancePBs(workouts), milestoneOpts());
		const toAdd = batch.filter((w) => !workouts.some((x) => x.id === w.id));
		if (toAdd.length) extraWorkouts = [...toAdd, ...extraWorkouts];
		newEntryIds = new Set([...newEntryIds, ...batch.map((w) => w.id)]);
		if (toAdd.length) {
			const byId = new Map<number, Workout>();
			for (const w of [...toAdd, ...workouts]) byId.set(w.id, w);
			toastNewMilestones(milestonesBefore, [...byId.values()]);
		}

		// Global toasts/PB celebrations fire after each live poll; the workout list's
		// own filtering (via listWorkouts) decides what's actually shown.
		if (batch.length === 1) {
			const w = batch[0];
			toast.success(t('liveMode.newWorkout', {
				distance: fmtDistance(w.distance),
				time: fmtTime(w.time, true),
				sport: SPORT_LABEL[w.sport]
			}), {
				duration: 8000,
				action: { label: t('liveMode.view'), onClick: () => goto(`/replay/${w.id}`) }
			});
		} else {
			toast.success(t('liveMode.newWorkouts', { count: batch.length }), { duration: 8000 });
		}

		if (newPbs.length === 1) {
			const pb = newPbs[0];
			const dist = pb.distance >= 1000 ? `${pb.distance / 1000}k` : `${pb.distance}m`;
			toast.success(t('dashboard.pbCelebrate', { distance: dist, time: fmtTime(pb.time, true) }));
		} else if (newPbs.length > 1) {
			toast.success(t('dashboard.pbCelebrateMore', { count: newPbs.length }));
		}

		// The PB was just earned this tick, so its workout is in `batch` — match
		// there rather than scanning all history (faster, no $derived-flush race).
		newPbIds = new Set([
			...newPbIds,
			...newPbs
				.map((pb) =>
					batch.find(
						(w) =>
							w.sport === pb.sport &&
							Math.abs(w.distance - pb.distance) <= pb.distance * 0.02 &&
							w.time === pb.time
					)?.id
				)
				.filter((id): id is number => id != null)
		]);
	}

	onMount(() => {
		if (data.firstRunEligible) dashboardHintIds = visibleDashboardHints();
		if (data.demo) demoHomeTz = readHomeTimezoneClient();
		const lm = new LiveMode(!!data.demo, {
			onWorkouts: handleLiveWorkouts,
			onError: (message, code) => {
				if (code === 401) {
					lm.stop();
					lm.setEnabled(false);
					toast.error(t('liveMode.reauth'));
					return;
				}
				if (code === 429) {
					toast.warning(t('liveMode.rateLimit'));
					return;
				}
				toast.error(t('liveMode.error'), { description: `${message}. ${t('liveMode.errorRetry')}` });
			},
			onRecovered: () => toast.success(t('liveMode.recovered')),
			t
		}, data.workouts.map((w) => w.id));
		liveMode = lm;
		if (lm.enabled) lm.start();
		return () => lm.destroy();
	});

	function dismissHint(id: DashboardHintId) {
		dismissDashboardHint(id);
		dashboardHintIds = dashboardHintIds.filter((hintId) => hintId !== id);
	}

	function dismissDashboardTour() {
		dismissFirstRunSurface('dashboard');
		dashboardHintIds = [];
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

	const dashboardHints = $derived.by(() => {
		const hrefs: Record<DashboardHintId, string> = {
			latestReplay: latest ? `/replay/${latest.id}` : '/dashboard#workouts',
			criticalPower: '/dashboard#critical-power',
			workoutFilters: '/dashboard#workout-filters'
		};
		return dashboardHintIds.map((id) => ({
			id,
			href: hrefs[id],
			title: t(`dashboard.tour.${id}.title`),
			body: t(`dashboard.tour.${id}.body`),
			action: t(`dashboard.tour.${id}.action`)
		}));
	});
	const showDashboardTour = $derived(data.firstRunEligible && dashboardHints.length > 0);

	const heroDps = $derived(
		latest && latest.strokeRate ? distancePerStroke(latest.pace, latest.strokeRate) : 0
	);

	// Pace delta vs the average of the previous same-sport sessions (lower pace
	// is faster, so a negative delta is an improvement).
	const paceDelta = $derived.by(() => {
		if (!latest) return null;
		let count = 0;
		let sum = 0;
		for (let i = 0; i < filtered.length; i++) {
			const w = filtered[i];
			if (w.sport === latest.sport && w.id !== latest.id) {
				count++;
				sum += w.pace;
			}
		}
		if (count === 0) return null;
		const avg = sum / count;
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

	// Unfiltered PBs (all sports) for the performance predictor — ensures the
	// RowErg 2k pre-fill and rower-only comparison always work regardless of the
	// active sport tab.
	const allPbs = $derived(data.aggregates?.pbs ?? distancePBs(workouts));

	// Bolt: Consolidate reductions over bySport into a single pass loop
	const totals = $derived.by(() => {
		let totalMeters = 0;
		let totalTime = 0;
		let totalSessions = 0;
		for (let i = 0; i < bySport.length; i++) {
			totalMeters += bySport[i].distance;
			totalTime += bySport[i].time;
			totalSessions += bySport[i].sessions;
		}
		return { totalMeters, totalTime, totalSessions };
	});
	const totalMeters = $derived(totals.totalMeters);
	const totalTime = $derived(totals.totalTime);
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
		if (!load) return [new Float64Array(0), new Float64Array(0), new Float64Array(0), new Float64Array(0)];
		const xs = new Float64Array(load.series.length);
		const ctl = new Float64Array(load.series.length);
		const atl = new Float64Array(load.series.length);
		const tsb = new Float64Array(load.series.length);
		for (let i = 0; i < load.series.length; i++) {
			const p = load.series[i];
			xs[i] = p.day / 1000;
			ctl[i] = p.ctl;
			atl[i] = p.atl;
			tsb[i] = p.tsb;
		}
		return [xs, ctl, atl, tsb];
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
		const pts: { x: number; y: number }[] = [];
		for (const w of base) {
			const x = workoutEpoch(w);
			const y = metricValue(w, metric);
			if (y != null && isFinite(x)) pts.push({ x, y });
		}
		return pts.sort((a, b) => a.x - b.x);
	});

	const fit = $derived(linearTrend(trendPoints));

	// Verdict over the visible span.
	const verdict = $derived.by(() => {
		if (!fit || trendPoints.length < 3) return null;
		const span = trendPoints[trendPoints.length - 1].x - trendPoints[0].x;
		const days = Math.max(1, span / 86_400_000);
		// Bolt: Calculate minY and maxY using a single-pass loop avoiding intermediate map arrays and spread syntax limits
		let minY = Infinity;
		let maxY = -Infinity;
		for (let i = 0; i < trendPoints.length; i++) {
			const y = trendPoints[i].y;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
		const range = maxY - minY;
		// "Flat" if the modelled change is small relative to session-to-session spread.
		const flat = range === 0 || Math.abs(fit.delta) < range * 0.15;
		const better = lowerIsBetter ? fit.delta < 0 : fit.delta > 0;
		return { flat, better, delta: Math.abs(fit.delta), days, sport: dominantSport };
	});

	const trend = $derived.by((): uPlot.AlignedData => {
		// Bolt: Collapse multiple parallel .map() calls into a single-pass loop
		// over pre-allocated arrays to avoid redundant iterations and GC overhead
		// inside a reactive $derived.by() block.
		const n = trendPoints.length;
		const xs = new Float64Array(n);
		const ys = new Float64Array(n);
		const fitY = Array.from<number | null>({ length: n });

		const hasFit = !!(fit && n >= 2);
		const x0 = hasFit ? trendPoints[0].x : 0;
		const x1 = hasFit ? trendPoints[n - 1].x : 0;
		const span = x1 - x0 || 1;

		for (let i = 0; i < n; i++) {
			const p = trendPoints[i];
			xs[i] = p.x / 1000;
			ys[i] = p.y;
			fitY[i] = hasFit ? fit.y0 + ((fit.y1 - fit.y0) * (p.x - x0)) / span : null;
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

	const dpsPoints = $derived(
		computeDpsTrend(filtered, sportFilter === 'all' ? undefined : sportFilter)
	);
	const dpsMa = $derived(movingAverage(dpsPoints, dpsMetric, dpsMaWindow));
	const dpsHover = $derived(dpsHoverIdx != null ? (dpsPoints[dpsHoverIdx] ?? null) : null);

	const dpsChartData = $derived.by((): uPlot.AlignedData => {
		// Bolt: Collapse multiple parallel .map() calls into a single-pass loop
		// over pre-allocated arrays to avoid redundant array allocations and
		// garbage collection overhead inside a reactive $derived block.
		const n = dpsPoints.length;
		const xs = new Float64Array(n);
		const ys = new Float64Array(n);
		const ma = Array.from<number | null>({ length: n }); // dpsMa has same length as dpsPoints
		for (let i = 0; i < n; i++) {
			xs[i] = logbookEpochMillis(dpsPoints[i].date) / 1000;
			ys[i] = dpsPoints[i][dpsMetric];
			ma[i] = dpsMa[i]?.value ?? null;
		}
		return [xs, ys, ma];
	});

	function onDpsCursor(u: uPlot) {
		dpsHoverIdx = u.cursor.idx ?? null;
	}

	const dpsChartOptions = $derived.by(() => {
		return baseOptions({
			theme: chart,
			time: true,
			legend: true,
			yAxes: [{ size: 56, fmt: (v) => `${v.toFixed(1)}` }],
			series: [
				{
					label:
						dpsMetric === 'rawDps'
							? t('dashboard.dpsTrend.raw')
							: t('dashboard.dpsTrend.normalised'),
					role: 'dps',
					width: 0,
					points: 7
				},
				{
					label: dpsMaWindow === 7 ? t('dashboard.dpsTrend.ma7') : t('dashboard.dpsTrend.ma28'),
					role: 'fit',
					width: 2
				}
			],
			cursor: { x: true, y: true },
			hooks: {
				setCursor: [onDpsCursor],
				ready: [
					(u: uPlot) => {
						u.over.style.cursor = 'pointer';
						u.over.addEventListener('click', () => {
							const idx = u.cursor.idx;
							const pts = dpsPoints;
							if (idx != null && idx >= 0 && pts[idx]) goto(`/replay/${pts[idx].workoutId}`);
						});
					}
				]
			}
		});
	});
</script>

<div class="container">
	<!-- ============ HEAD + SPORT FILTER ============ -->
	<div class="head">
		<div class="head-titles">
			<p class="eyebrow">{t('dashboard.eyebrow')}</p>
			<h1 class="race-head">{t('dashboard.title')}</h1>
		</div>
		<div class="headright">
			<div role="tablist" class="tabs tabs-box tabs-sm filtertabs" aria-label="Sport filter">
				{#each sports as s}
					<button
						role="tab"
						class="tab"
						class:tab-active={sportFilter === s}
						aria-selected={sportFilter === s}
						onclick={() => setSportFilter(s)}
					>
						{s === 'all' ? t('dashboard.all') : SPORT_LABEL[s]}
					</button>
				{/each}
			</div>
		</div>
	</div>
	{#if data.demo}
		<p class="syncnote muted">
			<span class="badge badge-soft badge-primary">{t('common.demoMode')}</span>
		</p>
	{/if}

	{#if showDashboardTour}
		<section class="card card-border bg-base-100 shadow-md p-5 tour-card" data-e2e="dashboard-tour" aria-labelledby="dashboard-tour-title">
			<div class="tour-head">
				<div>
					<p class="eyebrow">{t('dashboard.tour.eyebrow')}</p>
					<h2 id="dashboard-tour-title">{t('dashboard.tour.title')}</h2>
					<p class="muted tour-copy">{t('dashboard.tour.body')}</p>
				</div>
				<button type="button" class="btn btn-ghost btn-sm" onclick={dismissDashboardTour}>
					<X size={14} aria-hidden="true" />
					{t('common.dismiss')}
				</button>
			</div>
			<div class="tour-grid">
				{#each dashboardHints as hint (hint.id)}
					<div class="tour-hint">
						<a class="tour-link" href={hint.href}>
							<span class="tour-title">{hint.title}</span>
							<span class="muted">{hint.body}</span>
							<span class="tour-action">{hint.action}</span>
						</a>
						<button
							type="button"
							class="btn btn-ghost btn-square btn-xs"
							aria-label={t('dashboard.tour.dismissHint', { title: hint.title })}
							onclick={() => dismissHint(hint.id)}
						>
							<X size={12} aria-hidden="true" />
						</button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="core-stack" data-e2e="core-summary" aria-labelledby="dashboard-core-title">
		<div class="section-head section-head--compact">
			<p class="eyebrow">{t('dashboard.sectionCoreEyebrow')}</p>
			<h2 id="dashboard-core-title">{t('dashboard.sectionCore')}</h2>
		</div>

	<!-- ============ HERO — LATEST SESSION ============ -->
	{#if latest}
		<a class="card latest" href="/replay/{latest.id}" data-e2e="latest-replay">
			<span class="latest-accent" aria-hidden="true"></span>
			<div class="card-body latest-body">
				<div class="latest-main">
					<div class="herotop muted">
						<span class="hicon" style:color={MACHINE_COLOR[latest.sport]}><SportIcon sport={latest.sport} size={16} /></span>
						{t('dashboard.latest')} · {latest.workoutType || SPORT_LABEL[latest.sport]} · {fmtDate(latest.date)}
					</div>
					<div class="heropace mono">{fmtPaceBare(latest.pace)}<span class="perunit">/500m</span></div>
					{#if paceDelta != null}
						<div class="herodelta mono" class:faster={paceDelta < 0} class:slower={paceDelta > 0}>
							{paceDelta < 0 ? '▼' : '▲'}
							{fmtPaceBare(Math.abs(paceDelta), true)}
							<span class="muted">{t('dashboard.vsAvg', { sport: SPORT_LABEL[latest.sport] })}</span>
						</div>
					{/if}
					<div class="herometrics">
						<div class="hm">
							<div class="hmv mono">{fmtDistance(latest.distance)}</div>
							<div class="hml eyebrow">{t('dashboard.distance')}</div>
						</div>
						<div class="hm">
							<div class="hmv mono">{fmtTime(latest.time, true)}</div>
							<div class="hml eyebrow">{t('dashboard.time')}</div>
						</div>
						{#if latest.strokeRate}
							<div class="hm">
								<div class="hmv mono" style="color: var(--rate)">{latest.strokeRate}</div>
								<div class="hml eyebrow">{t('dashboard.avgRate')}</div>
							</div>
						{/if}
						{#if heroDps > 0}
							<div class="hm">
								<div class="hmv mono" style="color: var(--dps)">{heroDps.toFixed(1)}m</div>
								<div class="hml eyebrow">{t('dashboard.distStroke')}</div>
							</div>
						{/if}
						{#if latest.heartRateAvg}
							<div class="hm">
								<div class="hmv mono" style="color: var(--hr)">{Math.round(latest.heartRateAvg)}</div>
								<div class="hml eyebrow">{t('dashboard.avgBpm')}</div>
							</div>
						{/if}
					</div>
				</div>
				<div class="latest-cta">
					<span class="btn btn-primary btn-lg latest-replay"><Play size={18} /> {t('common.replay')}</span>
				</div>
			</div>
			</a>
		{/if}

	<!-- ============ STAT STRIP ============ -->
		<div class="dash-stats">
		<div class="card statcard">
			<div class="statlabel eyebrow">{t('dashboard.sessions')}</div>
			<div class="statval mono">{totals.totalSessions}</div>
		</div>
		<div class="card statcard">
			<div class="statlabel eyebrow">{t('dashboard.totalDistance')}</div>
			<div class="statval mono">{fmtDistance(totalMeters)}</div>
		</div>
		<div class="card statcard">
			<div class="statlabel eyebrow">{t('dashboard.totalTime')}</div>
			<div class="statval mono">{fmtTime(totalTime)}</div>
		</div>
		<div class="card statcard statcard--pace">
			<div class="statlabel eyebrow">{t('dashboard.avgPace')}</div>
			<div class="statval mono" style="color: var(--pace)">{fmtPace(avgPace)}</div>
		</div>
		</div>
	</section>

	<section id="workouts" class="dashboard-section workout-section" data-e2e="workout-section" aria-labelledby="workouts-title">
		<div class="section-head">
			<p class="eyebrow">{t('dashboard.sectionWorkoutsEyebrow')}</p>
			<h2 id="workouts-title">{t('dashboard.sectionWorkouts')}</h2>
			<p class="muted">{t('dashboard.sectionWorkoutsBody')}</p>
		</div>
		<div id="workout-filters">
			<WorkoutListFilters
				query={listQuery}
				{workoutTypes}
				resultCount={listWorkouts.length}
				onchange={applyListQuery}
				onclear={() => applyListQuery({ sport: listQuery.sport, sort: 'date', dir: 'desc' })}
			/>
		</div>
		<div class="tagfilter card card-border bg-base-100 shadow-md p-4">
			<div class="text-xs uppercase opacity-70 mb-2">{t('workout.tag.label')}</div>
			<ChipGroup ariaLabel={t('workout.tag.label')}>
				<ChipButton active={!listQuery.tag} onclick={() => applyListQuery({ ...listQuery, tag: undefined })}>
					{t('workout.tag.filter.all')}
				</ChipButton>
				{#each WORKOUT_TAGS as tag}
					<ChipButton active={listQuery.tag === tag} onclick={() => applyListQuery({ ...listQuery, tag })}>
						{t(`workout.tag.${tag}`)}
					</ChipButton>
				{/each}
			</ChipGroup>
		</div>
		<WorkoutList
			workouts={listWorkouts}
			pbIds={pbIds}
			{newPbIds}
			{newEntryIds}
		/>
	</section>

	<section id="goals-records" class="dashboard-section" data-e2e="records-section" aria-labelledby="records-title">
		<div class="section-head">
			<p class="eyebrow">{t('dashboard.sectionRecordsEyebrow')}</p>
			<h2 id="records-title">{t('dashboard.sectionRecords')}</h2>
			<p class="muted">{t('dashboard.sectionRecordsBody')}</p>
		</div>
		<div class="records-grid">
			<EngagementPanel
				workouts={workouts}
				annualGoal={data.annualGoal}
				{goalYear}
				endDay={calendarEndDay}
				{homeTz}
			/>

			<MilestonesPanel workouts={workouts} personalBests={milestonePBs} endDay={calendarEndDay} {homeTz} />

			{#if pbs.length}
				<div class="card card-border bg-base-100 shadow-md p-5 pbcard">
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

			<PerformancePredictorCard personalBests={allPbs} />
		</div>
	</section>

	<section id="advanced-analysis" class="dashboard-section" data-e2e="advanced-section" aria-labelledby="advanced-title">
		<div class="section-head">
			<p class="eyebrow">{t('dashboard.sectionAdvancedEyebrow')}</p>
			<h2 id="advanced-title">{t('dashboard.sectionAdvanced')}</h2>
			<p class="muted">{t('dashboard.sectionAdvancedBody')}</p>
		</div>

	<!-- ============ MAIN + RAIL ============ -->
		<div class="dash-grid">
			<!-- Main column (analysis) — first in DOM so main content leads on mobile. -->
			<div class="col-main">
				<div id="critical-power" class="analysis-kicker">
					<h3>{t('dashboard.sectionPower')}</h3>
					<p class="muted">{t('dashboard.sectionPowerBody')}</p>
				</div>
				<CriticalPowerPanel workouts={workouts} />

				{#if load}
					<div class="card card-border bg-base-100 shadow-md p-5 formcard">
					<div class="formhead">
						<div class="formtitle">
							<Activity size={18} />
							<span class="label">{t('dashboard.formTitle')}</span>
							<span class="badge badge-soft badge-primary">{t('dashboard.formAdvanced')}</span>
						</div>
						<span class="badge band-{formBandClass[load.band]}">{bandLabel[load.band]}</span>
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
							<div class="fsv mono band-{formBandClass[load.band]}">{signed(load.tsb)}</div>
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

					<div class="formread band-{formBandClass[load.band]}">
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

				<div class="analysis-kicker">
					<h3>{t('dashboard.sectionTraining')}</h3>
					<p class="muted">{t('dashboard.sectionTrainingBody')}</p>
				</div>
				{#if filtered.length}
					<TrainingHeatmap workouts={filtered} endDay={calendarEndDay} {homeTz} />
				{/if}

				<TrainingIntensityChart workouts={filtered} />

			<!-- Trend -->
			{#if filtered.length > 1}
				<div class="card card-border bg-base-100 shadow-md p-5 chartcard">
					<div class="trendhead">
						<div class="label">
							{t('dashboard.trendTitle')}
							{#if bandScoped}
								<span class="muted">· {t('dashboard.likeForLike', { sport: SPORT_LABEL[dominantSport] })}</span>
							{/if}
						</div>
						<div role="tablist" class="tabs tabs-box tabs-sm metrictabs" aria-label="Metric filter">
							{#each metrics as m}
								<button role="tab" class="tab" class:tab-active={metric === m.id} aria-selected={metric === m.id} onclick={() => (metric = m.id)}>{t(m.labelKey)}</button>
							{/each}
						</div>
					</div>

					{#if bandScoped && bands.length > 1}
						<div
						class="join bands"
						role="radiogroup"
						aria-label="Distance band"
						tabindex="-1"
						onkeydown={(e) => {
							const btns = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')];
							const idx = btns.indexOf(e.target as HTMLButtonElement);
							if (idx < 0) return;
							let next = -1;
							if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % btns.length;
							else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + btns.length) % btns.length;
							if (next >= 0) { e.preventDefault(); btns[next].click(); btns[next].focus(); }
						}}
					>
						{#each bands as b (b.key)}
							<button
								class="btn btn-sm join-item"
								class:btn-active={activeBand === b.key}
								class:btn-neutral={activeBand === b.key}
								role="radio"
								aria-checked={activeBand === b.key}
								tabindex={activeBand === b.key ? 0 : -1}
								onclick={() => (bandKey = b.key)}
							>{b.label} <span class="bn">{b.n}</span></button>
						{/each}
					</div>
					{/if}

					{#if verdict}
						<div class="alert verdict" class:verdict-good={verdict.better && !verdict.flat} class:verdict-bad={!verdict.better && !verdict.flat}>
							{#if verdict.flat}<MoveRight size={16} />{:else if verdict.better}<TrendingUp size={16} />{:else}<TrendingDown size={16} />{/if}
							<span>{verdictText}</span>
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
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href="{base}/docs/charts-and-progress">{t('docs.contextual.charts')}</a>
						</p>
					{/if}
				</div>
				{/if}

				<!-- DPS trend — stroke efficiency over time -->
				<div class="analysis-kicker">
					<h3>{t('dashboard.sectionStroke')}</h3>
					<p class="muted">{t('dashboard.sectionStrokeBody')}</p>
				</div>
				<div class="card card-border bg-base-100 shadow-md p-5 chartcard">
				<div class="trendhead">
					<div class="label">{t('dashboard.dpsTrend.title')}</div>
					<div class="dpscontrols">
						<label class="label cursor-pointer gap-2">
							<span class="label-text text-xs">{t('dashboard.dpsTrend.raw')}</span>
							<input
								type="checkbox"
								class="toggle toggle-sm"
								checked={dpsMetric === 'normDps'}
								onchange={(e) =>
									(dpsMetric = (e.currentTarget as HTMLInputElement).checked ? 'normDps' : 'rawDps')}
							/>
							<span class="label-text text-xs">{t('dashboard.dpsTrend.normalised')}</span>
						</label>
						<div class="join" role="group" aria-label="Moving average window">
							<button
								class="btn btn-xs join-item"
								class:btn-active={dpsMaWindow === 7}
								class:btn-neutral={dpsMaWindow === 7}
								aria-pressed={dpsMaWindow === 7}
								onclick={() => (dpsMaWindow = 7)}
							>{t('dashboard.dpsTrend.ma7')}</button>
							<button
								class="btn btn-xs join-item"
								class:btn-active={dpsMaWindow === 28}
								class:btn-neutral={dpsMaWindow === 28}
								aria-pressed={dpsMaWindow === 28}
								onclick={() => (dpsMaWindow = 28)}
							>{t('dashboard.dpsTrend.ma28')}</button>
						</div>
					</div>
				</div>

				{#if dpsPoints.length === 0}
					<p class="muted emptytrend">
						{t('dashboard.dpsTrend.empty')}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href="{base}/docs/troubleshooting">{t('docs.contextual.troubleshooting')}</a>
					</p>
				{:else}
					{#if dpsHover}
						<p class="dpstip muted mono" aria-live="polite">
							{fmtDate(dpsHover.date)} · {SPORT_LABEL[dpsHover.sport]} ·
							{t('dashboard.dpsTrend.tooltipDps')}: {dpsHover.rawDps.toFixed(1)}m ·
							{#if dpsMetric === 'normDps'}
								{t('dashboard.dpsTrend.normalised')}: {dpsHover.normDps.toFixed(1)}m ·
							{/if}
							{t('dashboard.dpsTrend.tooltipPace')}: {fmtPace(dpsHover.avgPaceSecs)}
						</p>
					{/if}
					<UPlotChart
						data={dpsChartData}
						options={dpsChartOptions}
						height={190}
						caption={t('dashboard.dpsTrend.title')}
						description={t('dashboard.dpsTrend.yLabel')}
					/>
				{/if}
			</div>

			<!-- Per-sport breakdown -->
			{#if bySport.length > 1}
				<div class="card card-border bg-base-100 shadow-md p-5 breakdown">
					<div class="muted label">{t('dashboard.bySport')}</div>
					<div class="tablescroll">
						<table class="table table-zebra table-sm mono breakdowntable">
							<thead>
								<tr><th>{t('dashboard.thSport')}</th><th class="num">{t('dashboard.thSessions')}</th><th class="num">{t('dashboard.thDistance')}</th><th class="num">{t('dashboard.thTime')}</th><th class="num">{t('dashboard.thAvgPace')}</th><th class="num">{t('dashboard.thBestPace')}</th></tr>
							</thead>
							<tbody>
								{#each bySport as s}
									<tr>
										<td class="sportcell"><span class="mdot" style:background={MACHINE_COLOR[s.sport]}></span><SportIcon sport={s.sport} size={14} /> {SPORT_LABEL[s.sport]}</td>
										<td class="num">{s.sessions}</td>
										<td class="num">{fmtDistance(s.distance)}</td>
										<td class="num">{fmtTime(s.time)}</td>
										<td class="num">{fmtPace(s.avgPace)}</td>
										<td class="num best">{fmtPace(s.bestPace)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

		</div>

		{#if liveMode}
			<!-- Right rail: keep live-mode controls adjacent to advanced telemetry. -->
			<aside class="col-rail">
				<LiveModePanel live={liveMode} />
			</aside>
		{/if}
	</div>
	</section>
</div>

<style>
	/* ============================================================================
	   Dashboard — daisyUI-led redesign. daisyUI owns components (card / btn / badge
	   / tabs / table / join); these scoped rules handle page layout, the hero, the
	   stat strip and the editorial number voice. Tokens come from app.css.
	   ============================================================================ */

	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1.25rem;
		padding-bottom: 0.85rem;
		border-bottom: 2px solid var(--ink);
	}
	.head-titles { min-width: 0; }
	.race-head {
		font-size: clamp(1.7rem, 6vw, 2.45rem);
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: -0.02em;
		line-height: 1;
		margin-top: 0.15rem;
	}
	.headright {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		max-width: 100%;
		min-width: 0;
	}
	.filtertabs {
		max-width: 100%;
		overflow-x: auto;
		background: var(--paper-inset);
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.filtertabs .tab {
		flex: 0 0 auto;
	}
	.sync { display: inline-flex; align-items: center; gap: 0.4rem; }
	.syncicon { display: inline-flex; }
	.syncicon.spin { animation: rp-spin 1s linear infinite; }
	@keyframes rp-spin { to { transform: rotate(360deg); } }
	.syncnote { font-size: 0.82rem; margin: -0.5rem 0 1.25rem; }

	.tour-card {
		margin-bottom: 1.25rem;
		border-color: color-mix(in srgb, var(--live) 24%, var(--hairline));
		background: linear-gradient(135deg, color-mix(in srgb, var(--live) 7%, var(--paper-raised)), var(--paper-raised) 72%);
	}
	.tour-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.tour-head h2 {
		margin: 0.15rem 0 0;
		font-size: 1.05rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	.tour-copy {
		margin: 0.35rem 0 0;
		max-width: 64ch;
		font-size: 0.9rem;
	}
	.tour-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 1rem;
	}
	.tour-hint {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
		align-items: start;
		padding: 0.7rem;
		border: 1px solid var(--hairline);
		border-radius: var(--r-ctrl);
		background: var(--paper-inset);
	}
	.tour-link {
		display: grid;
		gap: 0.25rem;
		color: var(--ink);
	}
	.tour-link:hover {
		text-decoration: none;
	}
	.tour-title,
	.tour-action {
		font-weight: 800;
		font-size: 0.82rem;
	}
	.tour-title {
		font-family: var(--display);
		text-transform: uppercase;
	}
	.tour-link .muted {
		font-size: 0.78rem;
		line-height: 1.35;
	}
	.tour-action {
		color: var(--ghost);
	}

	.core-stack,
	.dashboard-section {
		display: grid;
		gap: 1rem;
		min-width: 0;
		scroll-margin-top: 5rem;
	}
	.dashboard-section {
		margin-top: 2rem;
	}
	.section-head {
		max-width: 54rem;
		min-width: 0;
	}
	.section-head--compact {
		margin-bottom: -0.25rem;
	}
	.section-head h2 {
		margin: 0.1rem 0 0;
		font-size: clamp(1.1rem, 3vw, 1.45rem);
		font-weight: 900;
		line-height: 1.05;
		text-transform: uppercase;
	}
	.section-head p:last-child {
		margin: 0.4rem 0 0;
		font-size: 0.92rem;
	}
	.records-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
		min-width: 0;
	}
	.records-grid > :global(*) {
		min-width: 0;
	}
	#workout-filters {
		scroll-margin-top: 5rem;
	}
	.analysis-kicker {
		padding: 0.3rem 0 0.1rem;
		border-top: 2px solid var(--ink);
		scroll-margin-top: 5rem;
	}
	.analysis-kicker h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 900;
		text-transform: uppercase;
	}
	.analysis-kicker p {
		margin: 0.25rem 0 0;
		font-size: 0.86rem;
	}

	/* ---- Hero --------------------------------------------------------------- */
	.latest {
		position: relative;
		display: block;
		overflow: hidden;
		margin-bottom: 1rem;
		color: var(--ink);
		border: 1px solid color-mix(in srgb, var(--live) 26%, var(--hairline));
		background: linear-gradient(120deg, color-mix(in srgb, var(--live) 7%, var(--paper-raised)), var(--paper-raised) 58%);
		box-shadow: var(--stamp-live);
		transition: transform 0.06s ease, box-shadow 0.06s ease;
	}
	.latest:hover { text-decoration: none; transform: translateY(-2px); box-shadow: var(--shadow-lg); }
	.latest-accent { position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--live); }
	.latest-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 1.5rem;
		padding: 1.5rem 1.6rem 1.5rem 1.85rem;
	}
	.herotop { font-size: 0.85rem; display: flex; align-items: center; gap: 0.45rem; }
	.hicon { display: inline-flex; align-items: center; }
	.heropace {
		font-family: var(--display);
		font-size: var(--clock-size);
		font-weight: 900;
		line-height: 0.92;
		letter-spacing: -0.03em;
		margin: 0.35rem 0 0.15rem;
	}
	.perunit { font-size: 1rem; font-weight: 500; color: var(--ink-2); margin-left: 0.35rem; }
	.herodelta { font-size: 0.95rem; font-weight: 700; }
	.herodelta.faster { color: var(--ahead); }
	.herodelta.slower { color: var(--behind); }
	.herometrics { display: flex; gap: 1.75rem 2rem; flex-wrap: wrap; margin-top: 1.25rem; }
	.hmv { font-size: 1.5rem; font-weight: 700; line-height: 1; }
	.hml { margin-top: 0.4rem; }
	.latest-cta { align-self: center; }
	.latest-replay { pointer-events: none; }

	/* ---- Stat strip --------------------------------------------------------- */
	.dash-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.85rem;
		margin-bottom: 0;
	}
	.statcard {
		position: relative;
		padding: 1rem 1.1rem;
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.statcard::before {
		content: '';
		position: absolute; inset: 0 auto 0 0; width: 3px;
		background: var(--hairline);
	}
	.statcard--pace::before { background: var(--pace); }
	.statlabel { line-height: 1.2; }
	.statval { font-size: 1.7rem; font-weight: 700; margin-top: 0.35rem; line-height: 1.1; }

	/* ---- Main + rail grid --------------------------------------------------- */
	.dash-grid {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		overflow-x: clip;
	}
	.col-main { grid-column: 1; display: grid; gap: 1rem; align-content: start; max-width: 100%; min-width: 0; overflow-x: clip; }
	.col-rail { grid-column: 2; grid-row: 1; display: grid; gap: 1rem; align-content: start; min-width: 0; }
	.col-main > :global(*) {
		max-width: 100%;
		min-width: 0;
	}

	.label { font-size: 0.8rem; font-weight: 700; }

	/* ---- Form / PMC card ---------------------------------------------------- */
	.formcard {
		background: linear-gradient(135deg, color-mix(in srgb, var(--ghost) 8%, var(--paper-raised)), var(--paper-raised) 65%);
		border-color: color-mix(in srgb, var(--ghost) 28%, var(--hairline));
	}
	.formhead { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
	.formtitle { display: flex; align-items: center; gap: 0.5rem; }
	.formtitle .label { font-weight: 700; }
	.formsub { font-size: 0.82rem; margin: 0.4rem 0 0.85rem; }
	.formstats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 0.85rem; }
	.fsv { font-size: 1.6rem; font-weight: 700; line-height: 1; }
	.fsl { font-size: 0.82rem; font-weight: 600; margin-top: 0.3rem; }
	.fsh { font-size: 0.72rem; margin-top: 0.1rem; }
	.unit { font-size: 0.9rem; margin-left: 0.1rem; }
	.formread {
		font-size: 0.9rem; line-height: 1.5;
		padding: 0.7rem 0.9rem; border-radius: var(--r-ctrl);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border-left: 3px solid var(--ink-3);
		margin-bottom: 0.85rem;
	}
	.formlegend { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; font-size: 0.76rem; margin-top: 0.5rem; }
	.formlegend i { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px; margin-right: 0.3rem; vertical-align: -1px; }
	.emptytrend { font-size: 0.85rem; padding: 0.5rem 0; }

	/* Form-band semantic colours (formBandClass: info/good/neutral/accent/bad).
	   `bad` darkens --behind toward --ink so the text clears WCAG AA on its pale
	   tint (raw --behind is ~2.6:1) — matches the contrast fix on main. */
	.band-info { color: var(--ghost); }
	.band-good { color: var(--ahead); }
	.band-neutral { color: var(--ink-2); }
	.band-accent { color: var(--live); }
	.band-bad { color: color-mix(in srgb, var(--behind) 45%, var(--ink)); }
	.badge.band-info { background: color-mix(in srgb, var(--ghost) 16%, var(--paper-raised)); color: var(--ghost); border: 1px solid color-mix(in srgb, var(--ghost) 35%, transparent); }
	.badge.band-good { background: color-mix(in srgb, var(--ahead) 16%, var(--paper-raised)); color: var(--ahead); border: 1px solid color-mix(in srgb, var(--ahead) 35%, transparent); }
	.badge.band-neutral { background: var(--paper-inset); color: var(--ink-2); border: 1px solid var(--hairline); }
	.badge.band-accent { background: color-mix(in srgb, var(--live) 16%, var(--paper-raised)); color: var(--live); border: 1px solid color-mix(in srgb, var(--live) 35%, transparent); }
	.badge.band-bad { background: color-mix(in srgb, var(--behind) 16%, var(--paper-raised)); color: color-mix(in srgb, var(--behind) 45%, var(--ink)); border: 1px solid color-mix(in srgb, var(--behind) 40%, transparent); }
	.formread.band-good { border-left-color: var(--ahead); }
	.formread.band-bad { border-left-color: var(--behind); }
	.formread.band-accent { border-left-color: var(--live); }
	.formread.band-info { border-left-color: var(--ghost); }

	/* ---- Trend -------------------------------------------------------------- */
	.trendhead { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
	.metrictabs { background: var(--paper-inset); font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
	.bands { margin-bottom: 0.75rem; }
	.bands .bn { opacity: 0.6; margin-left: 0.25rem; }
	.verdict { font-size: 0.9rem; font-weight: 600; padding: 0.6rem 0.85rem; margin-bottom: 0.85rem; background: var(--paper-inset); border: 1px solid var(--hairline); color: var(--ink-2); }
	.verdict-good { background: color-mix(in srgb, var(--ahead) 12%, var(--paper-raised)); border-color: color-mix(in srgb, var(--ahead) 30%, transparent); color: var(--ahead); }
	.verdict-bad { background: color-mix(in srgb, var(--alarm) 12%, var(--paper-raised)); border-color: color-mix(in srgb, var(--alarm) 30%, transparent); color: var(--alarm); }

	.dpscontrols { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.dpstip { font-size: 0.82rem; margin-bottom: 0.65rem; min-height: 1.25rem; }

	/* ---- Breakdown table ---------------------------------------------------- */
	.tablescroll { overflow-x: auto; }
	.breakdowntable .num { text-align: right; }
	.breakdowntable thead th { text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.72rem; color: var(--ink-2); }
	.sportcell { display: flex; align-items: center; gap: 0.45rem; font-family: var(--ui); font-weight: 600; }
	.mdot { width: 0.55rem; height: 0.55rem; border-radius: 999px; flex-shrink: 0; }
	.breakdowntable .best { color: var(--ahead); }

	/* ---- Personal bests ----------------------------------------------------- */
	.pbcard .pbgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; margin-top: 0.65rem; }
	.pb { padding: 0.7rem 0.8rem; border-radius: var(--r-ctrl); background: var(--paper-inset); border: 1px solid var(--hairline); }
	.pbdist { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 0.1rem 0.45rem; border-radius: 999px; background: color-mix(in srgb, var(--ghost) 14%, var(--paper-raised)); color: var(--ghost); border: 1px solid color-mix(in srgb, var(--ghost) 30%, transparent); }
	.pbtime { font-size: 1.2rem; font-weight: 700; margin-top: 0.4rem; line-height: 1; }
	.pbsub { font-size: 0.72rem; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.25rem; }


	/* ---- Responsive --------------------------------------------------------- */
	@media (max-width: 1100px) {
		.dash-grid { grid-template-columns: 1fr; }
		.col-main, .col-rail { grid-column: 1; grid-row: auto; }
		.tour-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (min-width: 860px) {
		.records-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 720px) {
		.dash-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.latest-body { grid-template-columns: 1fr; }
		.latest-cta { justify-self: start; }
		.latest-replay { width: 100%; }
		.records-grid,
		.tour-grid {
			grid-template-columns: 1fr;
		}
		.tour-head {
			flex-direction: column;
		}
	}
	@media (max-width: 460px) {
		.dash-stats { grid-template-columns: 1fr; }
	}
</style>
