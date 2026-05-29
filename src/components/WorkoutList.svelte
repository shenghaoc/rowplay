<script lang="ts">
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { fmtDate, fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import SportIcon from '$components/SportIcon.svelte';
	import { ChevronRight } from '@lucide/svelte';
	import type { Workout } from '$lib/types';

	interface Props {
		workouts: Workout[];
		/** Above this many rows, switch to windowed (virtual) rendering. */
		threshold?: number;
	}

	let { workouts, threshold = 60 }: Props = $props();

	const ROW = 64; // px, must match .row min-height below
	const virtual = $derived(workouts.length > threshold);

	let scrollEl = $state<HTMLDivElement>();

	// The virtualizer is a Svelte store; its `count`/options are kept in sync
	// with the (filtered) list by the $effect below — the initial 0 is just a
	// placeholder until that runs.
	const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLAnchorElement>({
		count: 0,
		getScrollElement: () => scrollEl ?? null,
		estimateSize: () => ROW,
		overscan: 8
	});

	$effect(() => {
		// Keep the virtualizer's count in sync with the (filtered) list length.
		$rowVirtualizer.setOptions({
			count: workouts.length,
			getScrollElement: () => scrollEl ?? null,
			estimateSize: () => ROW,
			overscan: 8
		});
	});

	const items = $derived(virtual ? $rowVirtualizer.getVirtualItems() : []);
</script>

{#snippet row(w: Workout)}
	<div class="sport" style:color="var(--accent)"><SportIcon sport={w.sport} size={22} /></div>
	<div class="rowmain">
		<div class="rowtop">
			<strong>{w.workoutType || SPORT_LABEL[w.sport]}</strong>
			<span class="muted">{fmtDate(w.date)}</span>
		</div>
		<div class="rowmeta mono muted">
			{fmtDistance(w.distance)} · {fmtTime(w.time, true)} · {fmtPace(w.pace)}
			{#if w.strokeRate}· {w.strokeRate} spm{/if}
			{#if w.heartRateAvg}· {Math.round(w.heartRateAvg)} bpm{/if}
		</div>
	</div>
	<div class="play"><ChevronRight size={18} /></div>
{/snippet}

{#if workouts.length === 0}
	<p class="muted">No workouts for this filter.</p>
{:else if virtual}
	<!-- Windowed list: a fixed-height scroller with absolutely-positioned rows. -->
	<div class="vscroll" bind:this={scrollEl}>
		<div class="vinner" style:height="{$rowVirtualizer.getTotalSize()}px">
			{#each items as item (item.key)}
				{@const w = workouts[item.index]}
				<a
					class="card row vrow"
					href="/replay/{w.id}"
					style:height="{item.size}px"
					style:transform="translateY({item.start}px)"
				>
					{@render row(w)}
				</a>
			{/each}
		</div>
	</div>
	<p class="vcount muted">{workouts.length} workouts · windowed for performance</p>
{:else}
	<!-- Small list: plain flow layout. -->
	<div class="list">
		{#each workouts as w (w.id)}
			<a class="card row" href="/replay/{w.id}">{@render row(w)}</a>
		{/each}
	</div>
{/if}

<style>
	.list {
		display: grid;
		gap: 0.6rem;
	}
	.vscroll {
		position: relative;
		height: 640px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.4rem;
	}
	.vinner {
		position: relative;
		width: 100%;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--text);
		transition: border-color 0.15s ease;
	}
	.row:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.vrow {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		/* keep rows clear of each other / the scrollbar */
		inset-inline: 0;
	}
	.vcount {
		font-size: 0.8rem;
		margin: 0.5rem 0 0;
		text-align: right;
	}
	.sport {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.rowmain {
		flex: 1;
		min-width: 0;
	}
	.rowtop {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.rowmeta {
		font-size: 0.85rem;
		margin-top: 0.2rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.play {
		display: flex;
		align-items: center;
		color: var(--text-dim);
		flex-shrink: 0;
	}
	@media (max-width: 720px) {
		.vscroll {
			height: 70vh;
		}
		.row {
			gap: 0.7rem;
		}
		.rowmeta {
			white-space: normal;
			font-size: 0.8rem;
		}
	}
</style>
