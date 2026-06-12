<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Play from '@lucide/svelte/icons/play';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import SportIcon from '$components/SportIcon.svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import { findBoard, SPORT_ORDER, STANDARD_DISTANCES, type Board, type RankedEntry } from '$lib/leaderboard';
	import { buildRaceDeepLink } from '$lib/replay/rivalGhost';
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

	let withdrawingId = $state<number | null>(null);

	/** Withdraw the viewer's own entry from the board (reversible opt-out). */
	async function withdraw(e: RankedEntry) {
		withdrawingId = e.workoutId;
		try {
			const res = await fetch('/api/leaderboard/publish', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workoutId: e.workoutId })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			toast.success(t('leaderboard.withdrawOk'));
			await invalidateAll();
		} catch (err) {
			toast.error(t('leaderboard.withdrawFailed'), {
				description: err instanceof Error ? err.message : t('common.tryAgain')
			});
		} finally {
			withdrawingId = null;
		}
	}

	/** Replay link that pre-arms this rival (stroke trace when shared, else pace ghost). */
	function raceLink(rival: RankedEntry): string | null {
		if (!youEntry || rival.isYou) return null;
		return buildRaceDeepLink(youEntry.workoutId, {
			pace: rival.pace,
			displayName: rival.displayName,
			shareToken: rival.shareToken
		});
	}

	function gapLabel(e: RankedEntry): string {
		return e.gapSeconds <= 0 ? '—' : `+${e.gapSeconds.toFixed(1)}s`;
	}
</script>

<svelte:head>
	<title>{t('leaderboard.title')} · rowplay</title>
</svelte:head>

<div class="container">
	<div class="boardpage-head">
		<h1>
			<Trophy size={26} style="color: var(--behind)" />
			{t('leaderboard.title')}
		</h1>
		<p class="lead muted">{t('leaderboard.lead')}</p>
	</div>

	<div class="card card-border bg-base-100 shadow-md p-5 selector">
		<div class="selrow">
			<span class="lbl">{t('leaderboard.sport')}</span>
			<div class="flex flex-wrap gap-1">
				{#each sports as s (s)}
					<button
						type="button"
						class="btn btn-sm"
						class:btn-active={s === selectedSport}
						class:btn-neutral={s === selectedSport}
						class:btn-outline={s !== selectedSport}
						aria-current={s === selectedSport ? 'true' : undefined}
						onclick={() => selectSport(s)}
					>
						<SportIcon sport={s} size={15} /> {SPORT_LABEL[s]}
					</button>
				{/each}
			</div>
		</div>
		<div class="selrow">
			<span class="lbl">{t('leaderboard.distance')}</span>
			<div class="flex flex-wrap gap-1">
				{#each distances as d (d)}
					<button
						type="button"
						class="btn btn-xs"
						class:btn-active={d === selectedDistance}
						class:btn-neutral={d === selectedDistance}
						class:btn-outline={d !== selectedDistance}
						aria-current={d === selectedDistance ? 'true' : undefined}
						onclick={() => selectDistance(d)}
					>
						{fmtDistance(d)}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if entries.length}
		<div class="card card-border bg-base-100 shadow-md p-0 boardcard">
			<div class="boardhead">
				<SportIcon sport={selectedSport} size={18} />
				<span class="boardname">{SPORT_LABEL[selectedSport]} · {fmtDistance(selectedDistance)}</span>
				<span class="count muted">{t('leaderboard.athletes', { n: entries.length })}</span>
			</div>
			<div class="overflow-x-auto">
				<table class="table table-zebra table-sm mono">
					<thead>
						<tr>
							<th class="rank-col">{t('leaderboard.rank')}</th>
							<th>{t('leaderboard.athlete')}</th>
							<th class="text-right font-mono">{t('leaderboard.time')}</th>
							<th class="text-right font-mono">{t('leaderboard.pace')}</th>
							<th class="text-right font-mono">{t('leaderboard.gap')}</th>
							<th class="text-right">{t('leaderboard.actions')}</th>
						</tr>
					</thead>
					<tbody>
						{#each entries as e (`${e.workoutId}:${e.displayName}`)}
							{@const race = raceLink(e)}
							<tr class:you={e.isYou}>
								<td class="rank-col font-mono font-bold">{e.rank}</td>
								<td>
									<span class="name-cell">
										<span class="handle">{e.displayName}</span>
										{#if e.isYou}
											<span class="badge badge-soft badge-primary badge-xs"
												>{t('leaderboard.you')}</span
											>
										{/if}
									</span>
								</td>
								<td class="text-right font-mono font-bold">{fmtTime(e.time)}</td>
								<td class="text-right font-mono">{fmtPace(e.pace)}</td>
								<td class="text-right font-mono gap-col">{gapLabel(e)}</td>
								<td class="text-right whitespace-nowrap">
									{#if e.shareToken}
										<a class="btn btn-xs btn-ghost" href={`/r/${e.shareToken}`}>
											<ExternalLink size={13} />
											{t('leaderboard.open')}
										</a>
									{/if}
									{#if race}
										<a class="btn btn-xs btn-primary ml-1" href={race}>
											<Play size={13} />
											{t('leaderboard.race')}
										</a>
									{/if}
									{#if e.isYou && !data.demo}
										<button
											class="btn btn-xs btn-ghost ml-1"
											type="button"
											disabled={withdrawingId === e.workoutId}
											onclick={() => withdraw(e)}
										>
											{withdrawingId === e.workoutId
												? t('leaderboard.withdrawing')
												: t('leaderboard.withdraw')}
										</button>
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
		<div class="card card-border bg-base-100 shadow-md p-5 empty">
			<p>
				{t('leaderboard.empty')}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="{base}/docs/workflows">{t('docs.contextual.workflows')}</a>
			</p>
		</div>
	{/if}
</div>

<style>
	.boardpage-head {
		margin: 1rem 0 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: var(--bd-heavy);
	}
	.boardpage-head h1 {
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
	.boardcard {
		overflow: hidden;
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
	.rank-col {
		width: 3rem;
	}
	.name-cell {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.handle {
		font-weight: 600;
	}
	.gap-col {
		color: var(--ink-2);
	}
	/* Highlight the viewer's own row. Scoped + unlayered, so it beats daisyUI's
	   layered `table-zebra` stripe (which sits in @layer with :where()). */
	tr.you {
		background: color-mix(in srgb, var(--live) 8%, var(--paper-raised));
	}
	.hint {
		font-size: 0.78rem;
		padding: 0.7rem 1rem 0.5rem;
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
