<script lang="ts">
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { fmtDate, fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import SportIcon from '$components/SportIcon.svelte';
	import { base } from '$app/paths';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Workout } from '$lib/types';
	import { MACHINE_COLOR, themeFor } from '$lib/replay/sports';
	import { get } from 'svelte/store';
	import { getI18nContext } from '$lib/i18n.svelte';

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	interface Props {
		workouts: Workout[];
		/** Above this many rows, switch to windowed (virtual) rendering. */
		threshold?: number;
		/** Workout ids that hold a standard-distance PB. */
		pbIds?: Set<number>;
		/** Subset of pbIds newly earned since the last sync. */
		newPbIds?: Set<number>;
		/** Rows recently added by live mode (fade-in animation). */
		newEntryIds?: Set<number>;
	}

	let {
		workouts,
		threshold = 60,
		pbIds = new Set(),
		newPbIds = new Set(),
		newEntryIds = new Set()
	}: Props = $props();

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
		// Keep the virtualizer's count + scroll element in sync with the (filtered)
		// list. Read the instance with get() instead of $rowVirtualizer so the effect
		// does NOT subscribe to the store it then writes via setOptions — otherwise
		// each setOptions retriggers the effect (effect_update_depth_exceeded).
		const count = workouts.length;
		const el = scrollEl;
		get(rowVirtualizer).setOptions({
			count,
			getScrollElement: () => el ?? null,
			estimateSize: () => ROW,
			overscan: 8
		});
	});

	const items = $derived(virtual ? $rowVirtualizer.getVirtualItems() : []);
</script>

{#snippet row(w: Workout)}
	<a
		class="rowhit"
		href="/replay/{w.id}"
		aria-label="{t('workoutList.openReplay')}: {w.workoutType || SPORT_LABEL[w.sport]} {fmtDate(w.date)}"
	></a>
	<div class="sport" style:color={MACHINE_COLOR[w.sport]}><SportIcon sport={w.sport} size={22} /></div>
	<div class="rowmain">
		<div class="rowtop">
			<strong>{w.workoutType || SPORT_LABEL[w.sport]}</strong>
			{#if pbIds.has(w.id)}
				<span class="pbchip" class:new={newPbIds.has(w.id)}>{newPbIds.has(w.id) ? t('dashboard.pbNew') : t('dashboard.pbTag')}</span>
			{/if}
			<span class="muted">{fmtDate(w.date)}</span>
		</div>
		<div class="rowmeta mono muted">
			{fmtDistance(w.distance)} · {fmtTime(w.time, true)} · {fmtPace(w.pace)}
			{#if w.strokeRate}· {w.strokeRate} {themeFor(w.sport).cadenceUnit}{/if}
			{#if w.heartRateAvg}· {Math.round(w.heartRateAvg)} bpm{/if}
		</div>
	</div>
	<div class="actions">
		<span class="play" aria-hidden="true"><ChevronRight size={18} /></span>
	</div>
{/snippet}

{#if workouts.length === 0}
	<p class="muted">
		{t('workoutList.empty')}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="{base}/docs/getting-started">{t('docs.contextual.gettingStarted')}</a>
	</p>
{:else if virtual}
	<!-- Windowed list: a fixed-height scroller with absolutely-positioned rows. -->
	<div class="vscroll" bind:this={scrollEl}>
		<div class="vinner" style:height="{$rowVirtualizer.getTotalSize()}px">
			{#each items as item (item.key)}
				{@const w = workouts[item.index]}
				<div
					class="card card-border bg-base-100 shadow-md p-5 row vrow"
					class:new-entry={newEntryIds.has(w.id)}
					style:height="{item.size}px"
					style:transform="translateY({item.start}px)"
				>
					{@render row(w)}
				</div>
			{/each}
		</div>
	</div>
	<p class="vcount muted">{t('workoutList.windowed', { n: workouts.length })}</p>
{:else}
	<!-- Small list: plain flow layout. -->
	<div class="wlist">
		{#each workouts as w (w.id)}
			<div class="card card-border bg-base-100 shadow-md p-5 row" class:new-entry={newEntryIds.has(w.id)}>{@render row(w)}</div>
		{/each}
	</div>
{/if}

<style>
	.wlist {
		display: grid;
		gap: 0.6rem;
	}
	.vscroll {
		position: relative;
		height: 640px;
		overflow-y: auto;
		border: var(--bd-heavy);
		border-radius: var(--r-card);
		background: var(--paper-raised);
		padding: 0.4rem;
	}
	.vinner {
		position: relative;
		width: 100%;
	}
	.row {
		position: relative;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 1rem;
		color: var(--ink);
		min-height: 64px;
		padding: 0.55rem 0.95rem;
		transition: background 0.1s ease;
	}
	.row:hover {
		background: var(--paper-inset);
	}
	.rowhit {
		position: absolute;
		inset: 0;
		z-index: 1;
		border-radius: inherit;
	}
	.rowhit:focus-visible {
		outline: 2px solid var(--live);
		outline-offset: 2px;
	}
	.row.new-entry {
		@starting-style {
			opacity: 0;
			transform: translateY(-6px);
		}
		transition: opacity 0.4s ease, transform 0.4s ease;
	}
	.vrow.new-entry {
		@starting-style {
			opacity: 0;
		}
		transition: opacity 0.4s ease;
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
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		pointer-events: none;
	}
	.rowmain {
		position: relative;
		z-index: 2;
		flex: 1;
		min-width: 0;
		pointer-events: none;
	}
	.rowmain :global(button),
	.rowmain :global(select) {
		pointer-events: auto;
	}
	.rowtop {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.pbchip {
		font-size: 0.65rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.4rem;
		border-radius: var(--r-ctrl);
		background: color-mix(in srgb, var(--accent) 15%, var(--paper-raised));
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--paper-raised));
	}
	.pbchip.new {
		background: color-mix(in srgb, var(--ahead) 18%, var(--paper-raised));
		color: var(--ahead);
		border-color: color-mix(in srgb, var(--ahead) 45%, var(--paper-raised));
	}
	.rowmeta {
		font-size: 0.85rem;
		margin-top: 0.2rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.actions {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
		pointer-events: none;
	}
	.play {
		display: flex;
		align-items: center;
		color: var(--text-dim);
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
