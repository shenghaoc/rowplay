<script lang="ts">
	import { onMount } from 'svelte';
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import MetricGauge from '$components/MetricGauge.svelte';
	import { base, resolve } from '$app/paths';
	import { ReplayEngine, sampleAt, sampleIndexAt, type Frame } from '$lib/replay/engine';
	import { splitIndexAt } from '$lib/replay/inspector';
	import { CourseRenderer, type RenderState, type ReplayRenderer } from '$lib/replay/renderer';
	import {
		loadRendererPref,
		saveRendererPref,
		loadQualityPref,
		saveQualityPref,
		type RendererKind,
		type RenderQuality
	} from '$lib/replay/replayRenderer';
	import {
		createRenderer3D,
		renderer3dSupported,
		webglSupported,
		type Renderer3DBackend
	} from '$lib/replay/renderer3dLoader';
	import { MACHINE_COLOR, themeFor } from '$lib/replay/sports';
	import { buildStrokeTimeline, strokePoseAt } from '$lib/replay/strokeModel';
	import {
		hrZones,
		powerCurve,
		techniqueSummary,
		efficiencyDrift,
		efficiencyByRate,
		intervalBreakdown,
		targetVsActual,
		workRestEfficiency,
		type TargetVsActualRow
	} from '$lib/analytics';
	import { avgWatts, fmtDate, fmtDistance, fmtPace, fmtPaceBare, fmtTime, fmtLogbookDateTime, SPORT_LABEL } from '$lib/format';
	import type { Sport, Stroke, Workout, WorkoutDetail } from '$lib/types';
	import { isExrSource } from '$lib/exrSource';
	import { untrack } from 'svelte';
	import { constantPaceGhost, parseWorkoutFile } from '$lib/replay/sources';
	import {
		raceGapMetres,
		raceGapSeconds,
		ghostDistAtPlayerFinish,
		playerDistAtGhostFinish
	} from '$lib/replay/replayGap';
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
	import { areComparable } from '$lib/replay/comparabilityGuard';
	import { toast } from 'svelte-sonner';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Ghost from '@lucide/svelte/icons/ghost';
	import X from '@lucide/svelte/icons/x';
	import ImageDown from '@lucide/svelte/icons/image-down';
	import Heart from '@lucide/svelte/icons/heart';
	import Binary from '@lucide/svelte/icons/binary';
	import { downloadRaceCardPng } from '$lib/replay/raceCard';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import { chartTheme, baseOptions, type SeriesConfig, type SeriesRole } from '$lib/chartTheme';
	import { formatPaceInput, parsePaceInput } from '$lib/paceInput';
	import SportIcon from '$components/SportIcon.svelte';
	import { page } from '$app/state';
	import InspectorPanel from '$components/InspectorPanel.svelte';
	import RepComparisonChart from '$components/RepComparisonChart.svelte';
	import WorkoutMomentCards from '$components/WorkoutMomentCards.svelte';
	import { detectReps, repColor, repsHaveHr, type RepMetric } from '$lib/repComparison';
	import { analyzeWorkoutMoments } from '$lib/workoutMoments';

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const uiTheme = getThemeContext();
	const baseDetail = $derived(data.detail as WorkoutDetail);
	const candidates = $derived(data.candidates as Workout[]);
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

	const detail = $derived.by(() => {
		const base =
			hrOverlay && hrOverlayId === baseDetail.id
				? applyHrImport(baseDetail, hrOverlay.samples, hrOverlay.offset)
				: baseDetail;
		return base;
	});
	const exrFlagged = $derived(isExrSource(detail));
	const logbookHasHr = $derived(strokesHaveHr(baseDetail.strokes));
	const sportTheme = $derived(themeFor(detail.sport));
	const total = $derived(detail.distance);
	const strokes = $derived(detail.strokes);
	const strokeTimeline = $derived(buildStrokeTimeline(strokes, detail.sport, detail.hasStrokeData));

	let frame = $state<Frame>(untrack(() => sampleAt(strokes, 0)));
	const sampleIdx = $derived(sampleIndexAt(strokes, frame.t));
	const rawStroke = $derived(sampleIdx >= 0 ? strokes[sampleIdx] : null);
	const inspectorSplitIdx = $derived(
		rawStroke && detail.splits.length ? splitIndexAt(detail.splits, rawStroke.d) : null
	);
	let playing = $state(false);
	// Start at a technique-readable, real-time cadence. Faster speeds remain
	// available for a quick review, but 1× preserves the athlete's actual joint
	// timing and equipment contact on first play.
	const DEFAULT_SPEED = 1;
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
		hasStrokeData?: boolean;
	};
	let compareMode = $state<CompareMode>('none');
	// `$state.raw` so reassigning the whole array is reactive (verdict/raceWon
	// track it) without deep-proxying a large stroke array on the render hot path.
	let ghostStrokes = $state.raw<Stroke[] | null>(null);
	let ghostActive = $state(false);
	let ghostLabel = $state('');
	let ghostFrame = $state<Frame | null>(null);
	let ghostRival = $state<GhostRival | null>(null);
	const ghostStrokeTimeline = $derived(
		ghostStrokes ? buildStrokeTimeline(ghostStrokes, detail.sport, ghostRival?.hasStrokeData === true) : null
	);
	let loadingGhost = $state(false);
	let ghostError = $state('');
	let ghostLoadGen = $state(0);
	// sub-control inputs
	let ghostId = $state('');
	let sessionSearch = $state('');
	let paceInput = $state('2:00');
	let fileName = $state('');

	const SEARCHABLE_MIN = 8;
	const comparableDetail = $derived({
		sport: detail.sport,
		distance: detail.distance,
		time: detail.time,
		workoutType: detail.workoutType
	});
	const comparableCandidates = $derived(
		candidates.filter((c) => areComparable(comparableDetail, c))
	);
	const filteredCandidates = $derived.by(() => {
		const q = sessionSearch.trim().toLowerCase();
		const pool = comparableCandidates;
		if (!q) return pool;
		return pool.filter((c) => {
			if (String(c.id) === ghostId) return true;
			const hay = `${fmtDate(c.date)} ${fmtDistance(c.distance)} ${fmtPace(c.pace)}`.toLowerCase();
			return hay.includes(q);
		});
	});

	let engine = $state<ReplayEngine | null>(null);
	let renderer: ReplayRenderer | null = null;
	let rendererKind = $state<RendererKind>('2d');
	let quality = $state<RenderQuality>('medium');
	let inspectorOpen = $state(false);
	let driftOverlayOn = $state(false);

	// --- Rep comparison ---
	const repSeries = $derived(detectReps(detail) ?? []);
	const hasReps = $derived(repSeries.length >= 2);
	const showHrMetric = $derived(repsHaveHr(repSeries));
	let repMetric = $state<RepMetric>('pace');
	let repHighlight = $state<number | null>(null);

	function toggleRepHighlight(idx: number) {
		repHighlight = repHighlight === idx ? null : idx;
	}
	// Target pace is intentionally preserved across workout navigation —
	// it represents a user's personal goal, not workout-specific state.
	let targetPaceSecs = $state<number | null>(null);
	let showBand = $state(false);
	let targetPaceOpen = $state(false);
	let targetPaceInput = $state('');
	let targetPaceInvalid = $state(false);
	const TARGET_BAND_SECS = 5;
	let loading3d = $state(false);
	let renderer3dOk = $state(false);
	let rendererBackend = $state<Renderer3DBackend | null>(null);
	let activeLoadId = 0;
	// 2D and 3D must NOT share a <canvas>: a canvas is locked to one context type
	// for life, so the 2D renderer's getContext('2d') would make WebGL creation
	// fail. The 2D renderer uses canvas2dEl; the 3D renderer creates its own canvas
	// inside canvas3dHost. activeCanvas toggles which one is visible.
	let canvas2dEl = $state<HTMLCanvasElement>();
	let canvas3dHost = $state<HTMLDivElement>();
	let activeCanvas = $state<RendererKind>('2d');
	let courseWrap = $state<HTMLDivElement>();

	const SPEEDS = [0.5, 1, 2, 4, 8];

	function buildState(f: Frame): RenderState {
		const g = ghostStrokes ? sampleAt(ghostStrokes, f.t) : null;
		ghostFrame = g;
		return {
			frame: f,
			distFrac: total ? f.d / total : 0,
			totalDistance: total,
			sport: detail.sport,
			strokePose: strokePoseAt(strokeTimeline, f.t),
			ghost: g
				? { distFrac: total ? g.d / total : 0, pace: g.pace, spm: g.spm, label: ghostLabel }
				: undefined,
			ghostStrokePose: g && ghostStrokeTimeline ? strokePoseAt(ghostStrokeTimeline, f.t) : undefined
		};
	}

	function safeRender(state: RenderState, p: boolean, theme: 'light' | 'dark' = uiTheme.value) {
		if (!renderer) return;
		try {
			renderer.render(state, p, theme);
			consecutiveRenderErrors = 0;
		} catch (err) {
			consecutiveRenderErrors++;
			const msg = err instanceof Error ? err.message : String(err);
			if (rendererKind !== '3d') {
				// 2D renderer: log and skip the frame instead of re-throwing.
				// Re-throwing would prevent the next requestAnimationFrame from
				// being scheduled, permanently killing the animation loop.
				if (import.meta.env.DEV) console.warn('[replay] 2D frame skipped:', err);
				// After 8 consecutive errors, auto-fallback to a known-safe state.
				if (consecutiveRenderErrors >= 8) {
					toast.error(t('replay.view2dError'), {
						description: msg
					});
					consecutiveRenderErrors = 0;
				}
				return;
			}
			// 3D renderer: toast once and fall back to 2D.
			toast.error(t('replay.view3dError'), {
				description: msg
			});
			void setRenderer('2d');
		}
	}

	let consecutiveRenderErrors = 0;

	function renderCurrent() {
		safeRender(buildState(frame), playing, uiTheme.value);
	}

	function courseHeight() {
		const mobile = (courseWrap?.clientWidth ?? 0) < 640;
		if (rendererKind === '3d') {
			return mobile ? (ghostActive ? 390 : 360) : ghostActive ? 450 : 420;
		}
		// The 2D replay is a full venue illustration, not a compressed chart strip.
		// Preserve enough vertical room for a horizon, architecture, course material,
		// athlete HUD and a second comparison lane on every supported viewport.
		return mobile ? (ghostActive ? 320 : 260) : ghostActive ? 350 : 300;
	}

	function resizeCourse() {
		const w = courseWrap?.clientWidth;
		if (w) renderer?.resize(w, courseHeight());
	}

	/**
	 * The visual-QA harness asks for this explicit query-only path to capture
	 * close athlete and skeleton frames in the real application. Normal replay
	 * controls and stored preferences cannot enable either override.
	 */
	function visualQaOptions() {
		if (page.url.searchParams.get('qa') !== 'athlete-visual') return {};
		const camera = page.url.searchParams.get('athleteCamera');
		return {
			qaCamera: camera === 'close' ? 'athlete-close' : 'normal',
			showV4Skeleton: page.url.searchParams.get('athleteSkeleton') === '1'
		} as const;
	}

	async function setRenderer(kind: RendererKind) {
		if (activeLoadId < 0) return;
		if (kind === '3d' && !renderer3dOk) return;
		const canvas2d = canvas2dEl;
		const host3d = canvas3dHost;
		if (!canvas2d || !host3d) return;
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
				renderer = new CourseRenderer(canvas2d);
				rendererBackend = null;
				activeCanvas = '2d';
				if (w) renderer.resize(w, h);
				renderCurrent();
				return;
			}

			loading3d = true;
			rendererBackend = null;
			const temp2d = new CourseRenderer(canvas2d);
			renderer = temp2d;
			activeCanvas = '2d';
			if (w) temp2d.resize(w, h);
			renderCurrent();
			let next3d: Awaited<ReturnType<typeof createRenderer3D>> | null = null;
			try {
			next3d = await createRenderer3D(host3d, quality, detail.sport, {}, visualQaOptions());
			} finally {
				if (myLoadId === activeLoadId) loading3d = false;
			}
			if (myLoadId !== activeLoadId) {
				next3d?.renderer.destroy();
				if (renderer === temp2d) temp2d.destroy();
				return;
			}
			temp2d.destroy();
			renderer = next3d.renderer;
			rendererBackend = next3d.backend;
			if (next3d.quality !== quality) {
				quality = next3d.quality;
				saveQualityPref(quality);
			}
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
			renderer = new CourseRenderer(canvas2d);
			rendererBackend = null;
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
			driftOverlayOn = false;
			repHighlight = null;
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

	/** Restore a target-pace ghost from a locally-created replay link. */
	function armPaceGhostFromParams(paceRaw: string, name: string | undefined) {
		const secs = parsePaceInput(paceRaw);
		if (secs == null || total <= 0) return false;
		const paceLabel = `${fmtPaceBare(secs)}/500m`;
		compareMode = 'pace';
		paceInput = fmtPaceBare(secs);
		setGhost(constantPaceGhost(secs, total), name || paceLabel, {
			kind: 'pace',
			paceLabel,
			hasStrokeData: false
		});
		return true;
	}

	function armGhostFromUrl() {
		const gp = page.url.searchParams.get('ghostPace');
		const name = page.url.searchParams.get('ghostName')?.trim();
		if (gp) armPaceGhostFromParams(gp, name);
	}

	onMount(() => {
		renderer3dOk = webglSupported();
		quality = loadQualityPref();
		const pref = loadRendererPref();
		if (pref === '3d' && renderer3dOk) {
			void setRenderer('3d');
		} else if (pref === '3d') {
			rendererKind = '2d';
		}
		void renderer3dSupported().then((ok) => {
			renderer3dOk = ok;
			if (pref === '3d' && ok && rendererKind === '2d' && activeLoadId >= 0) {
				void setRenderer('3d');
			} else if (pref === '3d' && !ok) {
				saveRendererPref('2d');
			}
		});

		void armGhostFromUrl();
		const tp = page.url.searchParams.get('targetPace');
		if (tp) {
			const secs = parsePaceInput(tp);
			if (secs != null) {
				targetPaceSecs = secs;
				targetPaceInput = formatPaceInput(secs);
				targetPaceOpen = true;
			}
		}
		const sizeIt = () => {
			resizeCourse();
			renderCurrent();
		};
		const ro = new ResizeObserver(sizeIt);
		if (courseWrap) ro.observe(courseWrap);

		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const inField =
				target?.matches?.('select, input, textarea, button, summary, [role="button"]') ||
				target?.isContentEditable;
			if (inField) return;
			switch (e.key) {
				case ' ':
					e.preventDefault();
					engine?.toggle();
					break;
				case 'ArrowLeft': {
					if (e.altKey || e.metaKey || e.ctrlKey) break;
					e.preventDefault();
					const delta = e.shiftKey ? 30 : 10;
					engine?.seek((engine?.time ?? 0) - delta);
					break;
				}
				case 'ArrowRight': {
					if (e.altKey || e.metaKey || e.ctrlKey) break;
					e.preventDefault();
					const delta = e.shiftKey ? 30 : 10;
					engine?.seek((engine?.time ?? 0) + delta);
					break;
				}
				case '[': {
					e.preventDefault();
					const prevIdx = SPEEDS.indexOf(speed);
					if (prevIdx > 0) setSpeed(SPEEDS[prevIdx - 1]);
					break;
				}
				case ']': {
					e.preventDefault();
					const nextIdx = SPEEDS.indexOf(speed);
					if (nextIdx < SPEEDS.length - 1) setSpeed(SPEEDS[nextIdx + 1]);
					break;
				}
				case 'Home':
				case '0':
					e.preventDefault();
					engine?.seek(0);
					break;
			}
		};
		window.addEventListener('keydown', onKey);

		return () => {
			ro.disconnect();
			window.removeEventListener('keydown', onKey);
			activeLoadId = -1;
			ghostLoadGen = -1;
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
		ghostLoadGen++; // invalidate any in-flight ghost fetch
		loadingGhost = false;
		ghostId = '';
		fileName = '';
		ghostError = '';
		setGhost(null, '', null);
	}

	function setCompareMode(mode: CompareMode) {
		compareMode = mode;
		sessionSearch = '';
		clearGhost();
		if (mode === 'session' && comparableCandidates.length) {
			const pick = pickDefaultGhostCandidate(candidates, {
				id: detail.id,
				distance: detail.distance,
				sport: detail.sport,
				time: detail.time,
				workoutType: detail.workoutType
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
		const gen = ++ghostLoadGen;
		try {
			const res = await fetch(`/api/workouts/${id}`);
			if (gen !== ghostLoadGen) return;
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = (await res.json()) as WorkoutDetail;
			if (gen !== ghostLoadGen) return;
			setGhost(d.strokes, t('replay.ghostYour', { date: fmtDate(d.date) }), {
				kind: 'session',
				date: d.date,
				distance: d.distance,
				hasStrokeData: d.hasStrokeData
			});
			toast.success(t('replay.racingSession', { date: fmtDate(d.date) }), {
				description: `${fmtDistance(d.distance)} · ${fmtPace(d.pace)}`
			});
		} catch (err) {
			if (gen !== ghostLoadGen) return;
			ghostId = '';
			toast.error(t('replay.loadSessionFailed'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		} finally {
			if (gen === ghostLoadGen) loadingGhost = false;
		}
	}

	async function selectGhost(e: Event) {
		await loadSessionGhost((e.target as HTMLSelectElement).value);
	}

	function applyTargetPaceInput() {
		const trimmed = targetPaceInput.trim();
		if (!trimmed) {
			targetPaceSecs = null;
			targetPaceInvalid = false;
			return;
		}
		const secs = parsePaceInput(trimmed);
		if (secs == null) {
			targetPaceInvalid = true;
			targetPaceSecs = null;
			return;
		}
		targetPaceInvalid = false;
		targetPaceSecs = secs;
	}

	function clearTargetPace() {
		targetPaceSecs = null;
		targetPaceInput = '';
		showBand = false;
		targetPaceOpen = false;
		targetPaceInvalid = false;
	}

	function applyPace() {
		const secs = parsePaceInput(paceInput);
		if (secs == null) {
			ghostError = t('replay.paceError');
			return;
		}
		ghostError = '';
		const paceLabel = `${fmtPaceBare(secs)}/500m`;
		setGhost(constantPaceGhost(secs, total), paceLabel, {
			kind: 'pace',
			paceLabel,
			hasStrokeData: false
		});
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
			setGhost(strokes, name, { kind: 'file', name, hasStrokeData: false });
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
	const gapMeters = $derived(ghostFrame ? raceGapMetres(frame.d, ghostFrame.d) : 0);
	const gapSeconds = $derived(ghostFrame ? raceGapSeconds(gapMeters, frame.pace) : 0);

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
			m = String(Math.abs(Math.round(total - ghostDistAtPlayerFinish(ghostStrokes, playerTime))));
		} else {
			m = String(Math.abs(Math.round(total - playerDistAtGhostFinish(strokes, ghostTime))));
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
	// Bolt: Consolidate parallel mapping over strokes into a single pass loop
	const chartData = $derived.by(() => {
		const n = strokes.length;
		const t = new Float64Array(n);
		const pace = new Float64Array(n);
		const spm = new Float64Array(n);
		const watts = new Float64Array(n);
		const hr = Array.from<number | null>({ length: n });
		for (let i = 0; i < n; i++) {
			const s = strokes[i];
			t[i] = s.t;
			pace[i] = s.pace;
			spm[i] = s.spm;
			watts[i] = s.watts;
			hr[i] = s.hr ?? null;
		}
		return { t, pace, spm, watts, hr };
	});
	const xs = $derived(chartData.t);
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

	const drift = $derived(efficiencyDrift(strokes));
	const driftReady = $derived(drift.series.length >= 5);

	const dpsAligned = $derived.by(() => {
		if (!driftOverlayOn || !driftReady) return null;
		const aligned: (number | null)[] = [];
		let driftIdx = 0;
		const series = drift.series;
		for (let i = 0; i < xs.length; i++) {
			const t = xs[i];
			if (driftIdx < series.length && series[driftIdx]!.t === t) {
				aligned.push(series[driftIdx]!.dps);
				driftIdx++;
			} else {
				aligned.push(null);
			}
		}
		return aligned;
	});

	const paceSeries = $derived(chartData.pace);
	const paceData = $derived.by((): uPlot.AlignedData => {
		const rows: (Float64Array | (number | null)[])[] = [xs, paceSeries];
		if (dpsAligned) rows.push(dpsAligned);
		if (targetPaceSecs != null && xs.length > 0 && !targetPaceInvalid) {
			const t = targetPaceSecs;
			const line = Array(xs.length).fill(t);
			if (showBand) {
				rows.push(
					Array(xs.length).fill(t - TARGET_BAND_SECS),
					Array(xs.length).fill(t + TARGET_BAND_SECS)
				);
			}
			rows.push(line);
		}
		return rows as unknown as uPlot.AlignedData;
	});
	const rateData = $derived<uPlot.AlignedData>([xs, chartData.spm]);
	const powerData = $derived<uPlot.AlignedData>([xs, chartData.watts]);
	const hrData = $derived<uPlot.AlignedData>([xs, chartData.hr]);

	const paceOpts = $derived.by(() => {
		const paceFmt = (v: number) => fmtPace(v).replace('/500m', '');
		const paceColor = chart.role.pace;
		const driftOn = driftOverlayOn && !!dpsAligned;
		const dataSeriesCount = driftOn ? 2 : 1;

		const targetSeries: SeriesConfig[] = [];
		if (targetPaceSecs != null && xs.length > 0 && !targetPaceInvalid) {
			if (showBand) {
				const bandLowIdx = dataSeriesCount + 1;
				targetSeries.push(
					{ label: 'target-band', role: 'pace', width: 0, points: false },
					{
						label: 'target-band',
						role: 'pace',
						width: 0,
						points: false,
						fillTo: bandLowIdx,
						fill: 0.12
					}
				);
			}
			targetSeries.push({
				label: 'target',
				role: 'pace',
				width: 1.5,
				dash: [6, 4],
				points: false
			});
		}

		const targetLabelHook = (u: uPlot) => {
			if (targetPaceSecs == null) return;
			const y = u.valToPos(targetPaceSecs, 'y', true);
			if (!isFinite(y)) return;
			const ctx = u.ctx;
			ctx.save();
			ctx.font = '11px var(--font-mono, ui-monospace, monospace)';
			ctx.fillStyle = paceColor;
			ctx.textAlign = 'right';
			ctx.textBaseline = 'middle';
			ctx.fillText(`${fmtPaceBare(targetPaceSecs)}/500m`, u.bbox.left + u.bbox.width - 4, y);
			ctx.restore();
		};

		const drawHooks: Array<(u: uPlot) => void> = [];
		if (targetPaceSecs != null && !targetPaceInvalid) drawHooks.push(targetLabelHook);

		if (!driftOn) {
			return baseOptions({
				theme: chart,
				xFmt: (v) => fmtTime(v),
				yAxes: [{ size: 52, fmt: paceFmt, invert: true }],
				series: [{ label: 'pace', role: 'pace', width: 1.5, fill: true }, ...targetSeries],
				cursor: { x: true, y: false },
				hooks: drawHooks.length ? { draw: drawHooks } : undefined
			});
		}

		const baseline = drift.baseline;
		drawHooks.push((u: uPlot) => {
			if (baseline <= 0) return;
			const y = u.valToPos(baseline, 'y2', true);
			if (!isFinite(y)) return;
			const ctx = u.ctx;
			ctx.save();
			ctx.strokeStyle = chart.cursor;
			ctx.setLineDash([4, 4]);
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(u.bbox.left, y);
			ctx.lineTo(u.bbox.left + u.bbox.width, y);
			ctx.stroke();
			ctx.restore();
		});

		return baseOptions({
			theme: chart,
			xFmt: (v) => fmtTime(v),
			yAxes: [
				{ size: 52, fmt: paceFmt, invert: true },
				{
					scale: 'y2',
					side: 1,
					size: 48,
					grid: false,
					fmt: (v) => `${v.toFixed(1)}`
				}
			],
			series: [
				{ label: 'pace', role: 'pace', width: 1.5, fill: true },
				{
					label: t('drift.axisLabel'),
					role: 'dps',
					scale: 'y2',
					width: 1.5,
					spanGaps: false
				},
				...targetSeries
			],
			cursor: { x: true, y: false },
			hooks: { draw: drawHooks }
		});
	});
	const rateOpts = $derived(metricOpts('rate', 'rate', false, (v) => `${Math.round(v)}`));
	const powerOpts = $derived(metricOpts('power', 'power', false, (v) => `${Math.round(v)}w`));
	const hrOpts = $derived(metricOpts('hr', 'hr', false, (v) => `${Math.round(v)}`));

	// ---- Analysis ----
	const zones = $derived(hasHr ? hrZones(strokes) : []);
	const pc = $derived(powerCurve(strokes));
	// Bolt: Single-pass loop pre-allocating arrays instead of parallel map() calls
	const pcData = $derived.by((): uPlot.AlignedData => {
		const n = pc.length;
		const duration = new Float64Array(n);
		const watts = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			duration[i] = pc[i].duration;
			watts[i] = pc[i].watts;
		}
		return [duration, watts];
	});
	const pcOpts = $derived(metricOpts('best avg power', 'power', false, (v) => `${Math.round(v)}w`));

	// ---- Technique (stroke quality from logged pace/rate) ----
	const tech = $derived(techniqueSummary(strokes));
	// Bolt: Single-pass loop pre-allocating arrays instead of parallel map() calls
	const dpsData = $derived.by((): uPlot.AlignedData => {
		const dps = tech.dps;
		const n = dps.length;
		const t = new Float64Array(n);
		const v = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			t[i] = dps[i].t;
			v[i] = dps[i].v;
		}
		return [t, v];
	});
	const dpsOpts = $derived(metricOpts('dist/stroke', 'dps', false, (v) => `${v.toFixed(1)}m`));

	const eff = $derived(efficiencyByRate(strokes));
	// Scatter: pace (y, inverted) vs rate (x); a uPlot line over rate-sorted medians.
	// Bolt: Single-pass loop pre-allocating arrays instead of parallel map() calls
	const effData = $derived.by((): uPlot.AlignedData => {
		const n = eff.length;
		const spm = new Float64Array(n);
		const pace = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			spm[i] = eff[i].spm;
			pace[i] = eff[i].pace;
		}
		return [spm, pace];
	});
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
		// Bolt: Calculate minPace and maxPace with a single-pass loop avoiding map/filter intermediate arrays and Max Call Stack risk on large datasets
		let minPace = Infinity;
		let maxPace = -Infinity;
		let hasPace = false;
		for (let i = 0; i < strokes.length; i++) {
			const p = strokes[i].pace;
			if (p > 0) {
				hasPace = true;
				if (p < minPace) minPace = p;
				if (p > maxPace) maxPace = p;
			}
		}
		if (!hasPace) return { min: 60, max: 180 };
		return { min: minPace - 5, max: maxPace + 5 };
	});
	const wattRange = $derived.by(() => {
		// Bolt: Calculate maxWatt using single-pass loop avoiding map allocations and Max Call Stack risk on large datasets
		let maxWatt = 0;
		for (let i = 0; i < strokes.length; i++) {
			const w = strokes[i].watts;
			if (w > maxWatt) maxWatt = w;
		}
		return { min: 0, max: Math.max(100, maxWatt * 1.1) };
	});

	// ---- Interval / rep breakdown (null for single-segment pieces) ----
	const momentReport = $derived(analyzeWorkoutMoments(detail));
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
	const workRest = $derived(workRestEfficiency(detail));
	const targetRows = $derived(targetVsActual(detail));
	const hrDrop = $derived(
		detail.heartRate?.ending != null && detail.heartRate?.recovery != null
			? detail.heartRate.ending - detail.heartRate.recovery
			: undefined
	);
	const splitsHaveDetail = $derived(
		detail.splits.some(
			(s) =>
				s.caloriesTotal != null ||
				s.wattMinutes != null ||
				s.heartRate != null ||
				s.type != null ||
				s.isRest
		)
	);

	function targetMetricLabel(row: TargetVsActualRow): string {
		switch (row.metric) {
			case 'pace':
				return t('replay.mTargetPace');
			case 'watts':
				return t('replay.mTargetWatts');
			case 'strokeRate':
				return t('replay.mTargetRate');
			case 'heartRateZone':
				return t('replay.mTargetHrZone');
			case 'calories':
				return t('replay.mTargetCalories');
		}
	}

	function formatTargetDelta(row: TargetVsActualRow): string {
		const delta = Math.abs(row.delta);
		if (row.delta === 0) return '0';
		if (row.metric === 'pace') {
			const sign = row.delta < 0 ? '−' : '+';
			return `${sign}${fmtPaceBare(delta, true)}`;
		}
		if (row.metric === 'watts' || row.metric === 'calories' || row.metric === 'strokeRate') {
			const sign = row.delta > 0 ? '+' : '−';
			return `${sign}${Math.round(delta)}`;
		}
		const n = Math.round(delta);
		return row.delta > 0 ? `+${n}` : `−${n}`;
	}

	function splitTypeLabel(type: string | undefined): string {
		switch (type) {
			case 'time':
				return t('replay.intervalTypeTime');
			case 'distance':
				return t('replay.intervalTypeDistance');
			case 'calorie':
				return t('replay.intervalTypeCalorie');
			case 'wattminute':
				return t('replay.intervalTypeWattminute');
			default:
				return '—';
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
</script>

<svelte:head><title>{t('common.replay')} · {detail.workoutType || SPORT_LABEL[detail.sport]} · rowplay</title></svelte:head>

<div class="container">
	<a href={resolve('/dashboard')} class="back muted"><ArrowLeft size={14} /> {t('replay.back')}</a>
	<div class="head">
		<h1
			><span class="h1icon" style:color={MACHINE_COLOR[detail.sport]}
				><SportIcon sport={detail.sport} size={22} /></span
			>
			{detail.workoutType || SPORT_LABEL[detail.sport]}</h1
		>
		<div class="summary mono muted">
			{fmtDistance(detail.distance)} · {fmtTime(detail.time, true)} · {fmtPace(detail.pace)}
			{#if !detail.hasStrokeData}<span class="badge badge-soft badge-warning">{t('replay.lowRes')}</span>{/if}
			{#if exrFlagged}
				<span class="badge badge-soft badge-info" title={t('replay.exrBadgeTitle')}>{t('replay.exrBadge')}</span>
			{/if}
		</div>
		<div class="sharebar">
			<button class="btn btn-ghost btn-sm" type="button" onclick={downloadRaceCard}>
				<ImageDown size={14} />
				{t('share.downloadImage')}
			</button>
		</div>
	</div>

	<WorkoutMomentCards report={momentReport} sport={detail.sport} onseek={(seconds) => engine?.seek(seconds)} />

	{#if !logbookHasHr && isDemo}
		<div class="card card-border bg-base-100 shadow-md p-5 hrimport">
			<div class="hrimport-head">
				<Heart size={15} />
				<strong>{t('replay.hrImportTitle')}</strong>
			</div>
			<p class="muted small hrimport-hint">{t('replay.hrImportHint')}</p>
			<div class="hrimport-row">
				<input
					class="file-input file-input-sm"
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
						class="offset-input range range-primary range-xs"
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
						class="btn btn-ghost btn-sm"
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
					class="btn btn-ghost btn-sm"
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
	<div class="card card-border bg-base-100 shadow-md p-5 ghostbar">
		<label><Ghost size={15} /> {t('replay.compareAgainst')}</label>
		<div class="join" role="group" aria-label={t('replay.compareAgainst')}>
			<button
				type="button"
				class="btn btn-sm join-item"
				class:btn-active={compareMode === 'none'}
				class:btn-neutral={compareMode === 'none'}
				aria-pressed={compareMode === 'none'}
				onclick={() => setCompareMode('none')}
			>{t('replay.none')}</button>
			{#if candidates.length}
				<button
					type="button"
					class="btn btn-sm join-item"
					class:btn-active={compareMode === 'session'}
					class:btn-neutral={compareMode === 'session'}
					aria-pressed={compareMode === 'session'}
					onclick={() => setCompareMode('session')}
				>{t('replay.pastSession')}</button>
			{/if}
		</div>
		<details class="ghost-more" open={compareMode === 'pace' || compareMode === 'file'}>
			<summary class="muted small">{t('replay.moreOptions')}</summary>
			<div class="join ghost-more-join" role="group" aria-label={t('replay.moreCompareOptions')}>
				<button
					type="button"
					class="btn btn-sm join-item"
					class:btn-active={compareMode === 'pace'}
					class:btn-neutral={compareMode === 'pace'}
					aria-pressed={compareMode === 'pace'}
					onclick={() => setCompareMode('pace')}
				>{t('replay.constantPace')}</button>
				<button
					type="button"
					class="btn btn-sm join-item"
					class:btn-active={compareMode === 'file'}
					class:btn-neutral={compareMode === 'file'}
					aria-pressed={compareMode === 'file'}
					onclick={() => setCompareMode('file')}
				>{t('replay.uploadedFile')}</button>
			</div>
		</details>

		{#if compareMode === 'session' && comparableCandidates.length}
			{#if comparableCandidates.length >= SEARCHABLE_MIN}
				<search>
				<input
					class="input input-bordered input-sm session-search"
					type="search"
					inputmode="search"
					enterkeyhint="search"
					bind:value={sessionSearch}
					placeholder={t('replay.searchSessions')}
					aria-label={t('replay.searchSessions')}
				/>
				</search>
			{/if}
			<select id="ghost" class="select select-bordered select-sm" value={ghostId} onchange={selectGhost}>
				<option value="">{t('replay.chooseSession', { sport: SPORT_LABEL[detail.sport] })}</option>
				{#each filteredCandidates as c (c.id)}
					<option value={c.id}>
						{fmtDate(c.date)} · {fmtDistance(c.distance)} · {fmtPace(c.pace)}
					</option>
				{/each}
			</select>
		{:else if compareMode === 'session' && !comparableCandidates.length}
			<p class="muted small">{t('comparability.noComparableCandidates')}</p>
		{:else if compareMode === 'pace'}
			<input
				class="input input-bordered input-sm paceinput mono"
				type="text"
				bind:value={paceInput}
				placeholder="1:52"
				aria-label={t('replay.pacePer500m')}
				onkeydown={(e) => e.key === 'Enter' && applyPace()}
			/>
			<span class="muted small">/500m</span>
			<button class="btn btn-ghost btn-sm" onclick={applyPace}>{t('replay.setPace')}</button>
		{:else if compareMode === 'file'}
			<input
				class="file-input file-input-sm"
				type="file"
				accept=".csv,.tcx,.fit"
				onchange={onFile}
				aria-label={t('replay.uploadCsvHint')}
			/>
			<span class="muted small">{t('replay.fileFormats')}</span>
			{#if fileName}<span class="muted small">· {fileName}</span>{/if}
		{/if}

		{#if loadingGhost}<span class="muted small">{t('common.loading')}</span>{/if}
		{#if ghostError}<span class="err small">{ghostError}</span>{/if}

		{#if ghostActive}
			<div class="ghost-status">
				<span class="ghost-status-name muted small">
					<Ghost size={13} aria-hidden="true" />
					{t('replay.racingAgainst', { name: ghostLabel })}
				</span>
				<button
					type="button"
					class="btn btn-ghost btn-xs"
					onclick={clearGhost}
				>
					<X size={12} aria-hidden="true" />
					{t('replay.removeGhost')}
				</button>
			</div>
			{#if ghostFrame && !raceFinished}
				<div class="gap mono" class:ahead={gapMeters >= 0} class:behind={gapMeters < 0} role="status" aria-live="polite">
					<span class="gap-main">
						{gapMeters >= 0
							? t('replay.ahead', { m: Math.abs(Math.round(gapMeters)) })
							: t('replay.behind', { m: Math.abs(Math.round(gapMeters)) })}
					</span>
					<span class="gap-secs">({Math.abs(gapSeconds).toFixed(1)}s)</span>
				</div>
			{/if}
		{/if}
	</div>

	{#if raceFinished && verdictText}
		<div
			class="card card-border bg-base-100 shadow-md p-5 verdict"
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
		<div class="course-tools">
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
				disabled={!renderer3dOk || loading3d}
				title={!renderer3dOk ? t('replay.view3dUnsupported') : undefined}
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
		<button
			type="button"
			class="vbtn inspector-btn"
			class:on={inspectorOpen}
			aria-pressed={inspectorOpen}
			aria-label={inspectorOpen ? t('inspector.toggleOn') : t('inspector.toggle')}
			data-testid="inspector-toggle"
			onclick={() => (inspectorOpen = !inspectorOpen)}
		>
			<Binary size={14} aria-hidden="true" />
			{t('inspector.toggle')}
		</button>
		</div>
		{#if rendererKind === '3d'}
			<label class="quality-select">
				<span class="quality-label">{t('replay.quality')}</span>
				<select
					class="select select-bordered select-sm"
					value={quality}
					disabled={loading3d}
					onchange={(e) => onQualityChange(e.currentTarget.value as RenderQuality)}
				>
					<option value="low">{t('replay.qualityLow')}</option>
					<option value="medium">{t('replay.qualityMedium')}</option>
					<option value="high">{t('replay.qualityHigh')}</option>
					<option value="ultra">{t('replay.qualityUltra')}</option>
				</select>
				{#if rendererBackend}
					<span class="backend-label">
						{rendererBackend === 'webgpu' ? t('replay.backendWebgpu') : t('replay.backendWebgl')}
					</span>
				{/if}
			</label>
		{/if}
		<canvas bind:this={canvas2dEl} class:hidden={activeCanvas !== '2d'}></canvas>
		<div class="canvas3d-host" bind:this={canvas3dHost} class:hidden={activeCanvas !== '3d'}></div>
	</div>

	{#if inspectorOpen}
		<div class="card inspector-card">
			<InspectorPanel
				{detail}
				{rawStroke}
				progress={frame.progress}
				splitIndex={inspectorSplitIdx}
				isPublic={false}
			/>
		</div>
	{/if}

	<!-- Transport controls -->
	<div class="card card-border bg-base-100 shadow-md p-5 controls">
		<button class="btn btn-lg btn-primary play" onclick={() => engine?.toggle()} aria-label={playing ? t('replay.pause') : t('replay.play')}>
			{#if playing}<Pause size={16} /> {t('replay.pause')}{:else}<Play size={16} /> {t('replay.play')}{/if}
		</button>
		<div class="clock mono">
			{fmtTime(frame.t, true)} <span class="muted">/ {fmtTime(detail.time)}</span>
		</div>
		<input
			class="scrub range range-primary range-xs"
			type="range"
			min="0"
			max={engine?.duration ?? detail.time}
			step="0.1"
			value={frame.t}
			oninput={onScrub}
			aria-label={t('replay.seekSlider')}
		/>
		<div class="dist mono">{fmtDistance(frame.d)}</div>
		<p class="kb-inline muted small"><kbd>Space</kbd> {t('replay.kbSpaceHint')} · <kbd>←</kbd><kbd>→</kbd> {t('replay.kbArrowHint')}</p>
		<div
			class="join speeds"
			role="radiogroup"
			aria-label={t('replay.playbackSpeed')}
			tabindex="-1"
			onkeydown={(e) => {
				const btns = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')];
				const idx = btns.indexOf(e.target as HTMLButtonElement);
				if (idx < 0) return;
				let next = -1;
				if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % btns.length;
				else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + btns.length) % btns.length;
				if (next >= 0) { e.preventDefault(); setSpeed(SPEEDS[next]); btns[next].focus(); }
			}}
		>
			{#each SPEEDS as s (s)}
				<button
					class="btn btn-xs join-item"
					class:btn-active={speed === s}
					class:btn-neutral={speed === s}
					role="radio"
					aria-checked={speed === s}
					tabindex={speed === s ? 0 : -1}
					onclick={() => setSpeed(s)}
				>{s}×</button>
			{/each}
		</div>
		<details class="kb-hints">
			<summary class="muted small">{t('replay.kbTitle')}</summary>
			<dl class="kb-list">
				<div><dt><kbd>Space</kbd></dt><dd>{t('replay.kbSpaceHint')}</dd></div>
				<div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>{t('replay.kbArrowHint')}</dd></div>
				<div><dt><kbd>Shift</kbd>+<kbd>←</kbd> <kbd>→</kbd></dt><dd>{t('replay.kbArrowShiftHint')}</dd></div>
				<div><dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>{t('replay.kbBracketHint')}</dd></div>
				<div><dt><kbd>0</kbd> / <kbd>Home</kbd></dt><dd>{t('replay.kbHomeHint')}</dd></div>
			</dl>
		</details>
	</div>

	<!-- Live gauges -->
	<div class="gauges card card-border bg-base-100 shadow-md p-5">
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
		<div class="gauge-legend" role="group" aria-label={t('replay.legendTitle')}>
			<span class="legend-item"><span class="ldot" style:background="var(--pace)"></span>{t('replay.gPace')}</span>
			<span class="legend-item"><span class="ldot" style:background="var(--rate)"></span>{t('replay.gRate')}</span>
			<span class="legend-item"><span class="ldot" style:background="var(--power)"></span>{t('replay.gPower')}</span>
			{#if hasHr}<span class="legend-item"><span class="ldot" style:background="var(--hr)"></span>{t('replay.gHeart')}</span>{/if}
			{#if ghostActive}<span class="legend-item"><Ghost size={11} aria-hidden="true" />{t('replay.legendGhost')}</span>{/if}
		</div>
	</div>

	<!-- Telemetry traces -->
	<div class="charts">
		<div class="card card-border bg-base-100 shadow-md p-5">
			<div class="pace-card-head">
				<div class="ctitle muted">{t('replay.cPace')}</div>
				{#if driftReady}
					<button
						type="button"
						class="vbtn drift-toggle"
						data-testid="drift-toggle"
						aria-pressed={driftOverlayOn}
						onclick={() => (driftOverlayOn = !driftOverlayOn)}
					>
						{driftOverlayOn ? t('drift.toggleOn') : t('drift.toggle')}
					</button>
				{/if}
			</div>
			{#if driftOverlayOn && driftReady}
				<div class="drift-summary" data-testid="drift-summary">
					<span class="muted small">{t('drift.baseline')}</span>
					<span class="mono">{drift.baseline.toFixed(1)}{t('drift.unit')}</span>
					<span class="muted small">{t('drift.fade')}</span>
					<span
						class="mono"
						class:good={drift.fadeDelta >= 0}
						class:warn={drift.fadePercent < 0 && drift.fadePercent >= -5}
						class:bad={drift.fadePercent < -5}
					>
						{drift.fadeDelta >= 0 ? '+' : ''}{drift.fadeDelta.toFixed(1)}{t('drift.unit')}
						({drift.fadePercent >= 0 ? '+' : ''}{drift.fadePercent.toFixed(1)}%)
					</span>
				</div>
			{/if}
			<UPlotChart data={paceData} options={paceOpts} height={150} marker={frame.t} caption={t('replay.cPace')} />
			<div class="target-pace">
				{#if targetPaceOpen}
					<div class="target-pace-row">
						<label class="target-pace-label muted small" for="target-pace-input"
							>{t('replay.targetPace')}</label
						>
						<input
							id="target-pace-input"
							class="input input-bordered input-sm mono target-pace-input"
							class:input-error={targetPaceInvalid}
							type="text"
							bind:value={targetPaceInput}
							placeholder={t('replay.targetPacePlaceholder')}
							onchange={applyTargetPaceInput}
							onblur={applyTargetPaceInput}
							onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
						/>
						<label class="target-pace-band">
							<input type="checkbox" class="toggle toggle-sm" bind:checked={showBand} />
							<span class="muted small">{t('replay.targetPaceBand')}</span>
						</label>
						<button type="button" class="btn btn-ghost btn-xs" onclick={clearTargetPace}
							>{t('replay.targetPaceClear')}</button
						>
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							onclick={() => (targetPaceOpen = false)}
							aria-label={t('replay.closePanel')}
						>✕</button>
					</div>
				{:else}
					<button
						type="button"
						class="btn btn-ghost btn-xs target-pace-open"
						onclick={() => (targetPaceOpen = true)}
					>
						{t('replay.targetPaceSet')}
					</button>
				{/if}
			</div>
		</div>
		<div class="card card-border bg-base-100 shadow-md p-5">
			<div class="ctitle muted">{t('replay.cRate')}</div>
			<UPlotChart data={rateData} options={rateOpts} height={150} marker={frame.t} caption={t('replay.cRate')} />
		</div>
		<div class="card card-border bg-base-100 shadow-md p-5">
			<div class="ctitle muted">{t('replay.cPower')}</div>
			<UPlotChart data={powerData} options={powerOpts} height={150} marker={frame.t} caption={t('replay.cPower')} />
		</div>
		{#if hasHr}
			<div class="card card-border bg-base-100 shadow-md p-5">
				<div class="ctitle muted">{t('replay.cHeart')}</div>
				<UPlotChart data={hrData} options={hrOpts} height={150} marker={frame.t} caption={t('replay.cHeart')} />
			</div>
		{/if}
	</div>
	<p class="muted charts-help">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href="{base}/docs/pace-splits-watts">{t('docs.contextual.metrics')}</a>
	</p>

	<!-- Rep comparison -->
	{#if hasReps}
		<details class="card card-border bg-base-100 shadow-md p-5 rep-comparison" open>
			<summary class="ctitle muted cursor-pointer select-none">
				{t('replay.repComparison')}
			</summary>
			<div class="rep-metric-tabs" role="group" aria-label={t('replay.repMetricTabs')}>
				<button
					type="button"
					class="btn btn-xs"
					class:btn-primary={repMetric === 'pace'}
					onclick={() => (repMetric = 'pace')}
				>
					{t('replay.repComparisonMetricPace')}
				</button>
				<button
					type="button"
					class="btn btn-xs"
					class:btn-primary={repMetric === 'rate'}
					onclick={() => (repMetric = 'rate')}
				>
					{t('replay.repComparisonMetricRate')}
				</button>
				<button
					type="button"
					class="btn btn-xs"
					class:btn-primary={repMetric === 'power'}
					onclick={() => (repMetric = 'power')}
				>
					{t('replay.repComparisonMetricPower')}
				</button>
				{#if showHrMetric}
					<button
						type="button"
						class="btn btn-xs"
						class:btn-primary={repMetric === 'hr'}
						onclick={() => (repMetric = 'hr')}
					>
						{t('replay.repComparisonMetricHr')}
					</button>
				{/if}
			</div>
			<RepComparisonChart reps={repSeries} metric={repMetric} highlight={repHighlight} />
			<div class="rep-legend">
				{#each repSeries as rep (rep.repIndex)}
					<button
						type="button"
						class="rep-legend-item"
						class:active={repHighlight === rep.repIndex}
						aria-pressed={repHighlight === rep.repIndex}
						onclick={() => toggleRepHighlight(rep.repIndex)}
					>
						<span class="rep-swatch" style:background={repColor(rep.repIndex)}></span>
						<span class="mono">
							{t('replay.repComparisonRep', { n: rep.repIndex + 1 })} — {fmtPaceBare(rep.avgPace)}
						</span>
					</button>
				{/each}
			</div>
		</details>
	{/if}

	<!-- Technique (stroke quality) -->
	<div class="card card-border bg-base-100 shadow-md p-5 technique">
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
		<div class="card card-border bg-base-100 shadow-md p-5">
			<div class="ctitle muted">{t('replay.distPerStroke')} <span class="hint">{t('replay.distPerStrokeHint')}</span></div>
			<UPlotChart data={dpsData} options={dpsOpts} height={150} marker={frame.t} caption={t('replay.distPerStroke')} />
		</div>
		{#if eff.length > 2}
			<div class="card card-border bg-base-100 shadow-md p-5">
				<div class="ctitle muted">{t('replay.paceVsRate')} <span class="hint">{t('replay.paceVsRateHint')}</span></div>
				<UPlotChart data={effData} options={effOpts} height={150} caption={t('replay.paceVsRate')} />
			</div>
		{/if}
	</div>

	<!-- Analysis -->
	<div class="analysis">
		{#if pc.length}
			<div class="card card-border bg-base-100 shadow-md p-5">
				<div class="ctitle muted">{t('replay.powerCurve')}</div>
				<UPlotChart data={pcData} options={pcOpts} height={170} caption={t('replay.powerCurve')} />
			</div>
		{/if}
		{#if zones.length}
			<div class="card card-border bg-base-100 shadow-md p-5">
				<div class="ctitle muted">{t('replay.hrZones')}</div>
				<div class="zonebar">
					{#each zones as z (z.zone)}
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
					{#each zones as z (z.zone)}
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
		<div class="card card-border bg-base-100 shadow-md p-5 intervals">
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
				{#each intervals.reps as r (r.index)}
					{@const barScale = repBarPct(r.pace) / 100}
					<div class="rep" class:fastest={r.isFastest} class:slowest={r.isSlowest}>
						<div class="repno mono">#{r.index + 1}</div>
						<div class="repbarwrap">
							<div class="repbar-track">
								<div class="repbar-clipper">
									<div class="repbar" style:transform="scaleX({barScale})" style:background={r.isFastest ? 'var(--accent-2)' : r.isSlowest ? 'var(--warn)' : MACHINE_COLOR[detail.sport]}></div>
								</div>
								<span class="repbarlabel mono" style:left="{repBarPct(r.pace)}%">{fmtPace(r.pace).replace('/500m', '')}</span>
							</div>
						</div>
						<div class="repmeta mono muted">
							{fmtDistance(r.distance)} · {fmtTime(r.time, true)} · {r.spm} {sportTheme.cadenceUnit}
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
		<div class="card card-border bg-base-100 shadow-md p-5 splits">
			<h2>{t('replay.splitsTitle')}</h2>
			<table class="mono">
				<thead>
					<tr>
						<th>{t('replay.thNum')}</th>
						<th>{t('replay.thDist')}</th>
						<th>{t('replay.thTime')}</th>
						<th>{t('replay.thPace')}</th>
						<th>{t('replay.thRate')}</th>
						<th>{t('replay.thHr')}</th>
						{#if splitsHaveDetail}
							<th>{t('replay.thCalories')}</th>
							<th>{t('replay.thWattMin')}</th>
							<th>{t('replay.thIntervalType')}</th>
							<th>{t('replay.thRest')}</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each detail.splits as sp (sp.index)}
						<tr class:rest-row={sp.isRest}>
							<td>{sp.index + 1}</td>
							<td>{sp.isRest ? '—' : fmtDistance(sp.distance)}</td>
							<td>{fmtTime(sp.time, true)}</td>
							<td>{sp.pace > 0 ? fmtPace(sp.pace) : '—'}</td>
							<td>{sp.spm != null ? `${sp.spm} ${sportTheme.cadenceUnit}` : '–'}</td>
							<td>
								{sp.heartRate?.ending != null
									? Math.round(sp.heartRate.ending)
									: sp.hr
										? Math.round(sp.hr)
										: '–'}
							</td>
							{#if splitsHaveDetail}
								<td>{sp.caloriesTotal ?? '–'}</td>
								<td>{sp.wattMinutes ?? '–'}</td>
								<td>{splitTypeLabel(sp.type)}</td>
								<td>{sp.isRest ? t('replay.thRestYes') : '—'}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Full workout metadata -->
	<div class="card card-border bg-base-100 shadow-md p-5 meta">
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

	{#if detail.heartRate?.ending != null || detail.heartRate?.recovery != null || detail.restTime != null || detail.targets || detail.metadata || detail.source || detail.verified != null || targetRows.length || workRest}
		<details class="card meta full-metrics">
			<summary class="ctitle muted">{t('replay.fullMetrics')}</summary>
			<dl class="metagrid">
				{#if detail.heartRate?.ending != null}
					<div><dt>{t('replay.mHrEnding')}</dt><dd class="mono">{detail.heartRate.ending} bpm</dd></div>
				{/if}
				{#if detail.heartRate?.recovery != null}
					<div><dt>{t('replay.mHrRecovery')}</dt><dd class="mono">{detail.heartRate.recovery} bpm</dd></div>
				{/if}
				{#if hrDrop != null}
					<div><dt>{t('replay.mHrDrop')}</dt><dd class="mono">{hrDrop} bpm</dd></div>
				{/if}
				{#if detail.restTime != null}
					<div><dt>{t('replay.mRestTime')}</dt><dd class="mono">{fmtTime(detail.restTime, true)}</dd></div>
				{/if}
				{#if detail.restDistance != null}
					<div><dt>{t('replay.mRestDistance')}</dt><dd class="mono">{fmtDistance(detail.restDistance)}</dd></div>
				{/if}
				{#if detail.weightClass}
					<div>
						<dt>{t('replay.mWeightClass')}</dt>
						<dd>{detail.weightClass === 'H' ? t('replay.weightHeavy') : t('replay.weightLight')}</dd>
					</div>
				{/if}
				{#if detail.verified != null}
					<div>
						<dt>{t('replay.mVerified')}</dt>
						<dd>{detail.verified ? t('replay.verifiedYes') : t('replay.verifiedNo')}</dd>
					</div>
				{/if}
				{#if detail.timezone}
					<div><dt>{t('replay.mTimezone')}</dt><dd>{detail.timezone}</dd></div>
				{/if}
				{#if detail.privacy}
					<div><dt>{t('replay.mPrivacy')}</dt><dd>{detail.privacy}</dd></div>
				{/if}
				{#if detail.wattMinutes != null}
					<div><dt>{t('replay.mWattMinutes')}</dt><dd class="mono">{detail.wattMinutes}</dd></div>
				{/if}
				{#if workRest?.timeRatio != null}
					<div>
						<dt>{t('replay.workRestTitle')}</dt>
						<dd class="mono">{workRest.timeRatio.toFixed(2)}× ({t('replay.workRestRatio')})</dd>
					</div>
				{/if}
			</dl>

			{#if detail.targets}
				<h2 class="subhead muted">{t('replay.targetsTitle')}</h2>
				<dl class="metagrid">
					{#if detail.targets.pace != null}
						<div><dt>{t('replay.mTargetPace')}</dt><dd class="mono">{fmtPace(detail.targets.pace)}</dd></div>
					{/if}
					{#if detail.targets.watts != null}
						<div><dt>{t('replay.mTargetWatts')}</dt><dd class="mono">{detail.targets.watts} W</dd></div>
					{/if}
					{#if detail.targets.strokeRate != null}
						<div><dt>{t('replay.mTargetRate')}</dt><dd class="mono">{detail.targets.strokeRate}</dd></div>
					{/if}
					{#if detail.targets.heartRateZone != null}
						<div><dt>{t('replay.mTargetHrZone')}</dt><dd class="mono">{detail.targets.heartRateZone}</dd></div>
					{/if}
					{#if detail.targets.calories != null}
						<div><dt>{t('replay.mTargetCalories')}</dt><dd class="mono">{detail.targets.calories}</dd></div>
					{/if}
				</dl>
			{/if}

			{#if targetRows.length}
				<h2 class="subhead muted">{t('replay.targetVsActualTitle')}</h2>
				<ul class="target-rows">
					{#each targetRows as row (row.metric)}
						<li>
							<span>{targetMetricLabel(row)}</span>
							<span class="mono">{formatTargetDelta(row)}</span>
							<span class="badge badge-soft" class:badge-success={row.hit} class:badge-warning={!row.hit}>
								{row.hit ? t('replay.targetHit') : t('replay.targetMiss')}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if detail.metadata || detail.source}
				<h2 class="subhead muted">{t('replay.provenanceTitle')}</h2>
				<dl class="metagrid">
					{#if detail.source}
						<div>
							<dt>{t('replay.mSource')}</dt>
							<dd>
								{detail.source}
								{#if exrFlagged}<span class="badge badge-soft badge-info" title={t('replay.exrBadgeTitle')}>{t('replay.exrBadge')}</span>{/if}
							</dd>
						</div>
					{/if}
					{#if detail.metadata?.pmVersion != null}
						<div><dt>{t('replay.mPmVersion')}</dt><dd class="mono">{detail.metadata?.pmVersion}</dd></div>
					{/if}
					{#if detail.metadata?.firmwareVersion}
						<div><dt>{t('replay.mFirmware')}</dt><dd>{detail.metadata?.firmwareVersion}</dd></div>
					{/if}
					{#if detail.metadata?.serialNumber}
						<div><dt>{t('replay.mSerial')}</dt><dd>{detail.metadata?.serialNumber}</dd></div>
					{/if}
					{#if detail.metadata?.device}
						<div><dt>{t('replay.mDevice')}</dt><dd>{detail.metadata?.device}</dd></div>
					{/if}
					{#if detail.metadata?.ergModelType != null}
						<div><dt>{t('replay.mErgModel')}</dt><dd class="mono">{detail.metadata?.ergModelType}</dd></div>
					{/if}
					{#if detail.metadata?.hrType}
						<div><dt>{t('replay.mHrSensor')}</dt><dd>{detail.metadata?.hrType}</dd></div>
					{/if}
				</dl>
			{/if}
		</details>
	{/if}
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-family: var(--display);
		font-size: 0.82rem;
		font-weight: var(--fw-bold);
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
		gap: var(--space-sm);
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: var(--bd-heavy);
	}
	.head h1 {
		margin: 0;
		font-size: clamp(1.4rem, 5vw, 1.75rem);
		font-weight: var(--fw-black);
		text-transform: uppercase;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.h1icon {
		display: inline-flex;
	}
	.summary {
		font-size: 0.95rem;
		display: flex;
		gap: var(--space-sm);
		align-items: center;
	}
	.sharebar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-top: 0.75rem;
	}
	.sharebar .btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
	}
	.hrimport {
		margin-bottom: 0.75rem;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
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
		gap: var(--space-md);
		flex-wrap: wrap;
	}
	.hrimport-actions {
		display: flex;
		gap: var(--space-sm);
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
		gap: var(--space-md);
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
		padding: 0.6rem 1rem;
	}
	.ghostbar label {
		font-size: 0.9rem;
		font-weight: var(--fw-semibold);
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
	}
	.ghost-more {
		margin: 0;
	}
	.ghost-more summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		min-height: 2.75rem;
		cursor: pointer;
		list-style: none;
		user-select: none;
	}
	.ghost-more summary::marker,
	.ghost-more summary::-webkit-details-marker {
		display: none;
	}
	.ghost-more summary::before {
		content: '+';
	}
	.ghost-more[open] summary::before {
		content: '−';
	}
	.ghost-more-join {
		margin-top: 0.5rem;
	}
	.ghost-status {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding-top: 0.35rem;
		border-top: var(--bd);
		margin-top: 0.15rem;
	}
	.ghost-status-name {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex: 1;
	}
	.session-search {
		min-width: 10rem;
		max-width: 14rem;
	}
	.paceinput {
		width: 5rem;
		font-family: var(--mono);
		text-align: center;
	}
	.file-input {
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
		font-weight: var(--fw-extrabold);
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
		font-weight: var(--fw-bold);
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
		font-size: var(--text-2xs);
		font-weight: var(--fw-extrabold);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-2);
		margin-bottom: 0.35rem;
	}
	.verdict-body {
		margin: 0;
		font-size: clamp(1rem, 3.2vw, 1.2rem);
		font-weight: var(--fw-bold);
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
	.course-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs);
		margin-bottom: 0.5rem;
	}
	.view-toggle {
		display: flex;
		gap: var(--space-xs);
	}
	.inspector-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.inspector-card {
		margin-bottom: 0.75rem;
	}
	.quality-select {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
		font-size: 0.78rem;
		color: var(--muted-ink, var(--ink));
	}
	.backend-label {
		font-family: var(--display);
		font-size: 0.68rem;
		font-weight: var(--fw-bold);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.65;
	}
	.quality-select select {
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
		font-weight: var(--fw-semibold);
		cursor: pointer;
		font-family: var(--display);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
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
		border-radius: var(--r-round);
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
		gap: var(--space-lg);
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.play {
		min-width: 110px;
	}
	.clock {
		font-size: 1.1rem;
		font-weight: var(--fw-bold);
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
	.kb-hints {
		width: 100%;
	}
	.kb-hints summary {
		cursor: pointer;
		user-select: none;
		font-size: 0.78rem;
		color: var(--ink-2);
		list-style: none;
	}
	.kb-hints summary::marker,
	.kb-hints summary::-webkit-details-marker {
		display: none;
	}
	.kb-inline {
		margin: 0;
		line-height: 1.5;
	}
	.kb-inline kbd {
		margin: 0 0.15rem;
		vertical-align: middle;
	}
	.kb-inline kbd {
		font-size: 0.65rem;
		padding: 0.05rem 0.25rem;
	}
	.kb-hints summary::before {
		content: '▸ ';
	}
	details.kb-hints[open] summary::before {
		content: '▾ ';
	}
	.kb-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs) 1.25rem;
		margin: 0.4rem 0 0;
		padding: 0;
	}
	.kb-list > div {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.kb-list dt {
		display: flex;
		gap: 0.2rem;
	}
	.kb-list dd {
		margin: 0;
		font-size: 0.76rem;
		color: var(--ink-2);
	}
	kbd {
		font-family: var(--mono);
		font-size: var(--text-2xs);
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--ink-2);
		border-bottom-width: 2px;
		border-radius: var(--r-ctrl);
		background: var(--paper-raised);
		color: var(--ink);
	}
	.gauges {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-sm);
		margin-bottom: 0.75rem;
	}
	.gauge-legend {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs) var(--space-lg);
		border-top: var(--bd);
		padding-top: 0.5rem;
		margin-top: 0.15rem;
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.76rem;
		color: var(--ink-2);
	}
	.ldot {
		width: 8px;
		height: 8px;
		border-radius: var(--r-round);
		flex-shrink: 0;
	}
	.charts {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-md);
		margin-bottom: 0.75rem;
	}
	.charts-help {
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
	}
	.analysis {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-md);
		margin-bottom: 0.75rem;
	}
	/* Rep comparison */
	.rep-comparison summary {
		margin-bottom: 0.75rem;
	}

	.rep-metric-tabs {
		display: flex;
		gap: 0.375rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.rep-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-top: 0.75rem;
	}

	.rep-legend-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		border-radius: var(--r-pill);
		border: 1px solid oklch(var(--bc) / 0.2);
		background: transparent;
		cursor: pointer;
		font-size: 0.8rem;
		transition: background 0.15s, border-color 0.15s;
	}

	.rep-legend-item.active,
	.rep-legend-item:hover {
		background: oklch(var(--b2));
		border-color: oklch(var(--bc) / 0.4);
	}

	.rep-swatch {
		width: 10px;
		height: 10px;
		border-radius: var(--r-round);
		flex-shrink: 0;
	}

	.technique {
		margin-bottom: 0.75rem;
	}
	.techstats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-md);
		margin-top: 0.5rem;
	}
	.ts {
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: var(--r-ctrl);
		padding: 0.6rem 0.8rem;
	}
	.tv {
		font-size: 1.5rem;
		font-weight: var(--fw-bold);
	}
	.tv.good {
		color: var(--ahead);
	}
	.tv.bad {
		color: var(--behind);
	}
	.drift-summary .mono.warn {
		color: var(--warn);
	}
	.pace-card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-bottom: 0.35rem;
	}
	.target-pace {
		margin-top: 0.65rem;
	}
	.target-pace-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-sm) var(--space-md);
	}
	.target-pace-input {
		width: 5.5rem;
	}
	.target-pace-band {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		cursor: pointer;
	}
	.target-pace-open {
		padding-inline: 0.25rem;
		min-height: 0;
		height: auto;
		font-size: 0.8rem;
	}
	.drift-toggle {
		font-size: 0.78rem;
	}
	.drift-summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-xs) 0.6rem;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}
	.drift-summary .mono.good {
		color: var(--ahead);
	}
	.drift-summary .mono.bad {
		color: var(--behind);
	}
	.tu {
		font-size: 0.85rem;
		font-weight: var(--fw-medium);
		color: var(--ink-2);
		margin-left: 0.15rem;
	}
	.tl {
		font-size: 0.78rem;
		margin-top: 0.2rem;
	}
	.hint {
		font-weight: var(--fw-regular);
		opacity: 0.7;
		text-transform: none;
		letter-spacing: 0;
	}
	.ctitle {
		font-size: 0.74rem;
		font-weight: var(--fw-bold);
		margin-bottom: 0.4rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-2);
	}
	.zonebar {
		display: flex;
		height: 22px;
		border-radius: var(--r-ctrl);
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
		gap: var(--space-sm);
		font-size: 0.82rem;
	}
	.zli .zname {
		flex: 1;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: var(--r-ctrl);
	}
	.intervals {
		margin-bottom: 0.75rem;
	}
	.setstats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-sm);
		margin: 0.5rem 0 1rem;
	}
	.ss {
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: var(--r-ctrl);
		padding: 0.5rem 0.7rem;
	}
	.ssv {
		font-size: 1.15rem;
		font-weight: var(--fw-bold);
	}
	.ssv.good {
		color: var(--ahead);
	}
	.ssv.bad {
		color: var(--behind);
	}
	.ssl {
		font-size: var(--text-2xs);
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
		gap: var(--space-md);
		padding: 0.4rem 0.5rem;
		border-radius: var(--r-ctrl);
		background: var(--bg-elev-2);
	}
	.rep.fastest {
		box-shadow: inset 0 0 0 1px var(--accent-2);
	}
	.rep.slowest {
		box-shadow: inset 0 0 0 1px var(--warn);
	}
	.repno {
		font-weight: var(--fw-bold);
		color: var(--ink-2);
	}
	.repbarwrap {
		position: relative;
		min-width: 0;
	}
	.repbar-track {
		position: relative;
		width: calc(100% - 5rem);
	}
	.repbar-clipper {
		height: 1.4rem;
		border-radius: var(--r-ctrl);
		overflow: hidden;
	}
	.repbar {
		height: 100%;
		width: 100%;
		min-width: 2px;
		transform-origin: left;
		transition: transform 0.3s ease;
	}
	.repbarlabel {
		position: absolute;
		top: 50%;
		margin-left: var(--space-sm);
		transform: translateY(-50%);
		font-weight: var(--fw-bold);
		font-size: 0.9rem;
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.repbar {
			transition: none;
		}
	}
	.repmeta {
		font-size: 0.78rem;
		grid-column: 2;
	}
	.repdelta {
		font-weight: var(--fw-bold);
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
		font-size: var(--text-2xs);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.metagrid dd {
		margin: 0;
		font-size: 0.9rem;
	}
	.full-metrics {
		margin-top: 0.75rem;
	}
	.full-metrics summary {
		cursor: pointer;
		list-style: none;
	}
	.full-metrics summary::-webkit-details-marker {
		display: none;
	}
	.subhead {
		margin: 1rem 0 0.35rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.target-rows {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.target-rows li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-sm) var(--space-md);
		font-size: 0.88rem;
	}
	.splits {
		/* Up to 10 columns for full-fidelity interval data — scroll on any
		   viewport that can't fit them rather than only the narrowest. */
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}
	.splits tr.rest-row {
		opacity: 0.72;
	}
	.splits table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.splits th {
		text-align: left;
		color: var(--ink-2);
		font-weight: var(--fw-semibold);
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
			font-size: var(--text-2xs);
		}
		/* Tighten card padding on mobile for more content space */
		.controls,
		.ghostbar,
		.course {
			padding: 0.75rem;
		}
		/* Ghostbar stacks vertically earlier (not just at 390px) */
		.ghostbar {
			flex-direction: column;
			align-items: stretch;
			gap: var(--space-sm);
		}
		.ghostbar label {
			width: 100%;
		}
		.ghostbar select,
		.paceinput,
		.file-input {
			width: 100%;
			max-width: none;
		}
		.gap {
			margin-left: 0;
			width: 100%;
			text-align: center;
		}
		/* Compact course tools: stack vertically, reduce spacing */
		.course-tools {
			gap: 0.3rem;
		}
		.quality-select {
			flex: 1;
			min-width: 0;
		}
		/* Transport: play + clock on row 1, scrub full width on row 2,
		   dist + speeds on row 3. */
		.controls {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 0.6rem var(--space-md);
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
		.kb-inline {
			display: none;
		}
		.kb-hints {
			grid-column: 1 / -1;
		}
		.speeds .btn {
			min-height: 2.75rem;
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
		/* Transport: stack vertically for phones.
		   Row 1: play (full-width). Row 2: clock + dist inline.
		   Row 3: scrub (full-width). Row 4: speeds (full-width). */
		.controls {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'play play'
				'clock dist'
				'scrub scrub'
				'speeds speeds'
				'hints hints';
			gap: var(--space-sm);
		}
		.play {
			grid-area: play;
			min-width: 0;
			width: 100%;
			justify-content: center;
		}
		.clock {
			grid-area: clock;
			justify-self: start;
			font-size: 1rem;
		}
		.dist {
			grid-area: dist;
			justify-self: end;
			text-align: right;
		}
		.scrub {
			grid-area: scrub;
		}
		.speeds {
			grid-area: speeds;
			justify-self: stretch;
			width: 100%;
		}
		.speeds .btn {
			flex: 1;
			min-width: 0;
		}
		.kb-hints {
			grid-area: hints;
		}
	}
	@media (max-width: 390px) {
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
	}
</style>
