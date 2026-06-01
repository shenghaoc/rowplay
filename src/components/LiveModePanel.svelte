<script lang="ts">
	import { Radio, AlertTriangle, LoaderCircle } from '@lucide/svelte';
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

	// Formats a wall-clock timestamp (ms epoch) to HH:MM:SS — distinct from
	// $lib/format's fmtTime, which formats elapsed workout seconds.
	function fmtWallTime(ts: number | null): string {
		if (ts == null) return '—';
		return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
</script>

<div class="card live-panel">
	<div class="live-head">
		<div class="live-title">
			<span class="icon" class:spin={live.polling}><Radio size={16} /></span>
			<span>{t('liveMode.title')}</span>
			{#if live.hasWarning}
				<span class="warn" title={t('liveMode.warning', { count: live.failures })}><AlertTriangle size={14} /></span>
			{/if}
		</div>
		<label class="toggle">
			<input
				type="checkbox"
				checked={live.enabled}
				onchange={(e) => live.setEnabled(e.currentTarget.checked)}
			/>
			<span>{t('liveMode.enabled')}</span>
		</label>
	</div>

	{#if live.enabled}
		<p class="muted hint">{t('liveMode.enabledHint')}</p>
		<div class="interval-row">
			<span class="muted label">{t('liveMode.interval')}</span>
			<div class="chips" role="group" aria-label={t('liveMode.interval')}>
				{#each LIVE_INTERVALS as sec}
					<button
						type="button"
						class="chip"
						class:on={live.intervalSec === sec}
						aria-pressed={live.intervalSec === sec}
						onclick={() => live.setInterval(sec)}
					>{intervalLabel(sec)}</button>
				{/each}
			</div>
		</div>
		<label class="toggle sound">
			<input
				type="checkbox"
				checked={live.soundEnabled}
				onchange={(e) => live.setSound(e.currentTarget.checked)}
			/>
			<span>{t('liveMode.sound')}</span>
		</label>
		<p class="muted hint">{t('liveMode.soundHint')}</p>
		<div class="status muted">
			{#if live.polling}
				<span class="polling"><LoaderCircle size={12} class="spin" /> {t('liveMode.polling')}</span>
			{:else}
				<span>{t('liveMode.lastPoll', { time: fmtWallTime(live.lastPollAt) })}</span>
				<span> · </span>
				<span>{t('liveMode.nextPoll', { time: fmtWallTime(live.nextPollAt) })}</span>
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
	.live-title :global(.spin) {
		animation: spin 1.2s linear infinite;
		color: var(--live);
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
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.hint {
		font-size: 0.78rem;
		margin: 0.35rem 0 0.5rem;
	}
	.interval-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin: 0.5rem 0;
	}
	.label {
		font-size: 0.78rem;
	}
	.chips {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.chip {
		background: var(--paper-raised);
		border: var(--bd-heavy);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.25rem 0.6rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.chip.on {
		background: var(--ink);
		color: var(--paper-raised);
		border-color: var(--ink);
	}
	.sound {
		margin-top: 0.35rem;
	}
	.status {
		font-size: 0.78rem;
		margin-top: 0.5rem;
	}
	.polling {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--live);
	}
	.polling :global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
