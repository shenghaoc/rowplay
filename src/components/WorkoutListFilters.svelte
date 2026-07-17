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
	import ChipButton from '$components/ChipButton.svelte';
	import ChipGroup from '$components/ChipGroup.svelte';
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

<section class="card card-border bg-base-100 shadow-md listquery" aria-label={t('workoutList.filtersTitle')}>
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
				aria-controls="lq-details-panel"
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? t('workoutList.collapse') : t('workoutList.expand')}
			</button>
		</div>
	</div>

	<details id="lq-details-panel" class="lq-details" bind:open={expanded}>
		<summary class="lq-summary">{t('workoutList.expand')}</summary>
		<div class="lqgrid">
			<label class="flex flex-col gap-1 w-full">
				<span class="text-xs uppercase opacity-70">{t('workoutList.dateFrom')}</span>
				<input type="date" class="input input-bordered input-sm w-full" value={query.dateFrom ?? ''} onchange={(e) => patch({ dateFrom: e.currentTarget.value || undefined })} />
			</label>
			<label class="flex flex-col gap-1 w-full">
				<span class="text-xs uppercase opacity-70">{t('workoutList.dateTo')}</span>
				<input type="date" class="input input-bordered input-sm w-full" value={query.dateTo ?? ''} onchange={(e) => patch({ dateTo: e.currentTarget.value || undefined })} />
			</label>
			<label class="flex flex-col gap-1 w-full min-w-48">
				<span class="text-xs uppercase opacity-70">{t('workoutList.workoutType')}</span>
				<select class="select select-bordered select-sm w-full" value={query.workoutType ?? ''} onchange={(e) => patch({ workoutType: e.currentTarget.value || undefined })}>
					<option value="">{t('workoutList.anyType')}</option>
					{#each workoutTypes as wt}<option value={wt}>{wt}</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 w-full min-w-48">
				<span class="text-xs uppercase opacity-70">{t('workoutList.strokeData')}</span>
				<select
					class="select select-bordered select-sm w-full"
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
			<form class="join w-full searchrow" onsubmit={(e) => { e.preventDefault(); submitSearch(); }}>
				<label class="input input-bordered join-item flex flex-1 items-center gap-2 min-w-0">
					<Search size={16} class="opacity-60 shrink-0" aria-hidden="true" />
					<input type="search" class="grow min-w-0 bg-transparent border-0 outline-none" inputmode="search" enterkeyhint="search" placeholder={t('workoutList.searchComments')} bind:value={searchDraft} aria-label={t('workoutList.searchComments')} />
				</label>
				<button type="submit" class="btn btn-ghost btn-sm join-item">{t('workoutList.search')}</button>
			</form>
		</search>

		<ChipGroup label={t('workoutList.distanceChips')} ariaLabel={t('workoutList.distanceChips')}>
			{#each DISTANCE_CHIPS as chip}
				<ChipButton active={query.distanceM === chip.m} onclick={() => onchange(toggleDistanceChip(query, chip.m))}>{distanceLabel(chip.m)}</ChipButton>
			{/each}
		</ChipGroup>

		<ChipGroup label={t('workoutList.durationChips')} ariaLabel={t('workoutList.durationChips')}>
			{#each DURATION_CHIPS as chip}
				<ChipButton active={durationChipActive(query, chip.sec)} onclick={() => onchange(toggleDurationChip(query, chip.sec))}>{t('workoutList.durationMin', { n: chip.key })}</ChipButton>
			{/each}
		</ChipGroup>

		<ChipGroup label={t('workoutList.sortGroup')} ariaLabel={t('workoutList.sortGroup')}>
			{#each sorts as s}
				<ChipButton active={query.sort === s.id} onclick={() => toggleSort(s.id)}>
					{t(s.labelKey)}{#if query.sort === s.id}<span class="opacity-70 text-xs">{query.dir === 'asc' ? '↑' : '↓'}</span>{/if}
				</ChipButton>
			{/each}
			<ChipButton active={query.pbsOnly} onclick={() => patch({ pbsOnly: !query.pbsOnly })}>{t('workoutList.pbsOnly')}</ChipButton>
		</ChipGroup>

		</details>
</section>

<style>
	.listquery {
		margin-bottom: 0.75rem;
		padding: 0.85rem 1rem;
	}
	.lqhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		flex-wrap: wrap;
	}
	.lqtitle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--display);
		font-weight: var(--fw-bold);
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.lqcount {
		font-family: var(--mono);
		font-size: 0.78rem;
		font-weight: var(--fw-medium);
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
	.searchrow {
		margin-top: 0.75rem;
	}
	@media (max-width: 720px) {
		.lqgrid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
