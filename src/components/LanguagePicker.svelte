<script lang="ts">
	import Languages from '@lucide/svelte/icons/languages';
	import { LANGUAGES, type Language } from '$lib/i18n';
	import { getI18nContext } from '$lib/i18n.svelte';

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
</script>

<label class="lang-picker" title={t('lang.switch')}>
	<Languages size={16} aria-hidden="true" class="icon" />
	<select
		class="select select-ghost select-xs"
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
		gap: 0.2rem;
		align-self: center;
		color: var(--ink-2);
	}
	.lang-picker :global(.icon) {
		flex-shrink: 0;
	}
</style>
