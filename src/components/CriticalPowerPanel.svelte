<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import Zap from '@lucide/svelte/icons/zap';
	import {
		estimateCriticalPower,
		powerDurationComparison,
		predictPaceForDuration,
		predictTimeForDistance,
		type CriticalPower
	} from '$lib/analytics';
	import { fmtDistance, fmtPace, fmtPaceBare, fmtTime } from '$lib/format';
	import type { Sport, Workout } from '$lib/types';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import { chartTheme, baseOptions } from '$lib/chartTheme';

	let { workouts }: { workouts: Workout[] } = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const uiTheme = getThemeContext();

	const cp = $derived(estimateCriticalPower(workouts));
	const comparison = $derived(cp ? powerDurationComparison(workouts, cp) : null);

	/** Single-sport history → bike-aware pace inverse; mixed ergs use rower basis. */
	const predictorSport = $derived.by((): Sport | undefined => {
		const sports = new Set(workouts.map((w) => w.sport));
		return sports.size === 1 ? [...sports][0] : undefined;
	});

	type PredictMode = 'duration' | 'distance';
	let predictMode = $state<PredictMode>('duration');
	let durationMin = $state(30);
	let distanceM = $state(2000);

	const durationPresets = [
		{ labelKey: 'dashboard.cpPreset6', min: 6 },
		{ labelKey: 'dashboard.cpPreset20', min: 20 },
		{ labelKey: 'dashboard.cpPreset30', min: 30 },
		{ labelKey: 'dashboard.cpPreset60', min: 60 }
	] as const;
	const distancePresets = [
		{ labelKey: 'dashboard.cpDist500', m: 500 },
		{ labelKey: 'dashboard.cpDist2k', m: 2000 },
		{ labelKey: 'dashboard.cpDist5k', m: 5000 },
		{ labelKey: 'dashboard.cpDist10k', m: 10000 }
	] as const;

	const predictedPace = $derived.by(() => {
		if (!cp || predictMode !== 'duration') return null;
		if (!durationMin || isNaN(durationMin)) return null;
		const sec = durationMin * 60;
		if (sec < 60 || sec > 7200) return null;
		return predictPaceForDuration(cp, sec, predictorSport);
	});

	const predictedTime = $derived.by(() => {
		if (!cp || predictMode !== 'distance') return null;
		if (!distanceM || isNaN(distanceM) || distanceM < 100) return null;
		return predictTimeForDistance(cp, distanceM, predictorSport);
	});

	const predictedPaceFromDistance = $derived.by(() => {
		if (predictedTime == null || predictedTime <= 0 || !distanceM || isNaN(distanceM) || distanceM <= 0) return null;
		return (predictedTime * 500) / distanceM;
	});

	function fmtDurationAxis(sec: number): string {
		if (sec < 120) return `${sec}s`;
		if (sec < 3600) return `${Math.round(sec / 60)}m`;
		return `${(sec / 3600).toFixed(1)}h`;
	}

	const curveData = $derived.by((): uPlot.AlignedData => {
		if (!comparison) return [[], [], []];
		const xs = comparison.durations;
		return [xs, comparison.actual, comparison.modelled];
	});

	const chart = $derived(chartTheme(uiTheme.value));
	const curveOptions = $derived.by(() =>
		baseOptions({
			theme: chart,
			xFmt: fmtDurationAxis,
			yAxes: [{ size: 48, fmt: (v) => `${Math.round(v)}` }],
			series: [
				// Actual points use the power token (this is a power-duration curve);
				// the modelled line borrows dps (blue) for contrast — no dedicated token.
				{ label: t('dashboard.cpChartActual'), role: 'power', width: 0, points: 7 },
				{ label: t('dashboard.cpChartModel'), role: 'dps', width: 2 }
			]
		})
	);

	function cpExplain(cpVal: CriticalPower): string {
		if (cpVal.method === 'model' && cpVal.wPrime > 0) {
			return t('dashboard.cpExplainModel', {
				cp: cpVal.cp,
				wPrime: (cpVal.wPrime / 1000).toFixed(1)
			});
		}
		return t('dashboard.cpExplainEstimate', { cp: cpVal.cp });
	}
</script>

{#if cp}
	<div class="card card-border bg-base-100 shadow-md p-5 cpcard">
		<div class="cphead">
			<div class="cptitle">
				<Zap size={18} />
				<span class="field-label">{t('dashboard.cpTitle')}</span>
			</div>
		</div>
		<p class="cpsub muted">{t('dashboard.cpSub')}</p>

		<div class="cpstats">
			<div class="cs">
				<div class="csv mono">{cp.cp}<span class="unit">W</span></div>
				<div class="csl">{t('dashboard.cpLabel')}</div>
			</div>
			{#if cp.wPrime > 0}
				<div class="cs">
					<div class="csv mono">{(cp.wPrime / 1000).toFixed(1)}<span class="unit">kJ</span></div>
					<div class="csl">{t('dashboard.cpWPrime')}</div>
				</div>
			{/if}
			<div class="cs">
				<div class="csv"><span class="badge badge-soft badge-secondary">{cp.method === 'model' ? t('dashboard.formModelled') : t('dashboard.formEstimated')}</span></div>
				<div class="csl muted">{t('dashboard.cpMethod')}</div>
			</div>
		</div>

		<p class="cpexplain">{cpExplain(cp)}</p>

		<div class="predict">
			<div class="predhead field-label">{t('dashboard.cpPredictTitle')}</div>
			<p class="predsub muted">{t('dashboard.cpPredictSub')}</p>

			<div class="predmodes" role="group" aria-label={t('dashboard.cpPredictTitle')}>
				<button
					class="pchip"
					class:on={predictMode === 'duration'}
					aria-pressed={predictMode === 'duration'}
					onclick={() => (predictMode = 'duration')}
				>{t('dashboard.cpModeDuration')}</button>
				<button
					class="pchip"
					class:on={predictMode === 'distance'}
					aria-pressed={predictMode === 'distance'}
					onclick={() => (predictMode = 'distance')}
				>{t('dashboard.cpModeDistance')}</button>
			</div>

			{#if predictMode === 'duration'}
				<div class="predrow">
					<label class="predlabel muted" for="cp-duration">{t('dashboard.cpHoldFor')}</label>
					<div class="predinput">
						<input id="cp-duration" type="number" min="2" max="120" step="1" enterkeyhint="done" bind:value={durationMin} />
						<span class="muted">{t('dashboard.cpMinutes')}</span>
					</div>
				</div>
				<div class="presets">
					{#each durationPresets as p}
						<button class="pchip small" onclick={() => (durationMin = p.min)}>{t(p.labelKey)}</button>
					{/each}
				</div>
				{#if predictedPace}
					<div class="predresult">
						<div class="predval mono">{fmtPace(predictedPace)}</div>
						<div class="predhint muted">{t('dashboard.cpPaceHint', { min: durationMin })}</div>
					</div>
				{/if}
			{:else}
				<div class="predrow">
					<label class="predlabel muted" for="cp-distance">{t('dashboard.cpDistance')}</label>
					<div class="predinput">
						<input id="cp-distance" type="number" min="100" max="50000" step="100" enterkeyhint="done" bind:value={distanceM} />
						<span class="muted">m</span>
					</div>
				</div>
				<div class="presets">
					{#each distancePresets as p}
						<button class="pchip small" onclick={() => (distanceM = p.m)}>{t(p.labelKey)}</button>
					{/each}
				</div>
				{#if predictedTime}
					<div class="predresult">
						<div class="predval mono">{fmtTime(predictedTime, true)}</div>
						<div class="predhint muted">
							{t('dashboard.cpTimeHint', { dist: fmtDistance(distanceM) })}
							{#if predictedPaceFromDistance}
								· {fmtPaceBare(predictedPaceFromDistance)}/500m
							{/if}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		{#if comparison && comparison.durations.length > 0}
			<div class="curve">
				<div class="field-label muted">{t('dashboard.cpChartTitle')}</div>
				<p class="curvehint muted">{t('dashboard.cpChartHint')}</p>
				<UPlotChart
					data={curveData}
					options={curveOptions}
					height={170}
					caption={t('dashboard.cpChartTitle')}
					description={cpExplain(cp)}
				/>
				<div class="curvelegend muted">
					<span><i class="dot actual"></i> {t('dashboard.cpChartActual')}</span>
					<span><i class="line model"></i> {t('dashboard.cpChartModel')}</span>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.cpcard {
		margin-bottom: 1rem;
		background: linear-gradient(135deg, rgba(158, 91, 45, 0.08), var(--bg-elev) 65%);
		border-color: rgba(158, 91, 45, 0.28);
	}
	.cphead {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.cptitle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--power);
	}
	.cptitle .field-label {
		color: var(--text);
		font-weight: 700;
		font-size: 0.95rem;
	}
	.cpsub {
		font-size: 0.82rem;
		margin: 0.4rem 0 0.85rem;
	}
	.cpstats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.cs {
		background: var(--bg-elev-2);
		border: 1px solid var(--hairline);
		border-radius: 10px;
		padding: 0.55rem 0.7rem;
	}
	.csv {
		font-size: 1.6rem;
		font-weight: 800;
		line-height: 1.05;
	}
	.csv .unit {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-dim);
		margin-left: 0.15rem;
	}
	.csl {
		font-size: 0.78rem;
		font-weight: 700;
		margin-top: 0.12rem;
	}
	.cpexplain {
		font-size: 0.88rem;
		padding: 0.55rem 0.75rem;
		border-radius: 8px;
		background: var(--bg-elev-2);
		border-left: 3px solid var(--power);
		margin-bottom: 1rem;
	}
	.predict {
		border-top: 1px solid var(--hairline);
		padding-top: 0.9rem;
		margin-bottom: 0.9rem;
	}
	.predhead {
		font-weight: 700;
		font-size: 0.9rem;
	}
	.predsub {
		font-size: 0.8rem;
		margin: 0.25rem 0 0.65rem;
	}
	.predmodes,
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.65rem;
	}
	.pchip {
		background: var(--paper-raised);
		border: var(--bd-heavy);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.3rem 0.7rem;
		font-family: var(--display);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		cursor: pointer;
	}
	.pchip.on {
		background: var(--ink);
		color: var(--paper-raised);
		border-color: var(--ink);
	}
	.pchip.small {
		font-size: 0.72rem;
		padding: 0.25rem 0.55rem;
	}
	.predrow {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.predinput {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.predinput input {
		width: 4.5rem;
		font-family: var(--mono);
		font-size: 1rem;
		padding: 0.35rem 0.5rem;
		border: var(--bd-heavy);
		border-radius: var(--r-ctrl);
		background: var(--paper-inset);
		color: var(--ink);
	}
	.predresult {
		margin-top: 0.5rem;
		padding: 0.65rem 0.8rem;
		background: var(--bg-elev-2);
		border: 1px solid var(--hairline);
		border-radius: 10px;
	}
	.predval {
		font-size: 1.5rem;
		font-weight: 800;
	}
	.predhint {
		font-size: 0.78rem;
		margin-top: 0.2rem;
	}
	.curvehint {
		font-size: 0.78rem;
		margin: 0.25rem 0 0.5rem;
	}
	.curvelegend {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.78rem;
		margin-top: 0.45rem;
		justify-content: center;
	}
	.curvelegend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.curvelegend i {
		display: inline-block;
	}
	.curvelegend .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--power);
	}
	.curvelegend .line {
		width: 14px;
		height: 3px;
		border-radius: 2px;
		background: var(--dps);
	}
	@media (max-width: 720px) {
		.predrow {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
