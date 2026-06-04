<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import MetricGauge from '$components/MetricGauge.svelte';
	import SportIcon from '$components/SportIcon.svelte';
	import { ReplayEngine, sampleAt, sampleIndexAt, type Frame } from '$lib/replay/engine';
	import { splitIndexAt } from '$lib/replay/inspector';
	import { CourseRenderer, type RenderState } from '$lib/replay/renderer';
	import { MACHINE_COLOR, themeFor } from '$lib/replay/sports';
	import { fmtDistance, fmtPace, fmtTime, paceToWatts, SPORT_LABEL } from '$lib/format';
	import type { WorkoutDetail } from '$lib/types';
	import { isExrSource } from '$lib/exrSource';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import AnnotationPanel from '$components/AnnotationPanel.svelte';
	import InspectorPanel from '$components/InspectorPanel.svelte';
	import Binary from '@lucide/svelte/icons/binary';
	import type { Annotation } from '$lib/types';

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const uiTheme = getThemeContext();
	const detail = $derived(data.detail as WorkoutDetail);
	const exrFlagged = $derived(isExrSource(detail));
	const meta = $derived(data.meta);
	const annotations = $derived(data.annotations as Annotation[]);
	const sportTheme = $derived(themeFor(detail.sport));
	const total = $derived(detail.distance);
	const strokes = $derived(detail.strokes);

	let frame = $state<Frame>(untrack(() => sampleAt(strokes, 0)));
	const sampleIdx = $derived(sampleIndexAt(strokes, frame.t));
	const rawStroke = $derived(sampleIdx >= 0 ? strokes[sampleIdx] : null);
	const inspectorSplitIdx = $derived(
		rawStroke && detail.splits.length ? splitIndexAt(detail.splits, rawStroke.d) : null
	);
	let inspectorOpen = $state(false);
	let playing = $state(false);
	let speed = $state(1);
	let engine = $state<ReplayEngine | null>(null);
	let renderer: CourseRenderer | null = null;
	let canvasEl: HTMLCanvasElement;
	let courseWrap: HTMLDivElement;

	const SPEEDS = [0.5, 1, 2, 4, 8];

	function buildState(f: Frame): RenderState {
		return {
			frame: f,
			distFrac: total ? f.d / total : 0,
			totalDistance: total,
			sport: detail.sport
		};
	}

	function renderCurrent() {
		renderer?.render(buildState(frame), playing, uiTheme.value);
	}

	$effect(() => {
		const _theme = uiTheme.value;
		renderCurrent();
	});

	onMount(() => {
		renderer = new CourseRenderer(canvasEl);
		engine = new ReplayEngine(strokes, (f, p) => {
			frame = f;
			playing = p;
			renderer?.render(buildState(f), p, uiTheme.value);
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
	const hasHr = $derived(strokes.some((s) => s.hr != null));
</script>

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={meta.url} />
	<meta property="og:image" content={meta.image} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
	<meta name="twitter:image" content={meta.image} />
</svelte:head>

<div class="container">
	<div class="alert alert-info mb-3 text-sm">
		<span>{t('share.publicBanner')}</span>
	</div>
	<div class="head">
		<h1>
			<span class="h1icon" style:color={MACHINE_COLOR[detail.sport]}>
				<SportIcon sport={detail.sport} size={22} />
			</span>
			{detail.workoutType || SPORT_LABEL[detail.sport]}
		</h1>
		<div class="summary mono muted">
			{fmtDistance(detail.distance)} · {fmtTime(detail.time, true)} · {fmtPace(detail.pace)}
			{#if exrFlagged}
				<span class="badge" title={t('replay.exrBadgeTitle')}>{t('replay.exrBadge')}</span>
			{/if}
		</div>
	</div>

	<div class="card bg-base-100 border border-base-300 shadow-md course" bind:this={courseWrap}>
		<button
			type="button"
			class="btn btn-ghost btn-sm inspector-toggle"
			class:btn-active={inspectorOpen}
			aria-pressed={inspectorOpen}
			aria-label={inspectorOpen ? t('inspector.toggleOn') : t('inspector.toggle')}
			data-testid="inspector-toggle"
			onclick={() => (inspectorOpen = !inspectorOpen)}
		>
			<Binary size={14} aria-hidden="true" />
			{t('inspector.toggle')}
		</button>
		<canvas bind:this={canvasEl}></canvas>
	</div>

	{#if inspectorOpen}
		<div class="card bg-base-100 border border-base-300 shadow-md inspector-card">
			<InspectorPanel
				{detail}
				{rawStroke}
				progress={frame.progress}
				splitIndex={inspectorSplitIdx}
				isPublic={true}
			/>
		</div>
	{/if}

	<div class="card bg-base-100 border border-base-300 shadow-md controls">
		<button class="btn btn-primary play" onclick={() => engine?.toggle()} aria-label={playing ? t('replay.pause') : t('replay.play')}>
			{#if playing}<Pause size={16} /> {t('replay.pause')}{:else}<Play size={16} /> {t('replay.play')}{/if}
		</button>
		<div class="clock mono">
			{fmtTime(frame.t, true)} <span class="muted">/ {fmtTime(detail.time)}</span>
		</div>
		<input
			class="range range-primary range-xs scrub"
			type="range"
			min="0"
			max={engine?.duration ?? detail.time}
			step="0.1"
			value={frame.t}
			oninput={onScrub}
			aria-label="Seek"
		/>
		<div class="dist mono">{fmtDistance(frame.d)}</div>
		<div class="join speeds" role="group" aria-label="Playback speed">
			{#each SPEEDS as s}
				<button
					class="btn btn-xs join-item"
					class:btn-active={speed === s}
					class:btn-neutral={speed === s}
					aria-pressed={speed === s}
					onclick={() => setSpeed(s)}
				>{s}×</button>
			{/each}
		</div>
	</div>

	<div class="gauges card bg-base-100 border border-base-300 shadow-md p-5">
		<MetricGauge
			label={t('replay.gPace')}
			unit="/500m"
			display={fmtPace(frame.pace).replace('/500m', '')}
			value={frame.pace}
			min={paceRange.max}
			max={paceRange.min}
			color="var(--pace)"
		/>
		<MetricGauge
			label={t('replay.gRate')}
			unit={sportTheme.cadenceUnit}
			display={`${Math.round(frame.spm)}`}
			value={frame.spm}
			min={0}
			max={60}
			color="var(--rate)"
		/>
		<MetricGauge
			label={t('replay.gPower')}
			unit="watts"
			display={`${Math.round(frame.watts)}`}
			value={frame.watts}
			min={wattRange.min}
			max={wattRange.max}
			color="var(--power)"
		/>
		{#if hasHr}
			<MetricGauge
				label={t('replay.gHeart')}
				unit="bpm"
				display={frame.hr != null ? `${Math.round(frame.hr)}` : '--'}
				value={frame.hr ?? 0}
				min={90}
				max={200}
				color="var(--hr)"
			/>
		{/if}
	</div>

	<AnnotationPanel {annotations} currentTime={frame.t} readOnly={true} onseek={(ts) => engine?.seek(ts)} />

	<div class="alert mt-4 mb-2">
		<span class="text-sm">
			{t('share.ctaBefore')}<a class="link link-primary font-semibold" href="/">{t('share.ctaLink')}</a>{t('share.ctaAfter')}
		</span>
	</div>
</div>

<style>
	.container {
		max-width: 960px;
		margin: 0 auto;
		padding: 1rem 1.25rem 3rem;
	}
	.head h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.6rem;
		margin: 0 0 0.35rem;
	}
	.h1icon {
		display: inline-flex;
	}
	.summary {
		font-size: 0.95rem;
		margin-bottom: 0.75rem;
	}
	.course {
		padding: 0.75rem;
		margin-bottom: 0.75rem;
		position: relative;
	}
	.inspector-toggle {
		margin-bottom: 0.5rem;
	}
	.inspector-card {
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
		padding: 0.75rem 1rem;
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
	}
	.dist {
		min-width: 90px;
		text-align: right;
		color: var(--ink-2);
	}
	.speeds {
		display: flex;
	}
	.gauges {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	@media (max-width: 760px) {
		.gauges {
			grid-template-columns: repeat(2, 1fr);
		}
		.controls {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 0.6rem 0.75rem;
		}
		.scrub {
			grid-column: 1 / -1;
			width: 100%;
		}
	}
</style>
