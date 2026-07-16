<script lang="ts">
	import type { Workout } from '$lib/types';
	import { fmtDistance, fmtTime } from '$lib/format';
	import {
		buildDistribution,
		buildZoneConfig,
		slicePercent,
		slicePercentDistance,
		workoutsInPeriod,
		type TidPeriod,
		type ZoneLabel,
		ZONES_3,
		ZONES_5
	} from '$lib/trainingZones';
	import { getI18nContext } from '$lib/i18n.svelte';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';

	let { workouts }: { workouts: Workout[] } = $props();

	const i18n = getI18nContext();

	type Measure = 'time' | 'distance';
	let measure = $state<Measure>('time');
	let period = $state<TidPeriod>('4w');
	let hoverZone = $state<ZoneLabel | null>(null);

	const zoneConfig = $derived(buildZoneConfig(workouts));
	const periodWorkouts = $derived(workoutsInPeriod(workouts, period));
	const distribution = $derived(buildDistribution(periodWorkouts, zoneConfig));

	const zones = $derived(zoneConfig.basePace != null ? ZONES_5 : ZONES_3);

	const totalQty = $derived(
		measure === 'time' ? distribution.totalSeconds : distribution.totalMeters
	);

	function pctForZone(zone: ZoneLabel): number {
		const slice = distribution.slices.find((s) => s.zone === zone);
		if (!slice || totalQty <= 0) return 0;
		return measure === 'time'
			? slicePercent(slice, distribution.totalSeconds)
			: slicePercentDistance(slice, distribution.totalMeters);
	}

	function zoneLabelKey(zone: ZoneLabel): string {
		return `dashboard.tid.zone.${zone}`;
	}

	const periods: { id: TidPeriod; key: string }[] = [
		{ id: '4w', key: 'dashboard.tid.period4w' },
		{ id: '3m', key: 'dashboard.tid.period3m' },
		{ id: '12m', key: 'dashboard.tid.period12m' }
	];

	const tooltipSlice = $derived.by(() => {
		if (!hoverZone) return null;
		return distribution.slices.find((s) => s.zone === hoverZone) ?? null;
	});

	const tooltipPct = $derived.by(() => {
		if (!tooltipSlice) return 0;
		return measure === 'time'
			? slicePercent(tooltipSlice, distribution.totalSeconds)
			: slicePercentDistance(tooltipSlice, distribution.totalMeters);
	});

	const barSegments = $derived.by(() => {
		let x = 0;
		const out: { zone: ZoneLabel; pct: number; x: number }[] = [];
		for (const zone of zones) {
			const pct = pctForZone(zone);
			if (pct > 0) {
				out.push({ zone, pct, x });
				x += pct;
			}
		}
		return out;
	});
</script>

<div class="tidcard card card-border bg-base-100 shadow-md p-5">
	<div class="tidhead">
		<div class="tidlabel">
			<span class="tidicon"><BarChart3 size={15} /></span>
			<span class="muted field-label">{i18n.t('dashboard.tid.title')}</span>
		</div>
		<div class="tidcontrols">
			<div class="join join-horizontal tidperiod" role="group" aria-label={i18n.t('dashboard.tid.title')}>
				{#each periods as p}
					<button
						type="button"
						class="btn btn-xs join-item"
						class:btn-active={period === p.id}
						class:btn-neutral={period === p.id}
						aria-pressed={period === p.id}
						onclick={() => (period = p.id)}
					>
						{i18n.t(p.key)}
					</button>
				{/each}
			</div>
			<div class="tidmetrics">
				<button
					type="button"
					class="mchip"
					class:on={measure === 'time'}
					aria-pressed={measure === 'time'}
					onclick={() => (measure = 'time')}
				>
					{i18n.t('dashboard.tid.time')}
				</button>
				<button
					type="button"
					class="mchip"
					class:on={measure === 'distance'}
					aria-pressed={measure === 'distance'}
					onclick={() => (measure = 'distance')}
				>
					{i18n.t('dashboard.tid.distance')}
				</button>
			</div>
		</div>
	</div>

	{#if distribution.totalSeconds <= 0}
		<p class="muted tidempty">{i18n.t('dashboard.tid.empty')}</p>
	{:else}
		<div
			class="tidbar"
			role="img"
			aria-label={i18n.t('dashboard.tid.title')}
			onmouseleave={() => (hoverZone = null)}
		>
			<svg viewBox="0 0 100 12" preserveAspectRatio="none" class="tidbar-svg">
				{#each barSegments as seg (seg.zone)}
					<rect
						x={seg.x}
						y="0"
						width={seg.pct}
						height="12"
						class="tidseg tidseg--{seg.zone}"
						role="presentation"
						onmouseenter={() => (hoverZone = seg.zone)}
					/>
				{/each}
			</svg>
		</div>

		{#if tooltipSlice && hoverZone}
			<div class="tidtooltip mono" role="status">
				{i18n.t(zoneLabelKey(hoverZone))} · {fmtTime(tooltipSlice.seconds)} · {fmtDistance(tooltipSlice.meters)} · {tooltipPct.toFixed(1)}%
			</div>
		{/if}

		<ul class="tidlegend">
			{#each zones as zone}
				{@const slice = distribution.slices.find((s) => s.zone === zone)}
				{@const pct = pctForZone(zone)}
				{#if slice && pct > 0}
					<li>
						<span class="tidswatch tidseg--{zone}" aria-hidden="true"></span>
						<span class="tidleglabel">{i18n.t(zoneLabelKey(zone))}</span>
						<span class="tidlegpct mono">{pct < 1 && pct > 0 ? '<1%' : pct.toFixed(0) + '%'}</span>
						<span class="muted tidlegval">
							{measure === 'time' ? fmtTime(slice.seconds) : fmtDistance(slice.meters)}
						</span>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tidhead {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.85rem;
	}
	.tidlabel {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.tidicon {
		color: var(--ink-2);
		display: flex;
	}
	.tidcontrols {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}
	.tidmetrics {
		display: flex;
		gap: 0.25rem;
	}
	.mchip {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		border: 1px solid var(--hairline);
		background: var(--paper-inset);
		color: var(--ink-2);
		cursor: pointer;
	}
	.mchip.on {
		background: color-mix(in srgb, var(--ghost) 14%, var(--paper-raised));
		border-color: color-mix(in srgb, var(--ghost) 35%, transparent);
		color: var(--ghost);
	}
	.tidempty {
		font-size: 0.85rem;
		padding: 0.25rem 0;
	}
	.tidbar {
		width: 100%;
		border-radius: var(--r-ctrl);
		overflow: hidden;
		border: 1px solid var(--hairline);
	}
	.tidbar-svg {
		display: block;
		width: 100%;
		height: 1.25rem;
	}
	.tidseg {
		cursor: default;
	}
	.tidseg--UT2,
	.tidswatch.tidseg--UT2 {
		fill: var(--tid-ut2);
		background: var(--tid-ut2);
	}
	.tidseg--UT1,
	.tidswatch.tidseg--UT1 {
		fill: var(--tid-ut1);
		background: var(--tid-ut1);
	}
	.tidseg--AT,
	.tidswatch.tidseg--AT {
		fill: var(--tid-at);
		background: var(--tid-at);
	}
	.tidseg--TR,
	.tidswatch.tidseg--TR {
		fill: var(--tid-tr);
		background: var(--tid-tr);
	}
	.tidseg--AN,
	.tidswatch.tidseg--AN {
		fill: var(--tid-an);
		background: var(--tid-an);
	}
	.tidseg--Easy,
	.tidswatch.tidseg--Easy {
		fill: var(--tid-easy);
		background: var(--tid-easy);
	}
	.tidseg--Moderate,
	.tidswatch.tidseg--Moderate {
		fill: var(--tid-moderate);
		background: var(--tid-moderate);
	}
	.tidseg--Hard,
	.tidswatch.tidseg--Hard {
		fill: var(--tid-hard);
		background: var(--tid-hard);
	}
	.tidtooltip {
		font-size: 0.78rem;
		margin-top: 0.45rem;
		padding: 0.35rem 0.5rem;
		background: var(--paper-inset);
		border: 1px solid var(--hairline);
		border-radius: var(--r-ctrl);
	}
	.tidlegend {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
		font-size: 0.78rem;
	}
	.tidlegend li {
		display: grid;
		grid-template-columns: 0.65rem 1fr auto auto;
		align-items: center;
		gap: 0.35rem 0.5rem;
	}
	.tidswatch {
		width: 0.65rem;
		height: 0.65rem;
		border-radius: var(--r-ctrl);
	}
	.tidlegpct {
		font-weight: 700;
	}
	.tidlegval {
		font-size: 0.72rem;
	}
	.tidcard {
		--tid-ut2: color-mix(in srgb, var(--dps) 85%, var(--paper-raised));
		--tid-ut1: color-mix(in srgb, var(--ahead) 55%, var(--dps));
		--tid-at: color-mix(in srgb, var(--power) 70%, var(--paper-raised));
		--tid-tr: color-mix(in srgb, var(--live) 75%, var(--paper-raised));
		--tid-an: color-mix(in srgb, var(--alarm) 80%, var(--paper-raised));
		--tid-easy: color-mix(in srgb, var(--dps) 75%, var(--paper-raised));
		--tid-moderate: color-mix(in srgb, var(--power) 55%, var(--paper-raised));
		--tid-hard: color-mix(in srgb, var(--alarm) 70%, var(--paper-raised));
	}
</style>
