<script lang="ts">
	import {
		computeMilestones,
		nextMilestones,
		showMilestonesPanel,
		type Milestone,
		type MilestonePersonalBest
	} from '$lib/milestones';
	import { fmtDate, fmtDistance, fmtTime } from '$lib/format';
	import type { Workout } from '$lib/types';
	import { getI18nContext } from '$lib/i18n.svelte';
	import Award from '@lucide/svelte/icons/award';
	import Flame from '@lucide/svelte/icons/flame';
	import Flag from '@lucide/svelte/icons/flag';
	import Medal from '@lucide/svelte/icons/medal';
	import Timer from '@lucide/svelte/icons/timer';
	import Trophy from '@lucide/svelte/icons/trophy';

	interface Props {
		workouts: Workout[];
		personalBests: MilestonePersonalBest[];
		endDay?: string;
		homeTz?: string;
	}

	let { workouts, personalBests, endDay, homeTz }: Props = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	const milestones = $derived(computeMilestones(workouts, personalBests, { endDay, homeTz }));
	const achieved = $derived(milestones.filter((m) => m.achieved));
	const upNext = $derived(nextMilestones(milestones, 1)[0]);
	const visible = $derived(showMilestonesPanel(workouts, milestones));

	function iconFor(m: Milestone) {
		if (m.id.startsWith('lifetime_distance_')) return Medal;
		if (m.id.startsWith('session_count_')) return Trophy;
		if (m.id.startsWith('streak_')) return Flame;
		if (m.id.startsWith('pb_2k_')) return Timer;
		return Award;
	}

	function progressLabel(m: Milestone): string {
		if (m.id.startsWith('pb_2k_')) {
			return m.currentValue > 0
				? `${fmtTime(m.currentValue, true)} / ${fmtTime(m.threshold, true)}`
				: `— / ${fmtTime(m.threshold, true)}`;
		}
		if (m.id.startsWith('streak_')) {
			return `${Math.round(m.currentValue)} / ${m.threshold}d`;
		}
		if (m.id.startsWith('lifetime_distance_')) {
			return `${fmtDistance(m.currentValue)} / ${fmtDistance(m.threshold)}`;
		}
		return `${Math.round(m.currentValue)} / ${m.threshold}`;
	}
</script>

{#if visible}
	<section class="milestones card card-border bg-base-100 shadow-md" aria-labelledby="milestones-title">
		<div class="card-body gap-3 p-4">
			<h2 id="milestones-title" class="milestones-title">
				<Flag size={18} aria-hidden="true" />
				{t('milestone.title')}
			</h2>
			<div class="milestones-row">
				{#each achieved as m (m.id)}
					{@const Icon = iconFor(m)}
					<article class="card card-compact milestone-card milestone-card--earned bg-base-200">
						<div class="card-body items-center text-center gap-1 p-3">
							<span class="milestone-icon" aria-hidden="true"><Icon size={20} /></span>
							<p class="milestone-label">{t(m.labelKey)}</p>
							{#if m.achievedAt}
								<p class="milestone-date muted">{fmtDate(m.achievedAt)}</p>
							{/if}
						</div>
					</article>
				{/each}
				{#if upNext}
					{@const Icon = iconFor(upNext)}
					<article class="card card-compact milestone-card milestone-card--next bg-base-200">
						<div class="card-body gap-2 p-3">
							<div class="milestone-next-head">
								<span class="milestone-icon" aria-hidden="true"><Icon size={18} /></span>
								<div>
									<p class="eyebrow muted">{t('milestone.next')}</p>
									<p class="milestone-label">{t(upNext.labelKey)}</p>
								</div>
							</div>
							<progress
								class="progress progress-primary w-full"
								value={upNext.progress * 100}
								max="100"
								aria-label={progressLabel(upNext)}
							></progress>
							<p class="milestone-progress muted mono">{progressLabel(upNext)}</p>
						</div>
					</article>
				{/if}
			</div>
		</div>
	</section>
{/if}

<style>
	.milestones {
		min-width: 0;
		overflow: hidden;
	}
	.milestones-title {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-size: 0.95rem;
		font-weight: var(--fw-bold);
		margin: 0;
	}
	.milestones-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
		gap: 0.65rem;
		max-width: 100%;
		min-width: 0;
		padding-bottom: 0.15rem;
	}
	.milestone-card {
		min-width: 0;
		max-width: none;
		border: var(--bd);
	}
	.milestone-card--earned {
		border-color: color-mix(in srgb, var(--ahead) 35%, var(--hairline));
	}
	.milestone-card--next {
		opacity: 0.88;
	}
	.milestone-icon {
		color: var(--ghost);
	}
	.milestone-label {
		font-size: 0.78rem;
		font-weight: var(--fw-semibold);
		line-height: 1.25;
		margin: 0;
	}
	.milestone-date,
	.milestone-progress {
		font-size: 0.7rem;
		margin: 0;
	}
	.milestone-next-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
	}
</style>
