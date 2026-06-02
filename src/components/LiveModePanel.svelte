<script lang="ts">
	import Radio from '@lucide/svelte/icons/radio';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
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

<div class="du-card live-panel">
	<div class="live-head">
		<div class="live-title">
			<span class="icon" class:spin={live.polling}><Radio size={16} /></span>
			<span>{t('liveMode.title')}</span>
			{#if live.hasWarning}
				<span class="warn" title={t('liveMode.warning', { count: live.failures })}><AlertTriangle size={14} /></span>
			{/if}
		</div>
		<label class="du-label cursor-pointer justify-end gap-2">
			<span>{t('liveMode.enabled')}</span>
			<input
				type="checkbox"
				class="du-toggle du-toggle-primary"
				checked={live.enabled}
				onchange={(e) => live.setEnabled(e.currentTarget.checked)}
			/>
		</label>
	</div>

	{#if live.enabled}
		<p class="muted hint">{t('liveMode.enabledHint')}</p>
		<div class="interval-row">
			<span class="muted field-label">{t('liveMode.interval')}</span>
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
		<label class="du-label cursor-pointer justify-end gap-2 sound">
			<span>{t('liveMode.sound')}</span>
			<input
				type="checkbox"
				class="du-toggle du-toggle-primary"
				checked={live.soundEnabled}
				onchange={(e) => live.setSound(e.currentTarget.checked)}
			/>
		</label>
		<p class="muted hint">{t('liveMode.soundHint')}</p>
		<div class="poll-status" role="status" aria-live="polite">
			{#if live.polling}
				<div class="status-row polling">
					<LoaderCircle size={12} class="spin" aria-hidden="true" />
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
	.live-head :global(.du-label) {
		font-size: 0.85rem;
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
	.field-label {
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
	.status-row.polling :global(.spin) {
		animation: spin 1s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
