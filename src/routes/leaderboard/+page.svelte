<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Play from '@lucide/svelte/icons/play';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ChipButton from '$components/ChipButton.svelte';
	import ChipGroup from '$components/ChipGroup.svelte';
	import SportIcon from '$components/SportIcon.svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import { findBoard, SPORT_ORDER, STANDARD_DISTANCES, type Board, type RankedEntry } from '$lib/leaderboard';
	import type { Sport } from '$lib/types';

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	const boards = $derived(data.boards as Board[]);

	// Always offer the full set of boards so the selectors stay populated and
	// browsable even when a board (or the whole table) is empty.
	const sports: Sport[] = SPORT_ORDER;
	const distances: number[] = [...STANDARD_DISTANCES];

	// Resolve the selected sport from the URL, falling back to the first sport.
	const selectedSport = $derived.by<Sport>(() => {
		const q = page.url.searchParams.get('sport') as Sport | null;
		if (q && sports.includes(q)) return q;
		return sports[0];
	});

	const selectedDistance = $derived.by<number>(() => {
		const q = Number(page.url.searchParams.get('distance'));
		if (Number.isFinite(q) && distances.includes(q)) return q;
		return 2000;
	});

	const board = $derived(findBoard(boards, selectedSport, selectedDistance));
	const entries = $derived(board?.entries ?? []);
	// The viewer's own row on this board anchors the "race a rival" replay link.
	const youEntry = $derived(entries.find((e) => e.isYou) ?? null);

	function selectSport(sport: Sport) {
		const first = boards.find((b) => b.sport === sport)?.distance ?? selectedDistance;
		goto(`/leaderboard?sport=${sport}&distance=${first}`, { keepFocus: true, noScroll: true });
	}

	function selectDistance(distance: number) {
		goto(`/leaderboard?sport=${selectedSport}&distance=${distance}`, {
			keepFocus: true,
			noScroll: true
		});
	}

	/** Replay link that pre-arms this rival as a constant-pace ghost. */
	function raceLink(rival: RankedEntry): string | null {
		if (!youEntry || rival.isYou) return null;
		const params = new URLSearchParams({
			ghostPace: String(rival.pace),
			ghostName: rival.displayName
		});
		return `/replay/${youEntry.workoutId}?${params.toString()}`;
	}

	function gapLabel(e: RankedEntry): string {
		return e.gapSeconds <= 0 ? '—' : `+${e.gapSeconds.toFixed(1)}s`;
	}
</script>

<svelte:head>
	<title>{t('leaderboard.title')} · rowplay</title>
</svelte:head>

<div class="container">
	<div class="head">
		<h1><Trophy size={26} /> {t('leaderboard.title')}</h1>
		<p class="lead muted">{t('leaderboard.lead')}</p>
	</div>

	<div class="card bg-base-100 border border-base-300 shadow-md p-5 selector">
		<div class="selrow">
			<span class="lbl">{t('leaderboard.sport')}</span>
			<div class="seg">
				{#each sports as s (s)}
					<button
						type="button"
						class="segbtn"
						class:on={s === selectedSport}
						onclick={() => selectSport(s)}
					>
						<SportIcon sport={s} size={15} /> {SPORT_LABEL[s]}
					</button>
				{/each}
			</div>
		</div>
		<div class="selrow">
			<span class="lbl">{t('leaderboard.distance')}</span>
			<div class="chips">
				{#each distances as d (d)}
					<button
						type="button"
						class="chip"
						class:on={d === selectedDistance}
						onclick={() => selectDistance(d)}
					>
						{fmtDistance(d)}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if entries.length}
		<div class="card bg-base-100 border border-base-300 shadow-md p-5 boardcard">
			<div class="boardhead">
				<SportIcon sport={selectedSport} size={18} />
				<span class="boardname">{SPORT_LABEL[selectedSport]} · {fmtDistance(selectedDistance)}</span>
				<span class="count muted">{t('leaderboard.athletes', { n: entries.length })}</span>
			</div>
			<div class="tablewrap">
				<table class="board">
					<thead>
						<tr>
							<th class="rank">{t('leaderboard.rank')}</th>
							<th>{t('leaderboard.athlete')}</th>
							<th class="num">{t('leaderboard.time')}</th>
							<th class="num">{t('leaderboard.pace')}</th>
							<th class="num">{t('leaderboard.gap')}</th>
							<th class="act">{t('leaderboard.actions')}</th>
						</tr>
					</thead>
					<tbody>
						{#each entries as e (`${e.workoutId}:${e.displayName}`)}
							{@const race = raceLink(e)}
							<tr class:you={e.isYou}>
								<td class="rank">{e.rank}</td>
								<td class="name">
									<span class="handle">{e.displayName}</span>
									{#if e.isYou}<span class="youbadge">{t('leaderboard.you')}</span>{/if}
								</td>
								<td class="num strong">{fmtTime(e.time)}</td>
								<td class="num">{fmtPace(e.pace)}</td>
								<td class="num gap">{gapLabel(e)}</td>
								<td class="act">
									{#if e.shareToken}
										<a class="rowbtn" href={`/r/${e.shareToken}`}>
											<ExternalLink size={14} /> {t('leaderboard.open')}
										</a>
									{/if}
									{#if race}
										<a class="rowbtn race" href={race}>
											<Play size={14} /> {t('leaderboard.race')}
										</a>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if youEntry}
				<p class="hint muted">{t('leaderboard.raceHint')}</p>
			{/if}
		</div>
	{:else}
		<div class="card bg-base-100 border border-base-300 shadow-md p-5 empty">
			<p>{t('leaderboard.empty')}</p>
		</div>
	{/if}
</div>

<style>
	.head {
		margin: 1rem 0 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: var(--bd-heavy);
	}
	.head h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: clamp(1.5rem, 6vw, 2.1rem);
		font-weight: 900;
		text-transform: uppercase;
	}
	.lead {
		margin-top: 0.35rem;
		max-width: 42rem;
	}
	.selector {
		padding: 0.9rem 1.1rem;
		margin-bottom: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.selrow {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.55rem;
	}
	.lbl {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-2);
		min-width: 5.5rem;
	}
	.seg {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.segbtn,
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--paper-inset);
		border: var(--bd-heavy);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.32rem 0.75rem;
		font-family: var(--display);
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		cursor: pointer;
	}
	.chips {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.segbtn.on,
	.chip.on {
		background: var(--ink);
		color: var(--paper-raised);
		border-color: var(--ink);
	}
	.boardcard {
		padding: 0.5rem 0 0.75rem;
	}
	.boardhead {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1rem 0.75rem;
		border-bottom: var(--bd-heavy);
	}
	.boardname {
		font-family: var(--display);
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}
	.count {
		margin-left: auto;
		font-size: 0.78rem;
	}
	.tablewrap {
		overflow-x: auto;
	}
	table.board {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	table.board th {
		text-align: left;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-2);
		padding: 0.55rem 0.85rem;
		border-bottom: var(--bd);
	}
	table.board td {
		padding: 0.55rem 0.85rem;
		border-bottom: var(--bd);
		vertical-align: middle;
	}
	th.num,
	td.num {
		text-align: right;
		font-family: var(--mono);
	}
	td.strong {
		font-weight: 700;
	}
	.rank {
		width: 3rem;
		font-family: var(--mono);
		font-weight: 700;
	}
	td.gap {
		color: var(--ink-2);
	}
	tr.you {
		background: var(--paper-inset);
	}
	.name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.handle {
		font-weight: 600;
	}
	.youbadge {
		font-size: 0.62rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--ink);
		color: var(--paper-raised);
		padding: 0.1rem 0.4rem;
		border-radius: var(--r-ctrl);
	}
	td.act,
	th.act {
		text-align: right;
		white-space: nowrap;
	}
	.rowbtn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.74rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.25rem 0.55rem;
		border: var(--bd);
		border-radius: var(--r-ctrl);
		color: var(--ink);
		margin-left: 0.35rem;
	}
	.rowbtn.race {
		background: var(--ink);
		color: var(--paper-raised);
		border-color: var(--ink);
	}
	.hint {
		font-size: 0.78rem;
		padding: 0.7rem 1rem 0.2rem;
	}
	.empty {
		padding: 2rem 1rem;
		text-align: center;
		color: var(--ink-2);
	}
	@media (max-width: 640px) {
		.lbl {
			min-width: 0;
			width: 100%;
		}
	}
</style>
