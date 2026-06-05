<script lang="ts">
	import type { Workout } from '$lib/types';
	import { buildTrainingCalendar, type VolumeMetric } from '$lib/analytics';
	import { fmtDate, fmtDistance, fmtTime } from '$lib/format';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import { getI18nContext } from '$lib/i18n.svelte';

	let {
		workouts,
		endDay,
		homeTz
	}: {
		workouts: Workout[];
		/** Inclusive grid end (`YYYY-MM-DD`), from server load for SSR-stable hydration. */
		endDay: string;
		/** User home IANA timezone for calendar bucketing. */
		homeTz?: string;
	} = $props();

	const i18n = getI18nContext();

	function monthLabel(month: number): string {
		// Use a synthetic date (year 2000, 1st of month) to get the short month name
		// in the current locale. Works for both en (Jan) and zh (1月).
		return new Date(2000, month - 1, 1).toLocaleDateString(i18n.lang, { month: 'short' });
	}
	let metric = $state<VolumeMetric>('distance');

	const calendar = $derived(buildTrainingCalendar(workouts, { endDay, metric, homeTz }));

	const DOW_KEYS = [
		'dashboard.calDowSun',
		'dashboard.calDowMon',
		'dashboard.calDowTue',
		'dashboard.calDowWed',
		'dashboard.calDowThu',
		'dashboard.calDowFri',
		'dashboard.calDowSat'
	] as const;

	function cellTitle(cell: (typeof calendar.cells)[0]): string {
		if (!cell.day || cell.sessions === 0) {
			const date = cell.day || calendar.endDay;
			return i18n.t('dashboard.calEmpty', { date: fmtDate(date) });
		}
		const volume = metric === 'distance' ? fmtDistance(cell.distance) : fmtTime(cell.time);
		return i18n.t('dashboard.calTooltip', {
			date: fmtDate(cell.day),
			sessions: cell.sessions,
			volume
		});
	}
</script>

<div class="calcard card card-border bg-base-100 shadow-md p-5">
	<div class="calhead">
		<div class="callabel">
			<span class="calicon"><CalendarDays size={15} /></span>
			<span class="muted field-label">{i18n.t('dashboard.calTitle')}</span>
		</div>
		<div class="calmetrics">
			<button class="mchip" class:on={metric === 'distance'} onclick={() => (metric = 'distance')}>
				{i18n.t('dashboard.calMetricDistance')}
			</button>
			<button class="mchip" class:on={metric === 'time'} onclick={() => (metric = 'time')}>
				{i18n.t('dashboard.calMetricTime')}
			</button>
		</div>
	</div>

	<div class="calstats muted">
		<span>{i18n.t('dashboard.calActiveDays', { n: calendar.activeDays })}</span>
		{#if calendar.currentStreak > 0}
			<span>· {i18n.t('dashboard.calCurrentStreak', { n: calendar.currentStreak })}</span>
		{/if}
		{#if calendar.longestStreak > 1}
			<span>· {i18n.t('dashboard.calLongestStreak', { n: calendar.longestStreak })}</span>
		{/if}
	</div>

	<div class="calwrap">
		<div class="dowlabels" aria-hidden="true">
			{#each DOW_KEYS as key, i}
				{#if i % 2 === 1}
					<span class="dow muted">{i18n.t(key)}</span>
				{:else}
					<span class="dow"></span>
				{/if}
			{/each}
		</div>
		<div class="calgridarea">
			<div class="monthrow" aria-hidden="true">
				{#each calendar.monthLabels as m (m.week)}
					<span class="month muted" style:left="calc({m.week} * (var(--cell) + var(--gap)))">{monthLabel(m.month)}</span>
				{/each}
			</div>
			<div
				class="heatmap"
				role="img"
				aria-label={i18n.t('dashboard.calAria', {
					active: calendar.activeDays,
					streak: calendar.currentStreak
				})}
				style:--weeks={calendar.weeks}
			>
				{#each calendar.cells as cell (`${cell.week}-${cell.dow}`)}
					{#if cell.day}
						<div
							class="cell"
							data-level={cell.level}
							title={cellTitle(cell)}
							aria-label={cellTitle(cell)}
						></div>
					{:else}
						<div class="cell pad" aria-hidden="true"></div>
					{/if}
				{/each}
			</div>
			<div class="legend muted">
				<span>{i18n.t('dashboard.calLess')}</span>
				<div class="legendcells">
					{#each Array.from({ length: calendar.maxLevel + 1 }, (_, i) => i) as level}
						<div class="cell" data-level={level}></div>
					{/each}
				</div>
				<span>{i18n.t('dashboard.calMore')}</span>
			</div>
		</div>
	</div>
</div>

<style>
	.calcard {
		margin-bottom: 1rem;
		min-width: 0; /* grid items default to min-width:auto; this allows the card to be constrained to its track */
	}
	.calhead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}
	.callabel {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.calicon {
		display: inline-flex;
		color: var(--accent-2);
	}
	.calmetrics {
		display: flex;
		gap: 0.35rem;
	}
	.mchip {
		background: var(--bg-elev);
		border: 1px solid var(--hairline);
		color: var(--text-dim);
		border-radius: 999px;
		padding: 0.3rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.mchip.on {
		background: var(--accent-2);
		color: white;
		border-color: var(--accent-2);
	}
	.calstats {
		font-size: 0.82rem;
		margin-bottom: 0.75rem;
	}
	.calwrap {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
		--cell: 11px;
		--gap: 3px;
	}
	.dowlabels {
		display: grid;
		grid-template-rows: repeat(7, var(--cell));
		gap: var(--gap);
		font-size: 0.65rem;
		padding-top: 1.1rem;
		flex-shrink: 0;
	}
	.dow {
		height: var(--cell);
		line-height: var(--cell);
	}
	.calgridarea {
		position: relative;
		min-width: 0;
		flex-shrink: 0;
	}
	.monthrow {
		position: relative;
		height: 1rem;
		margin-bottom: 0.15rem;
	}
	.month {
		position: absolute;
		font-size: 0.65rem;
		white-space: nowrap;
	}
	.heatmap {
		display: grid;
		grid-template-rows: repeat(7, var(--cell));
		grid-auto-flow: column;
		grid-auto-columns: var(--cell);
		gap: var(--gap);
		width: max-content;
	}
	.cell {
		width: var(--cell);
		height: var(--cell);
		border-radius: 2px;
		background: var(--bg-elev-2);
		border: 1px solid transparent;
	}
	.cell.pad {
		visibility: hidden;
	}
	.cell[data-level='1'] {
		background: color-mix(in srgb, var(--accent-2) 22%, var(--bg-elev-2));
	}
	.cell[data-level='2'] {
		background: color-mix(in srgb, var(--accent-2) 45%, var(--bg-elev-2));
	}
	.cell[data-level='3'] {
		background: color-mix(in srgb, var(--accent-2) 68%, var(--bg-elev-2));
	}
	.cell[data-level='4'] {
		background: var(--accent-2);
	}
	.cell:not(.pad):hover {
		outline: 1px solid var(--accent);
		outline-offset: 1px;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		margin-top: 0.5rem;
		justify-content: flex-end;
	}
	.legendcells {
		display: flex;
		gap: var(--gap);
	}
	.legend .cell {
		cursor: default;
	}
</style>
