<script lang="ts">
	import {
		annualGoalProgress,
		athleteBadges,
		distancePBs,
		trainingStreakStats,
		type AnnualGoal,
		type AnnualGoalKind,
		type BadgeId
	} from '$lib/analytics';
	import { DEFAULT_ANNUAL_METERS } from '$lib/goals';
	import { fmtDistance, fmtTime } from '$lib/format';
	import type { Workout } from '$lib/types';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { pluralKey } from '$lib/i18nPlural';
	import { Flame, Medal, Target, Trophy } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	interface Props {
		workouts: Workout[];
		annualGoal: AnnualGoal;
		goalYear: number;
		endDay: string;
	}

	let { workouts, annualGoal: initialGoal, goalYear, endDay }: Props = $props();

	const i18n = getI18nContext();
	const t = i18n.t;

	let goal = $state<AnnualGoal>({ ...initialGoal });
	let kind = $state<AnnualGoalKind>(initialGoal.kind);
	let targetInput = $state<number | null>(
		initialGoal.kind === 'meters' ? initialGoal.target : Math.round(initialGoal.target / 3600)
	);
	let saving = $state(false);

	$effect(() => {
		goal = { ...initialGoal };
		kind = initialGoal.kind;
		targetInput =
			initialGoal.kind === 'meters' ? initialGoal.target : Math.round(initialGoal.target / 3600);
	});

	const progress = $derived(annualGoalProgress(workouts, goal, endDay));
	const streaks = $derived(trainingStreakStats(workouts, endDay));
	const badges = $derived(athleteBadges(workouts, distancePBs(workouts)));
	const earnedBadges = $derived(badges.filter((b) => b.earned));

	const currentLabel = $derived(
		goal.kind === 'meters' ? fmtDistance(progress.current) : fmtTime(progress.current, true)
	);
	const targetLabel = $derived(
		goal.kind === 'meters' ? fmtDistance(progress.target) : fmtTime(progress.target, true)
	);
	const projectedLabel = $derived(
		goal.kind === 'meters' ? fmtDistance(Math.round(progress.projected)) : fmtTime(progress.projected, true)
	);
	const neededLabel = $derived(
		goal.kind === 'meters'
			? fmtDistance(Math.max(0, Math.round(progress.target - progress.current)))
			: fmtTime(Math.max(0, progress.target - progress.current), true)
	);

	const paceLine = $derived(
		progress.onPace
			? t('dashboard.goalsOnPace', { projected: projectedLabel })
			: t('dashboard.goalsBehind', { projected: projectedLabel, needed: neededLabel })
	);

	function badgeLabel(id: BadgeId): string {
		const map: Record<BadgeId, string> = {
			meters_100k: 'dashboard.badgeMeters100k',
			meters_500k: 'dashboard.badgeMeters500k',
			meters_1m: 'dashboard.badgeMeters1m',
			meters_2m: 'dashboard.badgeMeters2m',
			meters_5m: 'dashboard.badgeMeters5m',
			club_500: 'dashboard.badgeClub500',
			club_1000: 'dashboard.badgeClub1000',
			club_2000: 'dashboard.badgeClub2000',
			club_5000: 'dashboard.badgeClub5000',
			club_10000: 'dashboard.badgeClub10000',
			every_sport_week: 'dashboard.badgeEverySportWeek'
		};
		return t(map[id]);
	}

	function streakText(n: number, keyBase: string): string {
		return t(pluralKey(i18n.lang, keyBase, n), { n });
	}

	async function saveGoal() {
		if (targetInput == null || targetInput <= 0) return;
		const target = kind === 'meters' ? Math.round(targetInput) : Math.round(targetInput * 3600);
		const next: AnnualGoal = { year: goalYear, kind, target };
		saving = true;
		try {
			const res = await fetch('/api/goals', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(next)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { goal: AnnualGoal };
			goal = body.goal;
			await invalidateAll();
			toast.success(t('dashboard.goalsSaved'));
		} catch {
			toast.error(t('dashboard.goalsSaveFailed'));
		} finally {
			saving = false;
		}
	}

	function applyPreset(meters: number) {
		kind = 'meters';
		targetInput = meters;
	}
</script>

<div class="card engagement">
	<div class="enghead">
		<div class="engtitle">
			<Target size={18} />
			<span class="label">{t('dashboard.goalsTitle')}</span>
		</div>
	</div>

	<div class="goalblock">
		<div class="muted sub">{t('dashboard.goalsYear', { year: goalYear })}</div>
		<div class="goalform">
			<div class="kindrow" role="group" aria-label={t('dashboard.goalsYear', { year: goalYear })}>
				<button type="button" class="chip" class:on={kind === 'meters'} onclick={() => (kind = 'meters')}>
					{t('dashboard.goalsKindMeters')}
				</button>
				<button type="button" class="chip" class:on={kind === 'hours'} onclick={() => (kind = 'hours')}>
					{t('dashboard.goalsKindHours')}
				</button>
			</div>
			<label class="targetrow">
				<span class="muted">{kind === 'meters' ? t('dashboard.goalsTargetMeters') : t('dashboard.goalsTargetHours')}</span>
				<input
					class="mono targetin"
					type="number"
					min="1"
					bind:value={targetInput}
					placeholder={kind === 'meters' ? String(DEFAULT_ANNUAL_METERS) : '100'}
				/>
			</label>
			<div class="presetrow">
				<button type="button" class="bchip" onclick={() => applyPreset(1_000_000)}>1M m</button>
				<button type="button" class="bchip" onclick={() => applyPreset(500_000)}>500k</button>
				<button type="button" class="bchip" onclick={() => { kind = 'hours'; targetInput = 100; }}>100h</button>
			</div>
			<button type="button" class="btn small" onclick={saveGoal} disabled={saving}>
				{saving ? t('dashboard.goalsSaving') : t('dashboard.goalsSave')}
			</button>
		</div>

		<div class="progresswrap">
			<div class="progressmeta">
				<span class="mono">{t('dashboard.goalsProgress', { current: currentLabel, target: targetLabel })}</span>
				<span class="muted">{t('dashboard.goalsPct', { pct: Math.round(progress.pct) })}</span>
			</div>
			<div class="progressbar" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
				<div class="progressfill" class:onpace={progress.onPace} style:width="{Math.min(100, progress.pct)}%"></div>
				<div class="pacepin" style:left="{Math.min(100, (progress.expected / progress.target) * 100)}%"></div>
			</div>
			<p class="paceline" class:onpace={progress.onPace}>{paceLine}</p>
		</div>
	</div>

	<div class="streakrow">
		<div class="streakstat">
			<Flame size={16} />
			{#if streaks.currentStreak > 0}
				<span>{streakText(streaks.currentStreak, 'dashboard.goalsStreakCurrent')}</span>
			{:else}
				<span class="muted">—</span>
			{/if}
		</div>
		{#if streaks.longestStreak > 0}
			<div class="streakstat muted">
				{streakText(streaks.longestStreak, 'dashboard.goalsStreakLongest')}
			</div>
		{/if}
		<div class="streakstat muted">
			{#if streaks.daysSinceLastSession === 0}
				{t('dashboard.goalsDaysSinceToday')}
			{:else if streaks.daysSinceLastSession != null}
				{streakText(streaks.daysSinceLastSession, 'dashboard.goalsDaysSince')}
			{/if}
		</div>
		<div class="streakstat muted">
			{t('dashboard.goalsWeekly', {
				active: streaks.weeklyConsistency.activeWeeks,
				total: streaks.weeklyConsistency.totalWeeks
			})}
		</div>
	</div>

	{#if earnedBadges.length}
		<div class="badges">
			<div class="muted badgehead"><Medal size={14} /> {t('dashboard.badgesTitle')}</div>
			<div class="badgelist">
				{#each earnedBadges as badge (badge.id)}
					<span class="badgepill" title={badgeLabel(badge.id)}>
						<Trophy size={12} />
						{badgeLabel(badge.id)}
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.engagement {
		margin-bottom: 1rem;
	}
	.enghead {
		margin-bottom: 0.75rem;
	}
	.engtitle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--accent);
	}
	.engtitle .label {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--text);
	}
	.sub {
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
	}
	.goalform {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: flex-end;
		margin-bottom: 0.85rem;
	}
	.kindrow {
		display: flex;
		gap: 0.35rem;
	}
	.chip,
	.bchip {
		background: var(--paper-raised);
		border: var(--bd-heavy);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.3rem 0.7rem;
		font-family: var(--display);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		cursor: pointer;
	}
	.chip.on {
		background: var(--ink);
		color: var(--paper-raised);
		border-color: var(--ink);
	}
	.bchip {
		font-size: 0.72rem;
		padding: 0.25rem 0.5rem;
	}
	.targetrow {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.75rem;
	}
	.targetin {
		width: 8rem;
		padding: 0.35rem 0.5rem;
		border: var(--bd);
		border-radius: var(--r-ctrl);
		background: var(--paper-inset);
	}
	.presetrow {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.progressmeta {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		margin-bottom: 0.35rem;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.progressbar {
		position: relative;
		height: 10px;
		background: var(--paper-inset);
		border: var(--bd);
		border-radius: 999px;
		overflow: visible;
		margin-bottom: 0.4rem;
	}
	.progressfill {
		height: 100%;
		border-radius: 999px;
		background: var(--behind);
		transition: width 0.2s ease;
	}
	.progressfill.onpace {
		background: var(--ahead);
	}
	.pacepin {
		position: absolute;
		top: -3px;
		width: 2px;
		height: 16px;
		background: var(--ink-2);
		transform: translateX(-1px);
		opacity: 0.7;
	}
	.paceline {
		font-size: 0.82rem;
		margin: 0;
		color: var(--behind);
	}
	.paceline.onpace {
		color: var(--ahead);
	}
	.streakrow {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
		padding-top: 0.75rem;
		border-top: var(--bd);
		margin-top: 0.75rem;
		font-size: 0.85rem;
	}
	.streakstat {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.badges {
		margin-top: 0.85rem;
		padding-top: 0.75rem;
		border-top: var(--bd);
	}
	.badgehead {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
	}
	.badgelist {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.badgepill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.25rem 0.55rem;
		border-radius: 999px;
		background: rgba(210, 168, 255, 0.14);
		color: #9b6bcc;
		border: 1px solid rgba(155, 107, 204, 0.35);
	}
</style>
