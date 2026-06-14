<script lang="ts">
	import { fmtPace, fmtTime } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { themeFor } from '$lib/replay/sports';
	import type { Sport } from '$lib/types';
	import type { WorkoutMoment, WorkoutMomentReport } from '$lib/workoutMoments';

	let { report, sport, onseek }: { report: WorkoutMomentReport; sport: Sport; onseek: (seconds: number) => void } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const cadenceUnit = $derived(themeFor(sport).cadenceUnit);

	function title(moment: WorkoutMoment): string {
		return t(`replay.moments.${moment.kind}`);
	}
</script>

{#if report.moments.length}
	<section class="card card-border bg-base-100 shadow-md p-5 workout-moments" aria-labelledby="workout-moments-title">
		<div class="moments-head">
			<div>
				<div id="workout-moments-title" class="ctitle muted">{t('replay.moments.title')}</div>
				<p class="muted small">{t('replay.moments.subtitle')}</p>
			</div>
			{#if report.lowResolution}
				<span class="badge badge-soft badge-warning">{t('replay.moments.lowResolution')}</span>
			{/if}
		</div>
		<div class="moment-grid">
			{#each report.moments as moment (moment.id)}
				<article class="moment-card">
					<div class="moment-kicker">{title(moment)}</div>
					<div class="moment-main mono">{fmtTime(moment.startTime, true)}–{fmtTime(moment.endTime, true)} · {fmtPace(moment.avgPace)}</div>
					<div class="moment-meta muted small">
						<span>{Math.round(moment.avgWatts)}w</span>
						<span>{Math.round(moment.avgSpm)} {cadenceUnit}</span>
						{#if moment.avgHr}<span>{Math.round(moment.avgHr)} {t('replay.moments.bpm')}</span>{/if}
					</div>
					<p class="moment-reason muted small">{t(moment.reasonKey, moment.reasonParams)}</p>
					<button type="button" class="btn btn-ghost btn-xs" onclick={() => onseek(moment.startTime)}>
						{t('replay.moments.jump')}
					</button>
				</article>
			{/each}
		</div>
	</section>
{/if}

<style>
	.workout-moments { margin: 1rem 0; }
	.moments-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 0.75rem; }
	.moments-head p { margin: 0.15rem 0 0; }
	.moment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
	.moment-card { border: 1px solid color-mix(in srgb, var(--color-base-content) 12%, transparent); border-radius: 1rem; padding: 0.9rem; background: color-mix(in srgb, var(--color-base-200) 62%, transparent); }
	.moment-kicker { font-weight: 700; margin-bottom: 0.25rem; }
	.moment-main { font-size: 0.92rem; }
	.moment-meta { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.35rem; }
	.moment-reason { margin: 0.55rem 0 0.75rem; }
</style>
