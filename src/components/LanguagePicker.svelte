<script lang="ts">
	import Languages from '@lucide/svelte/icons/languages';
	import { LANGUAGES, type Language } from '$lib/i18n';
	import { getI18nContext } from '$lib/i18n.svelte';

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
</script>

<label class="lang-picker" title={t('lang.switch')}>
	<Languages size={16} aria-hidden="true" />
	<select
		class="lang-select"
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
		gap: 0.25rem;
		align-self: center;
		color: var(--ink-2);
		cursor: pointer;
	}
	.lang-picker:hover {
		color: var(--ink);
	}
	.lang-select {
		appearance: none;
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0 1.1rem 0 0;
		max-width: 7rem;
	}
	.lang-select:focus-visible {
		outline: 2px solid var(--live);
		outline-offset: 2px;
		border-radius: 4px;
	}
</style>
