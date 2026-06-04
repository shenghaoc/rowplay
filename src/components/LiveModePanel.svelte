<script lang="ts">
	import Radio from '@lucide/svelte/icons/radio';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import ChipButton from '$components/ChipButton.svelte';
	import ChipGroup from '$components/ChipGroup.svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { LIVE_INTERVALS, type LiveIntervalSec, type LiveMode } from '$lib/liveMode.svelte';

	interface Props {
		live: LiveMode;
	}

	let { live }: Props = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	function intervalLabel(sec: LiveIntervalSec): string {
		return sec < 60 ? t('liveMode.intervalSec', { n: sec }) : t('liveMode.intervalMin', { n: sec / 60 });
	}

	function fmtWallTime(ts: number | null): string {
		if (ts == null) return '—';
		return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
</script>

<div class="card card-border bg-base-100 shadow-md live-panel">
	<div class="live-head">
		<div class="live-title">
			<span class="icon" class:spin={live.polling}><Radio size={16} /></span>
			<span>{t('liveMode.title')}</span>
			{#if live.hasWarning}
				<span class="warn" title={t('liveMode.warning', { count: live.failures })}><AlertTriangle size={14} /></span>
			{/if}
		</div>
		<label class="label cursor-pointer gap-2">
			<span>{t('liveMode.enabled')}</span>
			<input
				type="checkbox"
				class="toggle toggle-primary"
				checked={live.enabled}
				onchange={(e) => live.setEnabled(e.currentTarget.checked)}
			/>
		</label>
	</div>

	{#if live.enabled}
		<p class="muted hint">{t('liveMode.enabledHint')}</p>
		<ChipGroup label={t('liveMode.interval')} ariaLabel={t('liveMode.interval')}>
			{#each LIVE_INTERVALS as sec}
				<ChipButton active={live.intervalSec === sec} onclick={() => live.setInterval(sec)}>
					{intervalLabel(sec)}
				</ChipButton>
			{/each}
		</ChipGroup>
		<label class="label cursor-pointer gap-2 sound">
			<span>{t('liveMode.sound')}</span>
			<input
				type="checkbox"
				class="toggle toggle-primary"
				checked={live.soundEnabled}
				onchange={(e) => live.setSound(e.currentTarget.checked)}
			/>
		</label>
		<p class="muted hint">{t('liveMode.soundHint')}</p>
		<div class="poll-status" role="status" aria-live="polite">
			{#if live.polling}
				<div class="status-row polling">
					<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
					<span>{t('liveMode.polling')}</span>
				</div>
			{:else}
				<div class="status-row">
					<span class="status-label muted">{t('liveMode.lastPollLabel')}</span>
					<time class="status-time mono" datetime={live.lastPollAt ? new Date(live.lastPollAt).toISOString() : undefined}>
						{fmtWallTime(live.lastPollAt)}
					</time>
				</div>
				<div class="status-row">
					<span class="status-label muted">{t('liveMode.nextPollLabel')}</span>
					<time class="status-time mono" datetime={live.nextPollAt ? new Date(live.nextPollAt).toISOString() : undefined}>
						{fmtWallTime(live.nextPollAt)}
					</time>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.live-panel {
		margin-bottom: 1rem;
		padding: 0.85rem 1rem;
	}
	.live-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.live-title {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 700;
		font-size: 0.9rem;
	}
	.live-title .icon {
		display: inline-flex;
	}
	.live-title .icon.spin {
		animation: spin 1.2s linear infinite;
		color: var(--live);
	}
	.warn {
		color: var(--warn);
		display: inline-flex;
	}
	.hint {
		font-size: 0.78rem;
		margin: 0.35rem 0 0.5rem;
	}
	.sound {
		margin-top: 0.35rem;
	}
	.poll-status {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--hairline);
		font-size: 0.78rem;
	}
	.status-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}
	.status-label {
		flex: 1 1 auto;
		min-width: 0;
	}
	.status-time {
		flex: 0 0 auto;
		white-space: nowrap;
		color: var(--ink);
		font-size: 0.82rem;
	}
	.status-row.polling {
		justify-content: flex-start;
		align-items: center;
		gap: 0.4rem;
		color: var(--live);
		font-weight: 600;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
