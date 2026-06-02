<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import X from '@lucide/svelte/icons/x';
	import {
		DISTANCE_CHIPS,
		DURATION_CHIPS,
		durationChipActive,
		listQueryIsFiltered,
		toggleDistanceChip,
		toggleDurationChip,
		type WorkoutListQuery,
		type WorkoutSortField
	} from '$lib/workoutQuery';
	import { untrack } from 'svelte';
	import { getI18nContext } from '$lib/i18n.svelte';

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	interface Props {
		query: WorkoutListQuery;
		workoutTypes: string[];
		resultCount: number;
		onchange: (q: WorkoutListQuery) => void;
		onclear: () => void;
	}

	let { query, workoutTypes, resultCount, onchange, onclear }: Props = $props();

	const sorts: { id: WorkoutSortField; labelKey: string }[] = [
		{ id: 'date', labelKey: 'workoutList.sortDate' },
		{ id: 'distance', labelKey: 'workoutList.sortDistance' },
		{ id: 'time', labelKey: 'workoutList.sortTime' },
		{ id: 'pace', labelKey: 'workoutList.sortPace' },
		{ id: 'power', labelKey: 'workoutList.sortPower' }
	];

	let searchDraft = $state(untrack(() => query.q ?? ''));
	let expanded = $state(untrack(() => listQueryIsFiltered(query)));

	$effect(() => {
		searchDraft = query.q ?? '';
		if (listQueryIsFiltered(query)) expanded = true;
	});

	function patch(partial: Partial<WorkoutListQuery>) {
		onchange({ ...query, ...partial });
	}

	function toggleSort(field: WorkoutSortField) {
		if (query.sort === field) {
			patch({ dir: query.dir === 'asc' ? 'desc' : 'asc' });
		} else {
			const dir = field === 'date' ? 'desc' : field === 'pace' || field === 'time' ? 'asc' : 'desc';
			patch({ sort: field, dir });
		}
	}

	function submitSearch() {
		const q = searchDraft.trim();
		patch({ q: q || undefined });
	}

	function distanceLabel(m: number): string {
		if (m >= 42195) return t('workoutList.chipMarathon');
		if (m >= 1000) return `${m / 1000}k`;
		return `${m}m`;
	}
</script>

<section class="listquery" aria-label={t('workoutList.filtersTitle')}>
	<div class="lqhead">
		<div class="lqtitle">
			<SlidersHorizontal size={16} />
			<span>{t('workoutList.filtersTitle')}</span>
			<span class="lqcount muted">{t('workoutList.matching', { n: resultCount })}</span>
		</div>
		<div class="lqactions">
			{#if listQueryIsFiltered(query)}
				<button type="button" class="btn btn-ghost btn-sm" onclick={onclear}>
					<X size={14} />
					{t('workoutList.clearFilters')}
				</button>
			{/if}
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? t('workoutList.collapse') : t('workoutList.expand')}
			</button>
		</div>
	</div>

	<details class="lq-details" bind:open={expanded}>
		<summary class="lq-summary">{t('workoutList.expand')}</summary>
		<div class="lqgrid">
			<label class="field">
				<span class="flabel muted">{t('workoutList.dateFrom')}</span>
				<input
					class="input input-bordered w-full"
					type="date"
					value={query.dateFrom ?? ''}
					onchange={(e) => patch({ dateFrom: e.currentTarget.value || undefined })}
				/>
			</label>
			<label class="field">
				<span class="flabel muted">{t('workoutList.dateTo')}</span>
				<input
					type="date"
					value={query.dateTo ?? ''}
					onchange={(e) => patch({ dateTo: e.currentTarget.value || undefined })}
				/>
			</label>
			<label class="field grow">
				<span class="flabel muted">{t('workoutList.workoutType')}</span>
				<select
					value={query.workoutType ?? ''}
					onchange={(e) => patch({ workoutType: e.currentTarget.value || undefined })}
				>
					<option value="">{t('workoutList.anyType')}</option>
					{#each workoutTypes as wt}
						<option value={wt}>{wt}</option>
					{/each}
				</select>
			</label>
			<label class="field grow">
				<span class="flabel muted">{t('workoutList.strokeData')}</span>
				<select
					value={query.hasStroke === true ? '1' : query.hasStroke === false ? '0' : ''}
					onchange={(e) => {
						const v = e.currentTarget.value;
						patch({ hasStroke: v === '1' ? true : v === '0' ? false : undefined });
					}}
				>
					<option value="">{t('workoutList.strokeAny')}</option>
					<option value="1">{t('workoutList.strokeYes')}</option>
					<option value="0">{t('workoutList.strokeNo')}</option>
				</select>
			</label>
		</div>

		<search>
		<form class="searchrow" onsubmit={(e) => { e.preventDefault(); submitSearch(); }}>
			<span class="sicon" aria-hidden="true"><Search size={16} /></span>
			<input
				type="search"
				inputmode="search"
				enterkeyhint="search"
				placeholder={t('workoutList.searchComments')}
				bind:value={searchDraft}
				aria-label={t('workoutList.searchComments')}
			/>
			<button type="submit" class="btn btn-ghost btn-sm">{t('workoutList.search')}</button>
		</form>
		</search>

		<div class="chips" role="group" aria-label={t('workoutList.distanceChips')}>
			<span class="chiplabel muted">{t('workoutList.distanceChips')}</span>
			{#each DISTANCE_CHIPS as chip}
				<button
					type="button"
					class="chip"
					class:on={query.distanceM === chip.m}
					aria-pressed={query.distanceM === chip.m}
					onclick={() => onchange(toggleDistanceChip(query, chip.m))}
				>
					{distanceLabel(chip.m)}
				</button>
			{/each}
		</div>

		<div class="chips" role="group" aria-label={t('workoutList.durationChips')}>
			<span class="chiplabel muted">{t('workoutList.durationChips')}</span>
			{#each DURATION_CHIPS as chip}
				<button
					type="button"
					class="chip"
					class:on={durationChipActive(query, chip.sec)}
					aria-pressed={durationChipActive(query, chip.sec)}
					onclick={() => onchange(toggleDurationChip(query, chip.sec))}
				>
					{t('workoutList.durationMin', { n: chip.key })}
				</button>
			{/each}
		</div>

		<div class="chips" role="group" aria-label={t('workoutList.sortGroup')}>
			<span class="chiplabel muted">{t('workoutList.sortGroup')}</span>
			{#each sorts as s}
				<button
					type="button"
					class="chip"
					class:on={query.sort === s.id}
					aria-pressed={query.sort === s.id}
					onclick={() => toggleSort(s.id)}
				>
					{t(s.labelKey)}
					{#if query.sort === s.id}
						<span class="dir">{query.dir === 'asc' ? '↑' : '↓'}</span>
					{/if}
				</button>
			{/each}
			<button
				type="button"
				class="chip"
				class:on={query.pbsOnly}
				aria-pressed={query.pbsOnly}
				onclick={() => patch({ pbsOnly: !query.pbsOnly })}
			>
				{t('workoutList.pbsOnly')}
			</button>
		</div>
	</details>
</section>

<style>
	.listquery {
		margin-bottom: 0.75rem;
		padding: 0.85rem 1rem;
		border: var(--bd-heavy);
		border-radius: var(--r-card);
		background: var(--paper-raised);
	}
	.lqhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.lqtitle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--display);
		font-weight: 700;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.lqcount {
		font-family: var(--mono);
		font-size: 0.78rem;
		font-weight: 500;
		text-transform: none;
		letter-spacing: 0;
	}
	.lqactions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.lq-details > .lq-summary {
		display: none;
	}
	.lqgrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.65rem;
		margin-top: 0.85rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field.grow {
		min-width: 12rem;
	}
	.flabel {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	input,
	select {
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: var(--r-ctrl);
		color: var(--ink);
		padding: 0.4rem 0.55rem;
		font-size: 0.88rem;
	}
	.searchrow {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.sicon {
		display: inline-flex;
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.searchrow input {
		flex: 1;
		min-width: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.65rem;
	}
	.chiplabel {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-right: 0.25rem;
	}
	.chip {
		background: var(--paper-inset);
		border: var(--bd-heavy);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.3rem 0.7rem;
		font-family: var(--display);
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		cursor: pointer;
	}
	.chip.on {
		background: var(--ink);
		color: var(--paper-raised);
		border-color: var(--ink);
	}
	.dir {
		margin-left: 0.2rem;
		font-size: 0.75rem;
	}
	@media (max-width: 720px) {
		.lqgrid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
