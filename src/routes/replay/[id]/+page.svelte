<script lang="ts">
	import { onMount } from 'svelte';
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import MetricGauge from '$components/MetricGauge.svelte';
	import { ReplayEngine, sampleAt, type Frame } from '$lib/replay/engine';
	import { CourseRenderer, type RenderState, type ReplayRenderer } from '$lib/replay/renderer';
	import {
		loadRendererPref,
		saveRendererPref,
		loadQualityPref,
		saveQualityPref,
		type RendererKind,
		type RenderQuality
	} from '$lib/replay/replayRenderer';
	import { webglSupported, loadRenderer3D, type Renderer3DCtor } from '$lib/replay/renderer3dLoader';
	import { MACHINE_COLOR, themeFor } from '$lib/replay/sports';
	import {
		hrZones,
		powerCurve,
		techniqueSummary,
		efficiencyByRate,
		intervalBreakdown
	} from '$lib/analytics';
	import { avgWatts, fmtDate, fmtDistance, fmtPace, fmtPaceBare, fmtTime, fmtLogbookDateTime, SPORT_LABEL } from '$lib/format';
	import type { Sport, Stroke, Workout, WorkoutDetail } from '$lib/types';
	import { matchStandardDistance } from '$lib/leaderboard';
	import { untrack } from 'svelte';
	import { constantPaceGhost, parsePaceInput, parseWorkoutFile } from '$lib/replay/sources';
	import {
		applyHrImport,
		clearHrOverlay,
		type HrOverlay,
		parseHrFile,
		previewMergedAvgHr,
		readHrOverlay,
		strokesHaveHr,
		writeHrOverlay
	} from '$lib/hrImport';
	import { pickDefaultGhostCandidate } from '$lib/replay/ghostPick';
	import { toast } from 'svelte-sonner';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Ghost from '@lucide/svelte/icons/ghost';
	import Share2 from '@lucide/svelte/icons/share-2';
	import ImageDown from '@lucide/svelte/icons/image-down';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Heart from '@lucide/svelte/icons/heart';
	import { downloadRaceCardPng } from '$lib/replay/raceCard';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import { chartTheme, baseOptions, type SeriesRole } from '$lib/chartTheme';
	import SportIcon from '$components/SportIcon.svelte';
	import { page } from '$app/state';
	import AnnotationPanel from '$components/AnnotationPanel.svelte';
	import type { Annotation } from '$lib/types';

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const uiTheme = getThemeContext();
	const baseDetail = $derived(data.detail as WorkoutDetail);
	const candidates = $derived(data.candidates as Workout[]);
	// Local, mutable copy (save/delete edit it in place). Re-seed from `data`
	// whenever it changes so navigating between replays shows the right notes
	// rather than the first workout's, since the component instance is reused.
	let annotations = $state([] as Annotation[]);
	$effect(() => {
		annotations = data.annotations as Annotation[];
	});
	const isDemo = $derived(!!data.demo);
	let hrOverlay = $state<HrOverlay | null>(null);
	// Workout id the current overlay belongs to. On client-side navigation
	// `baseDetail` updates a frame before the restore $effect runs, so without
	// this guard the previous workout's overlay would briefly apply to the new
	// strokes (a telemetry flash). Only overlay when the ids match.
	let hrOverlayId = $state<number | null>(null);
	let hrImportPreview = $state<{ samples: HrOverlay['samples']; name: string } | null>(null);
	let hrImportOffset = $state(0);
	let hrImportError = $state('');
	let hrImportBusy = $state(false);

	const detail = $derived(
		hrOverlay && hrOverlayId === baseDetail.id
			? applyHrImport(baseDetail, hrOverlay.samples, hrOverlay.offset)
			: baseDetail
	);
	const logbookHasHr = $derived(strokesHaveHr(baseDetail.strokes));
	const sportTheme = $derived(themeFor(detail.sport));
	const total = $derived(detail.distance);
	const strokes = $derived(detail.strokes);

	let frame = $state<Frame>(untrack(() => sampleAt(strokes, 0)));
	let playing = $state(false);
	// Replays default to 8× — real-time is too slow to watch (a 2k is 8 min).
	const DEFAULT_SPEED = 8;
	let speed = $state(DEFAULT_SPEED);

	// Comparison ("ghost") state — race a past session, a constant pace, or an
	// uploaded CSV/TCX/FIT file. All three resolve to a ghost stroke array.
	type CompareMode = 'none' | 'session' | 'pace' | 'file';
	type GhostRival = {
		kind: 'session' | 'pace' | 'file';
		date?: string;
		distance?: number;
		name?: string;
		paceLabel?: string;
	};
	let compareMode = $state<CompareMode>('none');
	// `$state.raw` so reassigning the whole array is reactive (verdict/raceWon
	// track it) without deep-proxying a large stroke array on the render hot path.
	let ghostStrokes = $state.raw<Stroke[] | null>(null);
	let ghostActive = $state(false);
	let ghostLabel = $state('');
	let ghostFrame = $state<Frame | null>(null);
	let ghostRival = $state<GhostRival | null>(null);
	let loadingGhost = $state(false);
	let ghostError = $state('');
	// sub-control inputs
	let ghostId = $state('');
	let sessionSearch = $state('');
	let paceInput = $state('2:00');
	let fileName = $state('');

	const SEARCHABLE_MIN = 8;
	const filteredCandidates = $derived.by(() => {
		const q = sessionSearch.trim().toLowerCase();
		if (!q) return candidates;
		return candidates.filter((c) => {
			if (String(c.id) === ghostId) return true;
			const hay = `${fmtDate(c.date)} ${fmtDistance(c.distance)} ${fmtPace(c.pace)}`.toLowerCase();
			return hay.includes(q);
		});
	});

	let engine = $state<ReplayEngine | null>(null);
	let renderer: ReplayRenderer | null = null;
	let rendererKind = $state<RendererKind>('2d');
	let quality = $state<RenderQuality>('medium');
	let loading3d = $state(false);
	let webglOk = $state(false);
	let Ctor3D: Renderer3DCtor | null = null;
	let activeLoadId = 0;
	// 2D and 3D must NOT share a <canvas>: a canvas is locked to one context type
	// for life, so the 2D renderer's getContext('2d') would make WebGL creation
	// fail. The 2D renderer uses canvas2dEl; the 3D renderer creates its own canvas
	// inside canvas3dHost. activeCanvas toggles which one is visible.
	let canvas2dEl: HTMLCanvasElement;
	let canvas3dHost: HTMLDivElement;
	let activeCanvas = $state<RendererKind>('2d');
	let courseWrap: HTMLDivElement;

	const SPEEDS = [0.5, 1, 2, 4, 8];

	function buildState(f: Frame): RenderState {
		const g = ghostStrokes ? sampleAt(ghostStrokes, f.t) : null;
		ghostFrame = g;
		return {
			frame: f,
			distFrac: total ? f.d / total : 0,
			totalDistance: total,
			sport: detail.sport,
			ghost: g
				? { distFrac: total ? g.d / total : 0, pace: g.pace, spm: g.spm, label: ghostLabel }
				: undefined
		};
	}

	function safeRender(state: RenderState, p: boolean, theme: 'light' | 'dark' = uiTheme.value) {
		if (!renderer) return;
		try {
			renderer.render(state, p, theme);
		} catch (err) {
			if (rendererKind !== '3d') throw err;
			toast.error(t('replay.view3dError'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
			void setRenderer('2d');
		}
	}

	function renderCurrent() {
		safeRender(buildState(frame), playing, uiTheme.value);
	}

	function courseHeight() {
		return ghostActive ? 190 : 150;
	}

	function resizeCourse() {
		const w = courseWrap?.clientWidth;
		if (w) renderer?.resize(w, courseHeight());
	}

	async function setRenderer(kind: RendererKind) {
		if (activeLoadId < 0) return;
		if (kind === '3d' && !webglOk) return;
		rendererKind = kind;
		saveRendererPref(kind);

		const w = courseWrap?.clientWidth ?? 0;
		const h = courseHeight();

		renderer?.destroy();
		renderer = null;

		activeLoadId++;
		const myLoadId = activeLoadId;

		try {
			if (kind === '2d') {
				if (myLoadId !== activeLoadId) return;
				// Clear any in-flight 3D loading flag — a pending 3D load's finally
				// won't fire for this (superseded) myLoadId, so reset it here.
				loading3d = false;
				renderer = new CourseRenderer(canvas2dEl);
				activeCanvas = '2d';
				if (w) renderer.resize(w, h);
				renderCurrent();
				return;
			}

			if (!Ctor3D) {
				loading3d = true;
				const temp2d = new CourseRenderer(canvas2dEl);
				renderer = temp2d;
				activeCanvas = '2d';
				if (w) temp2d.resize(w, h);
				renderCurrent();
				try {
					Ctor3D = await loadRenderer3D();
				} finally {
					if (myLoadId === activeLoadId) loading3d = false;
				}
				if (myLoadId !== activeLoadId) {
					// Superseded: a newer setRenderer() already ran renderer?.destroy()
					// (which was temp2d) and took over. Only destroy here if we still
					// own it, to avoid double-destroying the same instance.
					if (renderer === temp2d) temp2d.destroy();
					return;
				}
				temp2d.destroy();
				renderer = null;
			}
			if (myLoadId !== activeLoadId) return;
			renderer = new Ctor3D!(canvas3dHost, quality, detail.sport);
			activeCanvas = '3d';
			if (w) renderer.resize(w, h);
			renderCurrent();
		} catch (err) {
			if (myLoadId !== activeLoadId) return;
			loading3d = false;
			rendererKind = '2d';
			saveRendererPref('2d');
			// renderer may still point at the temp2d placeholder; destroy before
			// replacing to match the ownership pattern used elsewhere.
			renderer?.destroy();
			renderer = null;
			renderer = new CourseRenderer(canvas2dEl);
			activeCanvas = '2d';
			if (w) renderer.resize(w, h);
			renderCurrent();
			toast.error(t('replay.view3dError'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		}
	}

	function onRendererToggle(kind: RendererKind) {
		if (kind === rendererKind) return;
		// Allow switching back to 2D even while a 3D chunk is still loading —
		// setRenderer is cancellation-safe, so this lets the user bail out of a
		// slow load. Only re-selecting 3D mid-load is a no-op.
		if (loading3d && kind === '3d') return;
		void setRenderer(kind);
	}

	function onQualityChange(q: RenderQuality) {
		if (q === quality) return;
		quality = q;
		saveQualityPref(q);
		// Quality affects renderer construction (antialias/dpr/water/shadows), so a
		// live 3D view must be rebuilt. setRenderer('3d') reuses the cached chunk.
		if (rendererKind === '3d' && !loading3d) void setRenderer('3d');
	}

	$effect(() => {
		// Reactive trigger on theme toggle to re-render paused canvas
		const _theme = uiTheme.value;
		renderCurrent();
	});

	// Restore demo HR overlay when navigating between workouts (not when strokes update).
	$effect(() => {
		const id = baseDetail.id;
		untrack(() => {
			hrOverlay = readHrOverlay(id);
			hrOverlayId = id;
			hrImportPreview = null;
			hrImportOffset = 0;
			hrImportError = '';
		});
	});

	// Recreate renderer + engine whenever the workout changes (client-side navigation
	// reuses the same component instance, so strokes/sportTheme may change).
	$effect(() => {
		// Read the reactive deps we want to track — everything else must be untracked
		// to avoid an effect_update_depth_exceeded loop (renderCurrent reads $state).
		const s = strokes;
		untrack(() => {
			engine?.destroy();
			// Reset all playback and ghost state for the new workout.
			frame = sampleAt(s, 0);
			playing = false;
			speed = DEFAULT_SPEED;
			compareMode = 'none';
			ghostStrokes = null;
			ghostActive = false;
			ghostLabel = '';
			ghostRival = null;
			ghostFrame = null;
			ghostId = '';
			sessionSearch = '';
			fileName = '';
			ghostError = '';
			renderer?.destroy();
			renderer = null;
			engine = new ReplayEngine(s, (f, p) => {
				frame = f;
				playing = p;
				safeRender(buildState(f), p, uiTheme.value);
			});
			engine.setSpeed(speed);
			void setRenderer(rendererKind);
		});
		return () => {
			// NB: do NOT set activeLoadId = -1 here. This cleanup also runs on every
			// workout navigation (the effect re-runs), and a permanent -1 would make
			// the subsequent setRenderer() bail on its `activeLoadId < 0` guard,
			// leaving a blank canvas. setRenderer already increments activeLoadId and
			// destroys the prior renderer, so per-navigation race safety is covered.
			// The true unmount guard lives in onMount's cleanup.
			engine?.destroy();
			renderer?.destroy();
			// Null it so the effect body's own renderer?.destroy() can't double-destroy
			// the same (3D) instance — a second loseContext()/dispose() can throw.
			renderer = null;
		};
	});

	/**
	 * Leaderboard deep-link: /replay/<id>?ghostPace=<sec>&ghostName=<name>
	 * pre-arms a rival from a board as a constant-pace ghost so the race starts
	 * immediately. Invalid or absent params fall through to the solo replay.
	 */
	function armGhostFromUrl() {
		const gp = page.url.searchParams.get('ghostPace');
		if (!gp) return;
		const secs = parsePaceInput(gp);
		if (secs == null || total <= 0) return;
		const name = page.url.searchParams.get('ghostName')?.trim();
		const paceLabel = `${fmtPaceBare(secs)}/500m`;
		compareMode = 'pace';
		paceInput = fmtPaceBare(secs);
		setGhost(constantPaceGhost(secs, total), name || paceLabel, { kind: 'pace', paceLabel });
	}

	onMount(() => {
		webglOk = webglSupported();
		quality = loadQualityPref();
		const pref = loadRendererPref();
		if (pref === '3d' && webglOk) {
			void setRenderer('3d');
		} else if (pref === '3d') {
			rendererKind = '2d';
			saveRendererPref('2d');
		}

		armGhostFromUrl();
		const sizeIt = () => {
			resizeCourse();
			renderCurrent();
		};
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
			activeLoadId = -1;
			renderer?.destroy();
		};
	});

	function setSpeed(s: number) {
		speed = s;
		engine?.setSpeed(s);
	}

	function onScrub(e: Event) {
		engine?.seek(Number((e.target as HTMLInputElement).value));
	}

	function setGhost(strokes: Stroke[] | null, label: string, rival: GhostRival | null = null) {
		ghostStrokes = strokes && strokes.length ? strokes : null;
		ghostActive = ghostStrokes != null;
		ghostLabel = ghostActive ? label : '';
		ghostRival = ghostActive ? rival : null;
		if (!ghostActive) ghostFrame = null;
		resizeCourse();
		renderCurrent();
	}

	function clearGhost() {
		ghostId = '';
		fileName = '';
		ghostError = '';
		setGhost(null, '', null);
	}

	function onModeChange(e: Event) {
		const mode = (e.target as HTMLSelectElement).value as CompareMode;
		compareMode = mode;
		sessionSearch = '';
		clearGhost();
		if (mode === 'session' && candidates.length) {
			const pick = pickDefaultGhostCandidate(candidates, {
				id: detail.id,
				distance: detail.distance,
				sport: detail.sport
			});
			if (pick) void loadSessionGhost(String(pick.id));
		}
	}

	async function loadSessionGhost(id: string) {
		ghostId = id;
		ghostError = '';
		if (!id) {
			setGhost(null, '', null);
			return;
		}
		loadingGhost = true;
		try {
			const res = await fetch(`/api/workouts/${id}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = (await res.json()) as WorkoutDetail;
			setGhost(d.strokes, t('replay.ghostYour', { date: fmtDate(d.date) }), {
				kind: 'session',
				date: d.date,
				distance: d.distance
			});
			toast.success(t('replay.racingSession', { date: fmtDate(d.date) }), {
				description: `${fmtDistance(d.distance)} · ${fmtPace(d.pace)}`
			});
		} catch (err) {
			ghostId = '';
			toast.error(t('replay.loadSessionFailed'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		} finally {
			loadingGhost = false;
		}
	}

	async function selectGhost(e: Event) {
		await loadSessionGhost((e.target as HTMLSelectElement).value);
	}

	function applyPace() {
		const secs = parsePaceInput(paceInput);
		if (secs == null) {
			ghostError = t('replay.paceError');
			return;
		}
		ghostError = '';
		const paceLabel = `${fmtPaceBare(secs)}/500m`;
		setGhost(constantPaceGhost(secs, total), paceLabel, { kind: 'pace', paceLabel });
		toast.success(t('replay.pacingAt', { pace: fmtPace(secs) }));
	}

	async function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		ghostError = '';
		loadingGhost = true;
		try {
			const { strokes, name } = await parseWorkoutFile(file);
			if (!strokes.length) throw new Error(t('replay.noSamples'));
			fileName = name;
			setGhost(strokes, name, { kind: 'file', name });
			toast.success(t('replay.racingFile', { name }), {
				description: `${strokes.length} ${t('replay.samples')}`
			});
		} catch (err) {
			fileName = '';
			ghostError = err instanceof Error ? err.message : t('replay.fileReadError');
			toast.error(t('replay.importFailed'), { description: ghostError });
		} finally {
			loadingGhost = false;
			input.value = '';
		}
	}

	// Race gap (positive = player ahead of ghost), in metres and seconds.
	const gapMeters = $derived(ghostFrame ? frame.d - ghostFrame.d : 0);
	const gapSeconds = $derived.by(() => {
		if (!ghostFrame) return 0;
		const speedMs = frame.pace > 0 ? 500 / frame.pace : 0;
		return speedMs > 0 ? gapMeters / speedMs : 0;
	});

	const replayDuration = $derived(engine?.duration ?? detail.time);
	const raceFinished = $derived(ghostActive && replayDuration > 0 && frame.t >= replayDuration - 0.05);

	// Win/lose is decided by total time, not the live gap: when the ghost wins it
	// finishes first, so by the time the player reaches the line `gapMeters` is ~0.
	const raceWon = $derived(
		raceFinished && ghostStrokes != null && detail.time <= ghostStrokes[ghostStrokes.length - 1].t
	);

	const verdictText = $derived.by(() => {
		if (!raceFinished || !ghostRival || !ghostStrokes) return '';
		const playerTime = detail.time;
		const ghostTime = ghostStrokes[ghostStrokes.length - 1].t;
		const won = raceWon;
		let m = '0';
		if (won) {
			const ghostDistAtFinish = sampleAt(ghostStrokes, playerTime).d;
			m = String(Math.abs(Math.round(total - ghostDistAtFinish)));
		} else {
			const playerDistAtFinish = sampleAt(strokes, ghostTime).d;
			m = String(Math.abs(Math.round(total - playerDistAtFinish)));
		}
		const secs = Math.abs(playerTime - ghostTime).toFixed(1);
		const base = { seconds: secs, m };
		if (ghostRival.kind === 'session' && ghostRival.date != null) {
			const key = won ? 'replay.raceVerdictWinSession' : 'replay.raceVerdictLoseSession';
			return t(key, {
				...base,
				date: fmtDate(ghostRival.date),
				distance: fmtDistance(ghostRival.distance ?? 0)
			});
		}
		if (ghostRival.kind === 'pace' && ghostRival.paceLabel) {
			const key = won ? 'replay.raceVerdictWinPace' : 'replay.raceVerdictLosePace';
			return t(key, { ...base, pace: ghostRival.paceLabel });
		}
		if (ghostRival.kind === 'file' && ghostRival.name) {
			const key = won ? 'replay.raceVerdictWinFile' : 'replay.raceVerdictLoseFile';
			return t(key, { ...base, name: ghostRival.name });
		}
		return '';
	});

	// ---- Telemetry charts ----
	const xs = $derived(strokes.map((s) => s.t));
	const hasHr = $derived(strokesHaveHr(strokes));

	const hrPreviewLabel = $derived.by(() => {
		if (!hrImportPreview) return '';
		const avg = previewMergedAvgHr(baseDetail.strokes, hrImportPreview.samples, hrImportOffset);
		return t('replay.hrImportPreview', {
			count: String(hrImportPreview.samples.length),
			avg: avg != null ? String(avg) : '—'
		});
	});

	const chart = $derived(chartTheme(uiTheme.value));

	function metricOpts(
		label: string,
		role: SeriesRole,
		invert: boolean,
		fmt: (v: number) => string
	): Omit<uPlot.Options, 'width' | 'height'> {
		return baseOptions({
			theme: chart,
			xFmt: (v) => fmtTime(v),
			yAxes: [{ size: 52, fmt, invert }],
			series: [{ label, role, width: 1.5, fill: true }],
			cursor: { x: true, y: false }
		});
	}

	const paceData = $derived<uPlot.AlignedData>([xs, strokes.map((s) => s.pace)]);
	const rateData = $derived<uPlot.AlignedData>([xs, strokes.map((s) => s.spm)]);
	const powerData = $derived<uPlot.AlignedData>([xs, strokes.map((s) => s.watts)]);
	const hrData = $derived<uPlot.AlignedData>([xs, strokes.map((s) => s.hr ?? null)]);

	const paceOpts = $derived(metricOpts('pace', 'pace', true, (v) => fmtPace(v).replace('/500m', '')));
	const rateOpts = $derived(metricOpts('rate', 'rate', false, (v) => `${Math.round(v)}`));
	const powerOpts = $derived(metricOpts('power', 'power', false, (v) => `${Math.round(v)}w`));
	const hrOpts = $derived(metricOpts('hr', 'hr', false, (v) => `${Math.round(v)}`));

	// ---- Analysis ----
	const zones = $derived(hasHr ? hrZones(strokes) : []);
	const pc = $derived(powerCurve(strokes));
	const pcData = $derived<uPlot.AlignedData>([pc.map((p) => p.duration), pc.map((p) => p.watts)]);
	const pcOpts = $derived(metricOpts('best avg power', 'power', false, (v) => `${Math.round(v)}w`));

	// ---- Technique (stroke quality from logged pace/rate) ----
	const tech = $derived(techniqueSummary(strokes));
	const dpsData = $derived<uPlot.AlignedData>([tech.dps.map((d) => d.t), tech.dps.map((d) => d.v)]);
	const dpsOpts = $derived(metricOpts('dist/stroke', 'dps', false, (v) => `${v.toFixed(1)}m`));

	const eff = $derived(efficiencyByRate(strokes));
	// Scatter: pace (y, inverted) vs rate (x); a uPlot line over rate-sorted medians.
	const effData = $derived<uPlot.AlignedData>([eff.map((e) => e.spm), eff.map((e) => e.pace)]);
	const effOpts = $derived(
		baseOptions({
			theme: chart,
			xFmt: (v) => `${Math.round(v)}`,
			yAxes: [{ size: 52, fmt: (v) => fmtPace(v).replace('/500m', ''), invert: true }],
			series: [{ label: 'pace@rate', role: 'dps', width: 2, points: 7 }],
			cursor: { x: true, y: true }
		})
	);

	const paceRange = $derived.by(() => {
		const ps = strokes.map((s) => s.pace).filter((p) => p > 0);
		if (ps.length === 0) return { min: 60, max: 180 };
		return { min: Math.min(...ps) - 5, max: Math.max(...ps) + 5 };
	});
	const wattRange = $derived.by(() => {
		const watts = strokes.map((s) => s.watts);
		const maxWatt = watts.length > 0 ? Math.max(...watts) : 0;
		return { min: 0, max: Math.max(100, maxWatt * 1.1) };
	});

	// ---- Interval / rep breakdown (null for single-segment pieces) ----
	const intervals = $derived(intervalBreakdown(detail.splits, strokes));
	// "Interval breakdown" (reps with rest) vs "Splits" (even splits of a
	// continuous piece) — same comparison, honest label.
	const segLabel = $derived(
		detail.isInterval ? t('replay.intervalBreakdown') : t('replay.splitBreakdown')
	);
	const segUnit = $derived(detail.isInterval ? t('replay.segReps') : t('replay.segSplits'));
	// Bar widths for the per-rep pace comparison, scaled to the slowest rep.
	function repBarPct(pace: number): number {
		if (!intervals || intervals.slowest <= 0) return 0;
		return (pace / intervals.slowest) * 100;
	}

	// ---- Full metadata ----
	const avgPower = $derived(
		detail.pace > 0 || (detail.wattMinutes && detail.time > 0) ? avgWatts(detail) : 0
	);
	const dateTime = $derived(fmtLogbookDateTime(detail.date));

	let sharing = $state(false);
	let publishing = $state(false);
	let withdrawing = $state(false);
	// Whether this piece is currently on the board. Seeded from the server (which
	// knows about entries published in a past session) and flipped on publish/withdraw.
	let published = $state(data.published ?? false);

	// Publishing to a board only applies to a signed-in athlete's own
	// standard-distance piece — demo athletes and off-board distances can't rank.
	const canPublish = $derived(
		!data.demo && !!data.user && matchStandardDistance(detail.distance) != null
	);

	async function publishToLeaderboard() {
		publishing = true;
		try {
			const res = await fetch('/api/leaderboard/publish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workoutId: detail.id })
			});
			if (res.status === 422) {
				toast.info(t('leaderboard.publishOffBoard'));
				return;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const result = (await res.json()) as {
				board: { sport: Sport; distance: number };
				rank: number;
			};
			published = true;
			toast.success(
				t('leaderboard.publishOk', {
					rank: result.rank,
					sport: SPORT_LABEL[result.board.sport],
					distance: fmtDistance(result.board.distance)
				})
			);
		} catch (err) {
			toast.error(t('leaderboard.publishFailed'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		} finally {
			publishing = false;
		}
	}

	async function withdrawFromLeaderboard() {
		withdrawing = true;
		try {
			const res = await fetch('/api/leaderboard/publish', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workoutId: detail.id })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			published = false;
			toast.success(t('leaderboard.withdrawOk'));
		} catch (err) {
			toast.error(t('leaderboard.withdrawFailed'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		} finally {
			withdrawing = false;
		}
	}

	async function onHrFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		hrImportError = '';
		hrImportBusy = true;
		try {
			const { samples, name } = await parseHrFile(file);
			hrImportPreview = { samples, name };
			hrImportOffset = 0;
		} catch (err) {
			hrImportPreview = null;
			const msg = err instanceof Error && err.message === 'too_few_samples'
				? t('replay.hrImportTooFew')
				: err instanceof Error
					? err.message
					: t('replay.fileReadError');
			hrImportError = msg;
		} finally {
			hrImportBusy = false;
			input.value = '';
		}
	}

	async function applyHrImportAction() {
		if (!hrImportPreview) return;
		hrImportError = '';
		hrImportBusy = true;
		const payload: HrOverlay = { samples: hrImportPreview.samples, offset: hrImportOffset };
		try {
			if (isDemo) {
				writeHrOverlay(baseDetail.id, payload);
				hrOverlay = payload;
			} else {
				const res = await fetch(`/api/workouts/${baseDetail.id}/hr-import`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				hrOverlay = payload;
			}
			hrOverlayId = baseDetail.id;
			hrImportPreview = null;
			toast.success(t('replay.hrImportApplied'));
		} catch (err) {
			hrImportError = err instanceof Error ? err.message : t('replay.hrImportSaveFailed');
			toast.error(t('replay.hrImportSaveFailed'), { description: hrImportError });
		} finally {
			hrImportBusy = false;
		}
	}

	async function clearHrImportAction() {
		hrImportError = '';
		hrImportBusy = true;
		try {
			if (isDemo) {
				clearHrOverlay(baseDetail.id);
			} else {
				const res = await fetch(`/api/workouts/${baseDetail.id}/hr-import`, { method: 'DELETE' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
			}
			hrOverlay = null;
			hrOverlayId = null;
			hrImportPreview = null;
			hrImportOffset = 0;
			toast.success(t('replay.hrImportCleared'));
		} catch (err) {
			hrImportError = err instanceof Error ? err.message : t('replay.hrImportClearFailed');
			toast.error(t('replay.hrImportClearFailed'), { description: hrImportError });
		} finally {
			hrImportBusy = false;
		}
	}

	async function shareReplay() {
		sharing = true;
		try {
			const res = await fetch(`/api/workouts/${detail.id}/share`, { method: 'POST' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { url: string };
			const title = detail.workoutType || detail.sport;
			if (typeof navigator.share === 'function') {
				try {
					await navigator.share({ url: body.url, title });
					toast.success(t('share.linkReady'));
					return;
				} catch (e) {
					if (e instanceof Error && e.name === 'AbortError') return;
					throw e;
				}
			}
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(body.url);
				toast.success(t('share.linkCopied'), { description: t('share.linkReady') });
			} else {
				toast.success(body.url, { description: t('share.linkReady') });
			}
		} catch (err) {
			toast.error(t('share.shareFailed'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		} finally {
			sharing = false;
		}
	}

	async function downloadRaceCard() {
		try {
			await downloadRaceCardPng(detail, uiTheme.value, {
				brand: t('share.raceCardBrand'),
				avgPower: t('share.raceCardAvgPower'),
				avgHr: t('share.raceCardAvgHr')
			});
			toast.success(t('share.imageSaved'));
		} catch (err) {
			toast.error(t('share.imageFailed'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		}
	}

	// --- Coaching annotations ---
	async function saveAnnotation(a: { id: number; timestamp: number; text: string }) {
		const res = await fetch(`/api/workouts/${detail.id}/annotations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(a)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const { annotation } = (await res.json()) as { annotation: Annotation };
		if (a.id > 0) {
			const idx = annotations.findIndex((x) => x.id === a.id);
			if (idx >= 0) annotations[idx] = annotation;
		} else {
			annotations = [...annotations, annotation];
		}
	}

	async function deleteAnnotation(id: number) {
		const res = await fetch(`/api/workouts/${detail.id}/annotations?annotationId=${id}`, {
			method: 'DELETE'
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		annotations = annotations.filter((a) => a.id !== id);
	}
</script>

<svelte:head><title>{t('common.replay')} · {detail.workoutType || SPORT_LABEL[detail.sport]} · rowplay</title></svelte:head>

<div class="container">
	<a href="/dashboard" class="back muted"><ArrowLeft size={14} /> {t('replay.back')}</a>
	<div class="head">
		<h1
			><span class="h1icon" style:color={MACHINE_COLOR[detail.sport]}
				><SportIcon sport={detail.sport} size={22} /></span
			>
			{detail.workoutType || SPORT_LABEL[detail.sport]}</h1
		>
		<div class="summary mono muted">
			{fmtDistance(detail.distance)} · {fmtTime(detail.time, true)} · {fmtPace(detail.pace)}
			{#if !detail.hasStrokeData}<span class="badge">{t('replay.lowRes')}</span>{/if}
		</div>
		<div class="sharebar">
			<button class="btn btn-ghost btn-sm" type="button" disabled={sharing} onclick={shareReplay}>
				<Share2 size={14} />
				{sharing ? t('common.loading') : t('share.shareReplay')}
			</button>
			<button class="btn btn-ghost btn-sm" type="button" onclick={downloadRaceCard}>
				<ImageDown size={14} />
				{t('share.downloadImage')}
			</button>
			{#if canPublish}
				<button
					class="btn ghost small"
					type="button"
					disabled={publishing}
					onclick={publishToLeaderboard}
				>
					<Trophy size={14} />
					{publishing ? t('leaderboard.publishing') : t('leaderboard.publish')}
				</button>
				{#if published}
					<button
						class="btn ghost small"
						type="button"
						disabled={withdrawing}
						onclick={withdrawFromLeaderboard}
					>
						{withdrawing ? t('leaderboard.withdrawing') : t('leaderboard.withdraw')}
					</button>
				{/if}
			{/if}
		</div>
		{#if canPublish}
			<p class="muted small publish-note">{t('leaderboard.publishNote')}</p>
		{/if}
	</div>

	{#if !logbookHasHr}
		<div class="card hrimport">
			<div class="hrimport-head">
				<Heart size={15} />
				<strong>{t('replay.hrImportTitle')}</strong>
			</div>
			<p class="muted small hrimport-hint">{t('replay.hrImportHint')}</p>
			<div class="hrimport-row">
				<input
					class="fileinput"
					type="file"
					accept=".csv,.tcx,.fit"
					onchange={onHrFile}
					aria-label={t('replay.hrImportTitle')}
				/>
				<span class="muted small">{t('replay.hrImportFormats')}</span>
			</div>
			{#if hrImportPreview}
				<div class="hrimport-row">
					<label class="muted small" for="hr-offset">{t('replay.hrImportOffset')}</label>
					<input
						id="hr-offset"
						class="offset-input mono"
						type="range"
						min="-600"
						max="600"
						step="1"
						bind:value={hrImportOffset}
					/>
					<span class="mono small">{hrImportOffset}s</span>
				</div>
				<p class="muted small">{t('replay.hrImportOffsetHint')}</p>
				<p class="mono small">{hrPreviewLabel}</p>
				<div class="hrimport-actions">
					<button
						class="btn ghost small"
						type="button"
						disabled={hrImportBusy}
						onclick={applyHrImportAction}
					>
						{t('replay.hrImportApply')}
					</button>
				</div>
			{/if}
			{#if hrOverlay}
				<button
					class="btn ghost small"
					type="button"
					disabled={hrImportBusy}
					onclick={clearHrImportAction}
				>
					{t('replay.hrImportClear')}
				</button>
			{/if}
			{#if hrImportBusy}<span class="muted small">{t('common.loading')}</span>{/if}
			{#if hrImportError}<span class="err small">{hrImportError}</span>{/if}
		</div>
	{/if}

	<!-- Comparison / race control -->
	<div class="card ghostbar">
		<label for="cmode"><Ghost size={15} /> {t('replay.compareAgainst')}</label>
		<select id="cmode" value={compareMode} onchange={onModeChange}>
			<option value="none">{t('replay.none')}</option>
			{#if candidates.length}<option value="session">{t('replay.pastSession')}</option>{/if}
			<option value="pace">{t('replay.constantPace')}</option>
			<option value="file">{t('replay.uploadedFile')}</option>
		</select>

		{#if compareMode === 'session' && candidates.length}
			{#if candidates.length >= SEARCHABLE_MIN}
				<search>
				<input
					class="session-search"
					type="search"
					inputmode="search"
					enterkeyhint="search"
					bind:value={sessionSearch}
					placeholder={t('replay.searchSessions')}
					aria-label={t('replay.searchSessions')}
				/>
				</search>
			{/if}
			<select id="ghost" value={ghostId} onchange={selectGhost}>
				<option value="">{t('replay.chooseSession', { sport: SPORT_LABEL[detail.sport] })}</option>
				{#each filteredCandidates as c (c.id)}
					<option value={c.id}>
						{fmtDate(c.date)} · {fmtDistance(c.distance)} · {fmtPace(c.pace)}
					</option>
				{/each}
			</select>
		{:else if compareMode === 'pace'}
			<input
				class="paceinput mono"
				type="text"
				bind:value={paceInput}
				placeholder="1:52"
				aria-label="Pace per 500m"
				onkeydown={(e) => e.key === 'Enter' && applyPace()}
			/>
			<span class="muted small">/500m</span>
			<button class="btn btn-ghost btn-sm" onclick={applyPace}>{t('replay.setPace')}</button>
		{:else if compareMode === 'file'}
			<input
				class="fileinput"
				type="file"
				accept=".csv,.tcx,.fit"
				onchange={onFile}
				aria-label="Upload CSV, TCX, or FIT file"
			/>
			<span class="muted small">{t('replay.fileFormats')}</span>
			{#if fileName}<span class="muted small">· {fileName}</span>{/if}
		{/if}

		{#if loadingGhost}<span class="muted small">{t('common.loading')}</span>{/if}
		{#if ghostError}<span class="err small">{ghostError}</span>{/if}

		{#if ghostActive && ghostFrame && !raceFinished}
			<div class="gap mono" class:ahead={gapMeters >= 0} class:behind={gapMeters < 0} role="status" aria-live="polite">
				<span class="gap-main">
					{gapMeters >= 0
						? t('replay.ahead', { m: Math.abs(Math.round(gapMeters)) })
						: t('replay.behind', { m: Math.abs(Math.round(gapMeters)) })}
				</span>
				<span class="gap-secs">({Math.abs(gapSeconds).toFixed(1)}s)</span>
			</div>
		{/if}
	</div>

	{#if raceFinished && verdictText}
		<div
			class="card verdict"
			class:win={raceWon}
			class:lose={!raceWon}
			role="status"
			aria-live="polite"
		>
			<div class="verdict-kicker">{t('replay.raceFinished')}</div>
			<p class="verdict-body">{verdictText}</p>
		</div>
	{/if}

	<!-- Course -->
	<div class="card course" bind:this={courseWrap}>
		<div
			class="view-toggle"
			role="group"
			aria-label={t('replay.viewToggle')}
		>
			<button
				type="button"
				class="vbtn"
				class:on={rendererKind === '2d'}
				aria-pressed={rendererKind === '2d'}
				onclick={() => onRendererToggle('2d')}
			>
				{t('replay.view2d')}
			</button>
			<button
				type="button"
				class="vbtn"
				class:on={rendererKind === '3d'}
				aria-pressed={rendererKind === '3d'}
				disabled={!webglOk || loading3d}
				title={!webglOk ? t('replay.view3dUnsupported') : undefined}
				onclick={() => onRendererToggle('3d')}
			>
				{#if loading3d}
					<span class="vspin" aria-hidden="true"></span>
					{t('replay.view3dLoading')}
				{:else}
					{t('replay.view3d')}
				{/if}
			</button>
		</div>
		{#if rendererKind === '3d'}
			<label class="quality-select">
				<span class="quality-label">{t('replay.quality')}</span>
				<select
					value={quality}
					disabled={loading3d}
					onchange={(e) => onQualityChange(e.currentTarget.value as RenderQuality)}
				>
					<option value="low">{t('replay.qualityLow')}</option>
					<option value="medium">{t('replay.qualityMedium')}</option>
					<option value="high">{t('replay.qualityHigh')}</option>
				</select>
			</label>
		{/if}
		<canvas bind:this={canvas2dEl} class:hidden={activeCanvas !== '2d'}></canvas>
		<div class="canvas3d-host" bind:this={canvas3dHost} class:hidden={activeCanvas !== '3d'}></div>
	</div>

	<!-- Transport controls -->
	<div class="card controls">
		<button class="btn btn-primary play" onclick={() => engine?.toggle()} aria-label={playing ? t('replay.pause') : t('replay.play')}>
			{#if playing}<Pause size={16} /> {t('replay.pause')}{:else}<Play size={16} /> {t('replay.play')}{/if}
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
		<div class="speeds" role="group" aria-label="Playback speed">
			{#each SPEEDS as s}
				<button class="sbtn" class:on={speed === s} aria-pressed={speed === s} onclick={() => setSpeed(s)}>{s}×</button>
			{/each}
		</div>
	</div>

	<!-- Live gauges -->
	<div class="gauges card">
		<MetricGauge
			label={t('replay.gPace')} unit="/500m"
		display={fmtPace(frame.pace).replace('/500m', '')}
			value={frame.pace} min={paceRange.max} max={paceRange.min} color="var(--pace)"
		/>
		<MetricGauge
			label={t('replay.gRate')} unit={sportTheme.cadenceUnit}
			display={`${Math.round(frame.spm)}`}
			value={frame.spm} min={0} max={60} color="var(--rate)"
		/>
		<MetricGauge
			label={t('replay.gPower')} unit="watts"
			display={`${Math.round(frame.watts)}`}
			value={frame.watts} min={wattRange.min} max={wattRange.max} color="var(--power)"
		/>
		{#if hasHr}
			<MetricGauge
				label={t('replay.gHeart')} unit="bpm"
				display={frame.hr != null ? `${Math.round(frame.hr)}` : '--'}
				value={frame.hr ?? 0} min={90} max={200} color="var(--hr)"
			/>
		{/if}
	</div>

	<!-- Coaching annotations -->
	<AnnotationPanel
		{annotations}
		currentTime={frame.t}
		onsave={saveAnnotation}
		ondelete={deleteAnnotation}
		onseek={(ts) => engine?.seek(ts)}
	/>

	<!-- Telemetry traces -->
	<div class="charts">
		<div class="card">
			<div class="ctitle muted">{t('replay.cPace')}</div>
			<UPlotChart data={paceData} options={paceOpts} height={150} marker={frame.t} caption={t('replay.cPace')} />
		</div>
		<div class="card">
			<div class="ctitle muted">{t('replay.cRate')}</div>
			<UPlotChart data={rateData} options={rateOpts} height={150} marker={frame.t} caption={t('replay.cRate')} />
		</div>
		<div class="card">
			<div class="ctitle muted">{t('replay.cPower')}</div>
			<UPlotChart data={powerData} options={powerOpts} height={150} marker={frame.t} caption={t('replay.cPower')} />
		</div>
		{#if hasHr}
			<div class="card">
				<div class="ctitle muted">{t('replay.cHeart')}</div>
				<UPlotChart data={hrData} options={hrOpts} height={150} marker={frame.t} caption={t('replay.cHeart')} />
			</div>
		{/if}
	</div>

	<!-- Technique (stroke quality) -->
	<div class="card technique">
		<div class="ctitle muted">{t('replay.strokeQuality')}</div>
		<div class="techstats">
			<div class="ts">
				<div class="tv mono">{tech.avgDps.toFixed(1)}<span class="tu">m</span></div>
				<div class="tl muted">{t('replay.avgDistStroke')}</div>
			</div>
			<div class="ts">
				<div class="tv mono">{Math.round(tech.avgSpm)}<span class="tu">{sportTheme.cadenceUnit}</span></div>
				<div class="tl muted">{t('replay.avgRate')}</div>
			</div>
			<div class="ts">
				<div class="tv mono">{tech.paceConsistency.toFixed(1)}<span class="tu">%</span></div>
				<div class="tl muted">{t('replay.paceVariation')} <span class="hint">{t('replay.paceVariationHint')}</span></div>
			</div>
			<div class="ts">
				<div class="tv mono" class:good={tech.fade <= 0} class:bad={tech.fade > 1.5}>
					{tech.fade > 0 ? '+' : ''}{tech.fade.toFixed(1)}<span class="tu">%</span>
				</div>
				<div class="tl muted">{t('replay.fade')} <span class="hint">({tech.fade <= 0 ? t('replay.negSplit') : t('replay.slowedDown')})</span></div>
			</div>
		</div>
	</div>

	<div class="analysis">
		<div class="card">
			<div class="ctitle muted">{t('replay.distPerStroke')} <span class="hint">{t('replay.distPerStrokeHint')}</span></div>
			<UPlotChart data={dpsData} options={dpsOpts} height={150} marker={frame.t} caption={t('replay.distPerStroke')} />
		</div>
		{#if eff.length > 2}
			<div class="card">
				<div class="ctitle muted">{t('replay.paceVsRate')} <span class="hint">{t('replay.paceVsRateHint')}</span></div>
				<UPlotChart data={effData} options={effOpts} height={150} caption={t('replay.paceVsRate')} />
			</div>
		{/if}
	</div>

	<!-- Analysis -->
	<div class="analysis">
		{#if pc.length}
			<div class="card">
				<div class="ctitle muted">{t('replay.powerCurve')}</div>
				<UPlotChart data={pcData} options={pcOpts} height={170} caption={t('replay.powerCurve')} />
			</div>
		{/if}
		{#if zones.length}
			<div class="card">
				<div class="ctitle muted">{t('replay.hrZones')}</div>
				<div class="zonebar">
					{#each zones as z}
						{#if z.fraction > 0}
							<div
								class="zoneseg"
								style:width="{z.fraction * 100}%"
								style:background="var(--zone-{z.zone})"
								title="{t('replay.zone' + z.zone)}: {fmtTime(z.seconds)}"
							></div>
						{/if}
					{/each}
				</div>
				<div class="zonelegend">
					{#each zones as z}
						<div class="zli">
							<span class="dot" style:background="var(--zone-{z.zone})"></span>
							<span class="zname">{t('replay.zone' + z.zone)}</span>
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
					<div class="ssv mono">{fmtPaceBare(intervals.avgPace)}</div>
					<div class="ssl muted">{detail.isInterval ? t('replay.avgRepPace') : t('replay.avgSplitPace')}</div>
				</div>
				<div class="ss">
					<div class="ssv mono">{intervals.consistency.toFixed(1)}%</div>
					<div class="ssl muted">{t('replay.consistency')} <span class="hint">{t('replay.consistencyHint')}</span></div>
				</div>
				<div class="ss">
					<div class="ssv mono" class:good={intervals.fade <= 0} class:bad={intervals.fade > 2}>
						{intervals.fade > 0 ? '+' : ''}{intervals.fade.toFixed(1)}%
					</div>
					<div class="ssl muted">{t('replay.setFade')} <span class="hint">({intervals.fade <= 0 ? t('replay.negSplit') : t('replay.faded')})</span></div>
				</div>
				<div class="ss">
					<div class="ssv mono">{fmtPaceBare(intervals.fastest)} → {fmtPaceBare(intervals.slowest)}</div>
					<div class="ssl muted">{t('replay.fastestSlowest')}</div>
				</div>
			</div>

			<div class="reps">
				{#each intervals.reps as r}
					<div class="rep" class:fastest={r.isFastest} class:slowest={r.isSlowest}>
						<div class="repno mono">#{r.index + 1}</div>
						<div class="repbarwrap">
						<div class="repbar" style:width="{repBarPct(r.pace)}%" style:background={r.isFastest ? 'var(--accent-2)' : r.isSlowest ? 'var(--warn)' : MACHINE_COLOR[detail.sport]}></div>
							<span class="repbarlabel mono">{fmtPace(r.pace).replace('/500m', '')}</span>
						</div>
						<div class="repmeta mono muted">
							{fmtDistance(r.distance)} · {fmtTime(r.time, true)} · {r.spm}{sportTheme.cadenceUnit}
							{#if r.hr}· {r.hr}bpm{/if}
							{#if r.dps > 0}· {r.dps.toFixed(1)}m/st{/if}
						</div>
						<div class="repdelta mono" class:good={r.vsAverage < 0} class:bad={r.vsAverage > 0}>
							{r.vsAverage < 0 ? '−' : '+'}{fmtPaceBare(Math.abs(r.vsAverage), true)}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if detail.splits.length}
		<!-- Single-segment piece: plain split table -->
		<div class="card splits">
			<h3>{t('replay.splitsTitle')}</h3>
			<table class="mono">
				<thead>
					<tr><th>{t('replay.thNum')}</th><th>{t('replay.thDist')}</th><th>{t('replay.thTime')}</th><th>{t('replay.thPace')}</th><th>{t('replay.thRate')}</th><th>{t('replay.thHr')}</th></tr>
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

	<!-- Full workout metadata -->
	<div class="card meta">
		<div class="ctitle muted">{t('replay.workoutDetails')}</div>
		<dl class="metagrid">
			<div><dt>{t('replay.mDate')}</dt><dd>{dateTime}</dd></div>
			<div><dt>{t('replay.mSport')}</dt><dd>{SPORT_LABEL[detail.sport]}</dd></div>
			<div><dt>{t('replay.mType')}</dt><dd>{detail.workoutType || '—'}</dd></div>
			<div><dt>{t('replay.mDistance')}</dt><dd class="mono">{fmtDistance(detail.distance)}</dd></div>
			<div><dt>{t('replay.mTime')}</dt><dd class="mono">{fmtTime(detail.time, true)}</dd></div>
			<div><dt>{t('replay.mAvgPace')}</dt><dd class="mono">{fmtPace(detail.pace)}</dd></div>
			<div><dt>{t('replay.mAvgRate')}</dt><dd class="mono">{detail.strokeRate ?? '—'} {sportTheme.cadenceUnit}</dd></div>
			<div><dt>{t('replay.mStrokeCount')}</dt><dd class="mono">{detail.strokeCount ?? '—'}</dd></div>
			<div><dt>{t('replay.mAvgPower')}</dt><dd class="mono">{avgPower} W</dd></div>
			<div>
				<dt>{t('replay.mAvgHr')}</dt>
				<dd class="mono">{detail.heartRateAvg != null ? Math.round(detail.heartRateAvg) + ' bpm' : '—'}</dd>
			</div>
			<div>
				<dt>{t('replay.mHrRange')}</dt>
				<dd class="mono">
					{detail.hrMin != null && detail.hrMax != null
						? `${detail.hrMin}–${detail.hrMax} bpm`
						: '—'}
				</dd>
			</div>
			<div>
				<dt>{t('replay.mCalories')}</dt>
				<dd class="mono">{detail.caloriesTotal != null ? detail.caloriesTotal + ' cal' : '—'}</dd>
			</div>
			<div><dt>{t('replay.mDragFactor')}</dt><dd class="mono">{detail.dragFactor ?? '—'}</dd></div>
			<div>
				<dt>{t('replay.mResolution')}</dt>
				<dd class="mono">
					{detail.strokes.length} {t('replay.samples')} · {detail.hasStrokeData
						? t('replay.perStroke')
						: t('replay.fromSplits')}
				</dd>
			</div>
			<div>
				<dt>{t('replay.mSegments')}</dt>
				<dd class="mono">
					{detail.splits.length} {detail.isInterval ? t('replay.intervalsWord') : t('replay.splitsWord')}
				</dd>
			</div>
			<div><dt>{t('replay.mWorkoutId')}</dt><dd class="mono">{detail.id}</dd></div>
			<div class="wide"><dt>{t('replay.mComments')}</dt><dd>{detail.comments || '—'}</dd></div>
		</dl>
	</div>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--display);
		font-size: 0.82rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-2);
		margin-bottom: 0.75rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: var(--bd-heavy);
	}
	.head h1 {
		margin: 0;
		font-size: clamp(1.4rem, 5vw, 1.75rem);
		font-weight: 900;
		text-transform: uppercase;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.h1icon {
		display: inline-flex;
	}
	.summary {
		font-size: 0.95rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.sharebar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.sharebar .btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.hrimport {
		margin-bottom: 0.75rem;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.hrimport-head {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
	}
	.hrimport-hint {
		margin: 0;
		line-height: 1.45;
	}
	.hrimport-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.hrimport-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.offset-input {
		flex: 1;
		min-width: 8rem;
		max-width: 16rem;
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
	.ghostbar select,
	.session-search {
		background: var(--paper-inset);
		color: var(--ink);
		border: var(--bd);
		border-radius: var(--r-ctrl);
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
	}
	.session-search {
		min-width: 10rem;
		max-width: 14rem;
	}
	.paceinput {
		width: 5rem;
		background: var(--paper-inset);
		color: var(--ink);
		border: var(--bd);
		border-radius: var(--r-ctrl);
		padding: 0.4rem 0.6rem;
		font-family: var(--mono);
		font-size: 0.9rem;
		text-align: center;
	}
	.fileinput {
		font-size: 0.8rem;
		color: var(--ink-2);
		max-width: 240px;
	}
	.err {
		color: var(--alarm);
	}
	.gap {
		margin-left: auto;
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		font-weight: 800;
		font-size: clamp(1.05rem, 3.5vw, 1.35rem);
		padding: 0.4rem 0.85rem;
		border-radius: var(--r-ctrl);
		border: var(--bd-heavy);
		box-shadow: var(--stamp-live);
	}
	.gap-main {
		letter-spacing: 0.02em;
	}
	.gap-secs {
		font-size: 0.82em;
		font-weight: 700;
		opacity: 0.92;
	}
	.gap.ahead {
		color: var(--paper-raised);
		background: var(--ahead);
		font-family: var(--display);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.gap.behind {
		color: var(--paper-raised);
		background: var(--behind);
		font-family: var(--display);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.verdict {
		margin-bottom: 0.75rem;
		padding: 0.85rem 1.1rem;
		border: var(--bd-heavy);
	}
	.verdict.win {
		background: color-mix(in srgb, var(--ahead) 14%, var(--paper-raised));
		border-color: var(--ahead);
	}
	.verdict.lose {
		background: color-mix(in srgb, var(--behind) 14%, var(--paper-raised));
		border-color: var(--behind);
	}
	.verdict-kicker {
		font-family: var(--display);
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-2);
		margin-bottom: 0.35rem;
	}
	.verdict-body {
		margin: 0;
		font-size: clamp(1rem, 3.2vw, 1.2rem);
		font-weight: 700;
		line-height: 1.35;
	}
	.verdict.win .verdict-body {
		color: var(--ahead);
	}
	.verdict.lose .verdict-body {
		color: var(--behind);
	}
	.small {
		font-size: 0.8rem;
	}
	.course {
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.view-toggle {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}
	.quality-select {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
		font-size: 0.78rem;
		color: var(--muted-ink, var(--ink));
	}
	.quality-select select {
		background: var(--paper-raised);
		border: var(--bd);
		color: var(--ink);
		border-radius: var(--r-ctrl);
		padding: 0.2rem 0.4rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.quality-select select:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.vbtn {
		background: var(--paper-raised);
		border: var(--bd);
		color: var(--ink);
		border-radius: var(--r-ctrl);
		padding: 0.28rem 0.65rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--display);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.vbtn.on {
		background: var(--live);
		color: var(--paper-raised);
		border-color: var(--live);
	}
	.vbtn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.vspin {
		width: 0.75rem;
		height: 0.75rem;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: vspin 0.7s linear infinite;
	}
	@keyframes vspin {
		to {
			transform: rotate(360deg);
		}
	}
	.course canvas {
		display: block;
		width: 100%;
	}
	.course .canvas3d-host {
		display: block;
		width: 100%;
	}
	.course .hidden {
		display: none;
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
		accent-color: var(--live);
	}
	.dist {
		min-width: 90px;
		text-align: right;
		color: var(--ink-2);
	}
	.speeds {
		display: flex;
		gap: 0.3rem;
	}
	.sbtn {
		background: var(--paper-raised);
		border: var(--bd);
		color: var(--ink);
		border-radius: var(--r-ctrl);
		padding: 0.28rem 0.5rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--mono);
	}
	.sbtn.on {
		background: var(--live);
		color: var(--paper-raised);
		border-color: var(--live);
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
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: 10px;
		padding: 0.6rem 0.8rem;
	}
	.tv {
		font-size: 1.5rem;
		font-weight: 700;
	}
	.tv.good {
		color: var(--ahead);
	}
	.tv.bad {
		color: var(--behind);
	}
	.tu {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--ink-2);
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
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: 10px;
		padding: 0.5rem 0.7rem;
	}
	.ssv {
		font-size: 1.15rem;
		font-weight: 700;
	}
	.ssv.good {
		color: var(--ahead);
	}
	.ssv.bad {
		color: var(--behind);
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
		color: var(--ink-2);
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
		color: var(--ahead);
	}
	.repdelta.bad {
		color: var(--behind);
	}
	.meta {
		margin-bottom: 0.75rem;
	}
	.metagrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 0.4rem 1rem;
		margin: 0.5rem 0 0;
	}
	.metagrid > div {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.3rem 0;
		border-bottom: var(--bd);
	}
	.metagrid .wide {
		grid-column: 1 / -1;
	}
	.metagrid dt {
		font-size: 0.72rem;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.metagrid dd {
		margin: 0;
		font-size: 0.9rem;
	}
	.splits table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.splits th {
		text-align: left;
		color: var(--ink-2);
		font-weight: 600;
		padding: 0.3rem 0.5rem;
		border-bottom: var(--bd);
	}
	.splits td {
		padding: 0.3rem 0.5rem;
		border-bottom: var(--bd);
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
	@media (max-width: 390px) {
		.ghostbar {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}
		.ghostbar label {
			width: 100%;
		}
		.ghostbar select,
		.paceinput,
		.fileinput {
			width: 100%;
			max-width: none;
		}
		.gap {
			margin-left: 0;
			width: 100%;
			text-align: center;
		}
		.head {
			flex-direction: column;
			align-items: flex-start;
		}
		.summary {
			flex-wrap: wrap;
		}
		.speeds {
			flex-wrap: wrap;
			justify-self: stretch;
			width: 100%;
		}
		.splits {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}
	}
</style>
