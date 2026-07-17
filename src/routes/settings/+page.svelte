<script lang="ts">
	import Database from '@lucide/svelte/icons/database';
	import Download from '@lucide/svelte/icons/download';
	import Globe from '@lucide/svelte/icons/globe';
	import { toast } from 'svelte-sonner';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { TIMEZONE_OPTIONS } from '$lib/timezoneOptions';

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	let selectedTz = $state('');
	let serverTimezone = $state<string | null>(null);
	let savingTz = $state(false);

	$effect(() => {
		const next = data.homeTimezone ?? '';
		if (next !== serverTimezone) {
			serverTimezone = next;
			selectedTz = next;
		}
	});

	async function saveTimezone(event: Event) {
		if (savingTz) return;
		savingTz = true;
		const previous = selectedTz;
		const next = (event.currentTarget as HTMLSelectElement).value.trim();
		selectedTz = next;
		try {
			const response = await fetch('/api/settings/timezone', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ timezone: next || null })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			toast.success(t('settings.timezoneSaved'));
		} catch (error) {
			selectedTz = previous;
			toast.error(t('common.tryAgain'), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			savingTz = false;
		}
	}
</script>

<svelte:head><title>{t('settings.title')} · rowplay</title></svelte:head>

<section class="wrap container">
	<div>
		<p class="eyebrow">{t('settings.eyebrow')}</p>
		<h1>{t('settings.title')}</h1>
	</div>

	<article class="card card-border bg-base-100 shadow-md p-5">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head"><Database size={18} /> {t('settings.dataTitle')}</h2>
			<p class="muted">{t('settings.dataNote')}</p>
			<ul class="facts muted">
				<li>{t('settings.factWorkouts', { n: data.workoutCount })}</li>
				{#if data.demo}
					<li data-testid="settings-demo-fact">{t('settings.factDemo')}</li>
				{:else}
					<li>{t('settings.factCache')}</li>
					<li>{t('settings.factSession')}</li>
				{/if}
			</ul>
		</div>
	</article>

	{#if !data.demo}
		<article class="card card-border bg-base-100 shadow-md p-5">
			<div class="card-body p-0 gap-3">
				<h2 class="section-head"><Globe size={18} /> {t('settings.timezoneTitle')}</h2>
				<p class="muted">{t('settings.timezoneNote')}</p>
				<label class="tz-label" for="tz-select">{t('settings.timezoneLabel')}</label>
				<select
					id="tz-select"
					name="timezone"
					class="select select-bordered w-full max-w-md"
					value={selectedTz}
					disabled={savingTz}
					onchange={saveTimezone}
				>
					<option value="">{t('settings.timezoneUtcDefault')}</option>
					{#each TIMEZONE_OPTIONS as group (group.group)}
						<optgroup label={t(group.group)}>
							{#each group.options as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</div>
		</article>
	{/if}

	<article class="card card-border bg-base-100 shadow-md p-5">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head"><Download size={18} /> {t('settings.exportTitle')}</h2>
			<p class="muted">{t('settings.exportNote')}</p>
			<div class="row">
				<a class="btn btn-primary btn-sm" href="/api/export?format=csv" download>{t('settings.exportCsv')}</a>
				<a class="btn btn-neutral btn-sm" href="/api/export?format=json" download>{t('settings.exportJson')}</a>
			</div>
			{#if data.tcxWorkouts.length}
				<p class="muted small">{t('settings.exportTcxNote')}</p>
				<ul class="tcx-list">
					{#each data.tcxWorkouts as workout (workout.id)}
						<li>
							<a href="/api/export/{workout.id}?format=tcx" download>{t('settings.exportTcx', { id: workout.id })}</a>
							<span class="muted">{workout.date}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small">{t('settings.noTcxAvailable')}</p>
			{/if}
		</div>
	</article>
</section>

<style>
	.wrap { display: grid; gap: 1.25rem; max-width: 44rem; margin-inline: auto; padding-block: 2rem 3rem; }
	.eyebrow { color: var(--ink-2); font-family: var(--mono); font-size: 0.78rem; letter-spacing: 0.08em; margin: 0; text-transform: uppercase; }
	h1 { font-family: var(--display); margin: 0; }
	.section-head { align-items: center; display: flex; font-size: 0.78rem; font-weight: var(--fw-bold); gap: var(--space-sm); letter-spacing: 0.08em; margin: 0; text-transform: uppercase; }
	.facts { font-size: 0.88rem; margin: 0; padding-left: 1.2rem; }
	.row { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
	.small, .tz-label { font-size: 0.85rem; margin: 0; }
	.tcx-list { display: grid; font-size: 0.88rem; gap: var(--space-xs); list-style: none; margin: 0; max-height: 12rem; overflow-y: auto; padding: 0; }
	.tcx-list li { display: flex; gap: var(--space-md); justify-content: space-between; }
</style>
