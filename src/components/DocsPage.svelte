<script lang="ts">
	import DocsArticle from '$components/DocsArticle.svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	import type { DocsSectionKey } from '$lib/docs';

	let { section }: { section: DocsSectionKey } = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const sectionTitle = $derived(t(`docs.sections.${section}.navTitle`) || t('docs.title'));
	const pageTitle = $derived(
		section === 'overview'
			? `${t('docs.title')} · rowplay`
			: `${sectionTitle} · ${t('docs.title')} · rowplay`
	);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={t('docs.description')} />
</svelte:head>

<DocsArticle markdown={t(`docs.sections.${section}.markdown`)} label={sectionTitle} />
