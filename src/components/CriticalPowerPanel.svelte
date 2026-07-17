<script lang="ts">
	import type uPlot from 'uplot';
	import UPlotChart from '$components/UPlotChart.svelte';
	import Zap from '@lucide/svelte/icons/zap';
	import {
		estimateCriticalPower,
		powerDurationComparison,
		predictPaceForDuration,
		predictTimeForDistance,
		type CriticalPower,
		type CriticalPowerWarning
	} from '$lib/analytics';
	import { fmtDistance, fmtPace, fmtPaceBare, fmtTime, SPORT_LABEL } from '$lib/format';
	import type { Sport, Workout } from '$lib/types';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { getThemeContext } from '$lib/theme.svelte';
	import { chartTheme, baseOptions } from '$lib/chartTheme';

	let { workouts }: { workouts: Workout[] } = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const uiTheme = getThemeContext();

	type Scope = Sport | 'all';
	let scope = $state<Scope>('all');
	const scopes: Scope[] = ['all', 'rower', 'skierg', 'bike'];
	const scopedWorkouts = $derived.by(() =>
		scope === 'all' ? workouts : workouts.filter((w) => w.sport === scope)
	);
	const anyCp = $derived(estimateCriticalPower(workouts));
	const cp = $derived(scope === 'all' ? anyCp : estimateCriticalPower(scopedWorkouts));
	const comparison = $derived(cp ? powerDurationComparison(scopedWorkouts, cp) : null);
	const predictorSport = $derived< Sport | undefined >(
		scope === 'all' ? (cp?.sportScope === 'mixed' ? undefined : cp?.sportScope) : scope
	);
	const canPredictPace = $derived(predictorSport != null);
	const cpScopeLabel = $derived(scope === 'all' ? t('dashboard.cpScopeAll') : SPORT_LABEL[scope]);
	const predictionScopeLabel = $derived(predictorSport ? SPORT_LABEL[predictorSport] : cpScopeLabel);

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
				wPrime: (cpVal.wPrime / 1000).toFixed(1),
				scope: cpScopeLabel
			});
		}
		return t('dashboard.cpExplainEstimate', { cp: cpVal.cp, scope: cpScopeLabel });
	}

	function warningClass(w: CriticalPowerWarning): string {
		return w === 'stale-efforts' || w === 'mixed-sports' || w === 'unrealistic-fit'
			? 'badge-warning'
			: 'badge-ghost';
	}
</script>

{#if anyCp}
	<div class="card card-border bg-base-100 shadow-md p-5 cpcard">
		<div class="cphead">
			<div class="cptitle">
				<Zap size={18} />
				<span class="field-label">{t('dashboard.cpTitle')}</span>
			</div>
			<div role="tablist" class="tabs tabs-box tabs-sm cpscopes" aria-label={t('dashboard.cpScopeLabel')}>
				{#each scopes as s}
					<button
						type="button"
						role="tab"
						class="tab"
						class:tab-active={scope === s}
						aria-selected={scope === s}
						onclick={() => (scope = s)}
					>
						{s === 'all' ? t('dashboard.cpScopeAll') : SPORT_LABEL[s]}
					</button>
				{/each}
			</div>
		</div>
		<p class="cpsub muted">{t('dashboard.cpSub')}</p>

		{#if cp}
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
			<div class="cs">
				<div class="csv"><span class="badge badge-soft cpconfidence cpconfidence-{cp.confidence}">{t(`dashboard.cpConfidence.${cp.confidence}`)}</span></div>
				<div class="csl muted">{t('dashboard.cpConfidenceLabel')}</div>
			</div>
		</div>

		<p class="cpexplain">{cpExplain(cp)}</p>
		<div class="cptrust">
			<span>{t('dashboard.cpSample', { n: cp.sampleSize, points: cp.envelopePoints })}</span>
			{#if cp.newestEffortDate}
				<span>{t('dashboard.cpFreshness', { date: cp.newestEffortDate })}</span>
			{/if}
			{#if cp.fitQuality}
				<span>{t('dashboard.cpFit', { r2: cp.fitQuality.r2.toFixed(2), residual: cp.fitQuality.residualPct.toFixed(1) })}</span>
			{/if}
		</div>
		{#if cp.warnings.length}
			<div class="cpwarnings" aria-label={t('dashboard.cpWarningsLabel')}>
				{#each cp.warnings as w}
					<span class="badge badge-sm badge-soft {warningClass(w)}">{t(`dashboard.cpWarning.${w}`)}</span>
				{/each}
			</div>
		{/if}

		<div class="predict">
			<div class="predhead field-label">{t('dashboard.cpPredictTitle')}</div>
			<p class="predsub muted">{t('dashboard.cpPredictSub')}</p>

			{#if canPredictPace}
				<div class="predmodes" role="group" aria-label={t('dashboard.cpPredictTitle')}>
					<button
						type="button"
						class="pchip"
						class:on={predictMode === 'duration'}
						aria-pressed={predictMode === 'duration'}
						onclick={() => (predictMode = 'duration')}
					>{t('dashboard.cpModeDuration')}</button>
					<button
						type="button"
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
							<input id="cp-duration" type="number" min="2" max="120" step="1" enterkeyhint="done" class="input input-bordered input-sm" bind:value={durationMin} />
							<span class="muted">{t('dashboard.cpMinutes')}</span>
						</div>
					</div>
					<div class="presets">
						{#each durationPresets as p}
							<button type="button" class="pchip small" onclick={() => (durationMin = p.min)}>{t(p.labelKey)}</button>
						{/each}
					</div>
					{#if predictedPace}
						<div class="predresult">
							<div class="predval mono">{fmtPace(predictedPace)}</div>
							<div class="predhint muted">{t('dashboard.cpPaceHint', { min: durationMin, scope: predictionScopeLabel })}</div>
						</div>
					{/if}
				{:else}
					<div class="predrow">
						<label class="predlabel muted" for="cp-distance">{t('dashboard.cpDistance')}</label>
						<div class="predinput">
							<input id="cp-distance" type="number" min="100" max="50000" step="100" enterkeyhint="done" class="input input-bordered input-sm" bind:value={distanceM} />
							<span class="muted">m</span>
						</div>
					</div>
					<div class="presets">
						{#each distancePresets as p}
							<button type="button" class="pchip small" onclick={() => (distanceM = p.m)}>{t(p.labelKey)}</button>
						{/each}
					</div>
					{#if predictedTime}
						<div class="predresult">
							<div class="predval mono">{fmtTime(predictedTime, true)}</div>
							<div class="predhint muted">
								{t('dashboard.cpTimeHint', { dist: fmtDistance(distanceM), scope: predictionScopeLabel })}
								{#if predictedPaceFromDistance}
									· {fmtPaceBare(predictedPaceFromDistance)}/500m
								{/if}
							</div>
						</div>
					{/if}
				{/if}
			{:else}
				<p class="predsub muted">{t('dashboard.cpMixedPredictNote')}</p>
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
		{:else if scope !== 'all'}
			<p class="cpexplain">{t('dashboard.cpEmptyScope', { scope: cpScopeLabel })}</p>
		{/if}
	</div>
{/if}

<style>
	.cpcard {
		min-width: 0;
		max-width: 100%;
		overflow-x: clip;
		margin-bottom: 1rem;
		background: linear-gradient(135deg, color-mix(in srgb, var(--power) 8%, var(--bg-elev)), var(--bg-elev) 65%);
		border-color: color-mix(in srgb, var(--power) 28%, var(--bg-elev));
	}
	.cphead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		flex-wrap: wrap;
	}
	.cptitle {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		color: var(--power);
	}
	.cptitle .field-label {
		color: var(--text);
		font-weight: var(--fw-bold);
		font-size: 0.95rem;
	}
	.cpsub {
		font-size: 0.82rem;
		margin: 0.4rem 0 0.85rem;
	}
	.cpscopes {
		flex-wrap: wrap;
	}
	.cpstats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--space-md);
		margin-bottom: 0.75rem;
	}
	.cs {
		background: var(--bg-elev-2);
		border: 1px solid var(--hairline);
		border-radius: var(--r-ctrl);
		padding: 0.55rem 0.7rem;
	}
	.csv {
		font-size: 1.6rem;
		font-weight: var(--fw-extrabold);
		line-height: 1.05;
	}
	.csv .unit {
		font-size: 0.85rem;
		font-weight: var(--fw-semibold);
		color: var(--text-dim);
		margin-left: 0.15rem;
	}
	.csl {
		font-size: 0.78rem;
		font-weight: var(--fw-bold);
		margin-top: 0.12rem;
	}
	.cpexplain {
		font-size: 0.88rem;
		padding: 0.55rem 0.75rem;
		border-radius: var(--r-ctrl);
		background: var(--bg-elev-2);
		border-left: 3px solid var(--power);
		margin-bottom: 1rem;
	}
	.cptrust {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem var(--space-md);
		font-size: 0.78rem;
		color: var(--text-dim);
		margin: -0.35rem 0 0.75rem;
	}
	.cptrust span::before {
		content: '•';
		margin-right: 0.45rem;
		color: var(--power);
	}
	.cpwarnings {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		margin: -0.25rem 0 0.9rem;
	}
	.cpconfidence {
		white-space: nowrap;
	}
	.cpconfidence-high {
		--badge-color: var(--ahead);
	}
	.cpconfidence-medium {
		--badge-color: var(--live);
	}
	.cpconfidence-low,
	.cpconfidence-insufficient {
		--badge-color: var(--warn);
	}
	.predict {
		border-top: 1px solid var(--hairline);
		padding-top: 0.9rem;
		margin-bottom: 0.9rem;
	}
	.predhead {
		font-weight: var(--fw-bold);
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
		gap: var(--space-xs);
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
		font-weight: var(--fw-bold);
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
		font-size: var(--text-2xs);
		padding: 0.25rem 0.55rem;
	}
	.predrow {
		display: flex;
		align-items: center;
		gap: var(--space-md);
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
	}
	.predresult {
		margin-top: 0.5rem;
		padding: 0.65rem 0.8rem;
		background: var(--bg-elev-2);
		border: 1px solid var(--hairline);
		border-radius: var(--r-ctrl);
	}
	.predval {
		font-size: 1.5rem;
		font-weight: var(--fw-extrabold);
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
		gap: var(--space-lg);
		flex-wrap: wrap;
		font-size: 0.78rem;
		margin-top: 0.45rem;
		justify-content: center;
	}
	.curvelegend span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
	}
	.curvelegend i {
		display: inline-block;
	}
	.curvelegend .dot {
		width: 8px;
		height: 8px;
		border-radius: var(--r-round);
		background: var(--power);
	}
	.curvelegend .line {
		width: 14px;
		height: 3px;
		border-radius: var(--r-ctrl);
		background: var(--dps);
	}
	@media (max-width: 720px) {
		.predrow {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
