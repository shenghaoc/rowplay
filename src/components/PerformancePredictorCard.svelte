<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import {
		buildPredictionTable,
		PREDICTOR_DISTANCES,
		type PredictionRow,
		type PredictionStatus
	} from '$lib/performancePredictor';
	import { fmtDistance, fmtTime } from '$lib/format';
	import { parsePaceInput } from '$lib/replay/sources';
	import { getI18nContext } from '$lib/i18n.svelte';
	import type { Sport } from '$lib/types';

	type PbRow = { distance: number; time: number; sport: Sport };

	let { personalBests = [] }: { personalBests: PbRow[] } = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	let open = $state(false);
	let knownDistance = $state<number>(2000);
	let timeInput = $state('');
	let rows = $state<PredictionRow[] | null>(null);
	let inputError = $state('');

	function statusText(status: PredictionStatus): string {
		if (status === 'beaten') return t('dashboard.predictor.beaten');
		if (status === 'behind') return t('dashboard.predictor.behind');
		return t('dashboard.predictor.untried');
	}

	function toggleOpen() {
		open = !open;
		if (open) prefillFromPb();
	}

	function prefillFromPb() {
		if (timeInput) return;
		const pb = personalBests.find((p) => p.distance === 2000 && p.sport === 'rower');
		if (pb) {
			knownDistance = pb.distance;
			timeInput = fmtTime(pb.time, true);
		}
	}

	function runPredict() {
		inputError = '';
		const secs = parsePaceInput(timeInput);
		if (secs == null || secs <= 0) {
			inputError = t('dashboard.predictor.inputError');
			rows = null;
			return;
		}
		rows = buildPredictionTable(
			knownDistance,
			secs,
			personalBests
				.filter((p) => p.sport === 'rower')
				.map((p) => ({ distance: p.distance, time: p.time }))
		);
	}

	function statusBadgeClass(status: PredictionStatus): string {
		if (status === 'beaten') return 'badge badge-success';
		if (status === 'behind') return 'badge badge-warning';
		return 'badge badge-ghost';
	}
</script>

<div class="card card-border bg-base-100 shadow-md p-5 predictor-card">
	<button type="button" class="predictor-head" onclick={toggleOpen} aria-expanded={open} aria-controls={open ? 'predictor-body' : undefined}>
		<span class="label">{t('dashboard.predictor.title')}</span>
		<span class="predictor-chevron" aria-hidden="true">
			{#if open}<ChevronDown size={18} />{:else}<ChevronRight size={18} />{/if}
		</span>
	</button>

	{#if open}
		<div id="predictor-body" class="predictor-body">
			<form class="predictor-form" onsubmit={(e) => { e.preventDefault(); runPredict(); }}>
				<label class="predictor-field">
					<span class="muted field-label">{t('dashboard.predictor.distance')}</span>
					<select class="select select-bordered select-sm" bind:value={knownDistance}>
						{#each PREDICTOR_DISTANCES as d}
							<option value={d}>{fmtDistance(d)}</option>
						{/each}
					</select>
				</label>
				<label class="predictor-field">
					<span class="muted field-label">{t('dashboard.predictor.time')}</span>
					<input
						class="input input-bordered input-sm mono"
						type="text"
						inputmode="decimal"
						placeholder="7:04.5"
						bind:value={timeInput}
					/>
				</label>
				<button type="button" class="btn btn-primary btn-sm" onclick={runPredict}>
					{t('dashboard.predictor.predict')}
				</button>
			</form>
			{#if inputError}
				<p class="predictor-error" role="alert">{inputError}</p>
			{/if}

			{#if rows}
				<div class="predictor-table-wrap">
					<table class="table table-zebra table-sm mono predictor-table">
						<thead>
							<tr>
								<th>{t('dashboard.predictor.colDistance')}</th>
								<th class="num">{t('dashboard.predictor.colPredicted')}</th>
								<th class="num">{t('dashboard.predictor.colBest')}</th>
								<th>{t('dashboard.predictor.colStatus')}</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row}
								<tr class:predictor-source={row.distance === knownDistance}>
									<td>{fmtDistance(row.distance)}</td>
									<td class="num" class:muted={row.distance === knownDistance}>
										{fmtTime(row.predictedSeconds, true)}
									</td>
									<td class="num">
										{row.actualBestSeconds != null
											? fmtTime(row.actualBestSeconds, true)
											: t('dashboard.predictor.noTime')}
									</td>
									<td>
										{#if row.distance !== knownDistance}
											<span class={statusBadgeClass(row.status)}>{statusText(row.status)}</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.predictor-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		font: inherit;
		color: inherit;
		text-align: left;
	}
	.predictor-head .label {
		font-size: 0.8rem;
		font-weight: var(--fw-bold);
	}
	.predictor-chevron {
		display: inline-flex;
		color: var(--ink-2);
	}
	.predictor-body {
		margin-top: 0.85rem;
	}
	.predictor-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.65rem 0.85rem;
	}
	.predictor-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		min-width: 0;
	}
	.field-label {
		font-size: var(--text-2xs);
		font-weight: var(--fw-semibold);
	}
	.predictor-error {
		font-size: 0.82rem;
		color: var(--alarm);
		margin: 0.5rem 0 0;
	}
	.predictor-table-wrap {
		margin-top: 0.85rem;
		overflow-x: auto;
	}
	.predictor-table .num {
		text-align: right;
	}
	.predictor-table thead th {
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: var(--text-2xs);
		color: var(--ink-2);
	}
	.predictor-source {
		opacity: 0.85;
	}
</style>
