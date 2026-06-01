<script lang="ts">
	import { Languages } from '@lucide/svelte';
	import { LANGUAGES, type Language } from '$lib/i18n';
	import { getI18nContext } from '$lib/i18n.svelte';

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
</script>

<label class="lang-picker" title={t('lang.switch')}>
	<Languages size={16} aria-hidden="true" />
	<select
		value={i18n.lang}
		onchange={(e) => i18n.setLanguage((e.currentTarget as HTMLSelectElement).value as Language)}
		aria-label={t('lang.switch')}
	>
		{#each LANGUAGES as { value, label }}
			<option {value}>{label}</option>
		{/each}
	</select>
</label>

<style>
	.lang-picker {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		align-self: center;
		background: var(--paper-raised);
		border: var(--bd);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		font-family: var(--mono);
		cursor: pointer;
	}
	.lang-picker:hover {
		color: var(--ink);
		border-color: var(--ink);
	}
	select {
		appearance: none;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0;
		max-width: 6.5rem;
	}
	select:focus-visible {
		outline: 2px solid var(--live);
		outline-offset: 2px;
	}
</style>
