<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { DOCS_SECTIONS, docsSectionPath, isActiveDocsSection } from '$lib/docs';

	let { children } = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
	const sourceHref = 'https://github.com/shenghaoc/rowplay/blob/main/docs/usage.md';
</script>

<section class="docs-page container">
	<div class="docs-kicker">
		<span class="badge badge-soft badge-primary">
			<BookOpen size={14} aria-hidden="true" />
			{t('docs.badge')}
		</span>
		<div class="join">
			<a class="btn btn-primary btn-sm join-item" href="{base}/dashboard">
				<LayoutDashboard size={15} aria-hidden="true" />
				{t('docs.openDashboard')}
			</a>
			<a class="btn btn-ghost btn-sm join-item" href={sourceHref} target="_blank" rel="noopener noreferrer">
				<ExternalLink size={15} aria-hidden="true" />
				{t('docs.openSource')}
			</a>
		</div>
	</div>

	<div class="docs-body">
		<nav class="docs-nav" aria-label={t('docs.navLabel')}>
			<ul class="menu menu-sm w-full p-0">
				{#each DOCS_SECTIONS as section (section.key)}
					{@const active = isActiveDocsSection(section.slug, page.url.pathname)}
					<li>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a
							href="{base}{docsSectionPath(section.slug)}"
							class:menu-active={active}
							aria-current={active ? 'page' : undefined}
						>
							{t(`docs.sections.${section.key}.navTitle`)}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="docs-content">
			{@render children()}
		</div>
	</div>
</section>

<style>
	.docs-page {
		padding-top: 2.5rem;
		padding-bottom: 3.5rem;
	}
	.docs-kicker {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.docs-kicker .badge,
	.docs-kicker .btn {
		gap: 0.45rem;
	}
	.docs-body {
		display: grid;
		grid-template-columns: 13.5rem minmax(0, 1fr);
		gap: 2rem;
		align-items: start;
	}
	.docs-nav {
		position: sticky;
		/* Masthead is sticky at 60px; keep the guide nav just below it. */
		top: 4.75rem;
	}
	.docs-nav .menu a {
		font-family: var(--display);
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.docs-nav .menu a[aria-current='page'] {
		color: var(--ink);
	}
	@media (max-width: 760px) {
		.docs-page {
			padding-top: 1.5rem;
		}
		.docs-kicker {
			align-items: flex-start;
			flex-direction: column;
		}
		.docs-kicker .join {
			width: 100%;
		}
		.docs-kicker .btn {
			flex: 1 1 0;
		}
		.docs-body {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.25rem;
		}
		.docs-nav {
			position: static;
		}
		.docs-nav .menu {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 0.25rem;
		}
	}
</style>
