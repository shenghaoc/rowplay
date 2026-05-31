<script lang="ts">
	import { onMount } from 'svelte';
	import MetricGauge from '$components/MetricGauge.svelte';
	import SportIcon from '$components/SportIcon.svelte';
	import { ReplayEngine, sampleAt, type Frame } from '$lib/replay/engine';
	import { CourseRenderer, type RenderState } from '$lib/replay/renderer';
	import { LIVE_COLOR, MACHINE_COLOR, themeFor } from '$lib/replay/sports';
	import { fmtDistance, fmtPace, fmtTime, paceToWatts, SPORT_LABEL } from '$lib/format';
	import type { WorkoutDetail } from '$lib/types';
	import { Play, Pause } from '@lucide/svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';

	let { data } = $props();
	const t = getI18nContext().t;
	const uiTheme = getThemeContext();
	// svelte-ignore state_referenced_locally
	const detail: WorkoutDetail = data.detail;
	// svelte-ignore state_referenced_locally
	const meta = data.meta;
	const sportTheme = themeFor(detail.sport);
	const total = detail.distance;
	const strokes = detail.strokes;

	let frame = $state<Frame>(sampleAt(strokes, 0));
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
			totalDistance: total
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
		renderer = new CourseRenderer(canvasEl, sportTheme);
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

	const paceRange = (() => {
		const ps = strokes.map((s) => s.pace).filter((p) => p > 0);
		if (ps.length === 0) return { min: 60, max: 180 };
		return { min: Math.min(...ps) - 5, max: Math.max(...ps) + 5 };
	})();
	const wattRange = (() => {
		const watts = strokes.map((s) => s.watts);
		const maxWatt = watts.length > 0 ? Math.max(...watts) : 0;
		return { min: 0, max: Math.max(100, maxWatt * 1.1) };
	})();
	const hasHr = strokes.some((s) => s.hr != null);
</script>

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={meta.url} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
</svelte:head>

<div class="container">
	<div class="banner muted">{t('share.publicBanner')}</div>
	<div class="head">
		<h1>
			<span class="h1icon" style:color={MACHINE_COLOR[detail.sport]}>
				<SportIcon sport={detail.sport} size={22} />
			</span>
			{detail.workoutType || SPORT_LABEL[detail.sport]}
		</h1>
		<div class="summary mono muted">
			{fmtDistance(detail.distance)} · {fmtTime(detail.time, true)} · {fmtPace(detail.pace)}
		</div>
	</div>

	<div class="card course" bind:this={courseWrap}>
		<canvas bind:this={canvasEl}></canvas>
	</div>

	<div class="card controls">
		<button class="btn play" onclick={() => engine?.toggle()} aria-label={playing ? t('replay.pause') : t('replay.play')}>
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

	<div class="gauges card">
		<MetricGauge
			label={t('replay.gPace')}
			unit="/500m"
			display={fmtPace(frame.pace).replace('/500m', '')}
			value={frame.pace}
			min={paceRange.max}
			max={paceRange.min}
			color={LIVE_COLOR}
		/>
		<MetricGauge
			label={t('replay.gRate')}
			unit={sportTheme.cadenceUnit}
			display={`${Math.round(frame.spm)}`}
			value={frame.spm}
			min={0}
			max={60}
			color="#2c6e63"
		/>
		<MetricGauge
			label={t('replay.gPower')}
			unit="watts"
			display={`${Math.round(frame.watts)}`}
			value={frame.watts}
			min={wattRange.min}
			max={wattRange.max}
			color="#9e5b2d"
		/>
		{#if hasHr}
			<MetricGauge
				label={t('replay.gHeart')}
				unit="bpm"
				display={frame.hr != null ? `${Math.round(frame.hr)}` : '--'}
				value={frame.hr ?? 0}
				min={90}
				max={200}
				color="#8e4a6b"
			/>
		{/if}
	</div>

	<p class="cta muted">
		{t('share.ctaBefore')}<a href="/">{t('share.ctaLink')}</a>{t('share.ctaAfter')}
	</p>
</div>

<style>
	.container {
		max-width: 960px;
		margin: 0 auto;
		padding: 1rem 1.25rem 3rem;
	}
	.banner {
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: var(--r-ctrl);
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
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.cta {
		text-align: center;
		font-size: 0.9rem;
	}
	.cta a {
		color: var(--live);
		font-weight: 600;
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
