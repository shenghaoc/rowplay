<script lang="ts">
	import { base } from '$app/paths';
	import { parseGuideMarkdown, type InlineNode } from '$lib/docs';

	let { markdown, label }: { markdown: string; label: string } = $props();

	const guide = $derived(parseGuideMarkdown(markdown || ''));

	function isExternalHref(href: string) {
		return /^https?:\/\//.test(href);
	}

	function renderUnsupportedInlineNode(_node: never) {
		return '';
	}
</script>

{#snippet inline(nodes: InlineNode[])}
	{#each nodes as node (node.id)}
		{#if node.type === 'text'}
			{node.text}
		{:else if node.type === 'code'}
			<code>{node.text}</code>
		{:else if node.type === 'strong'}
			<strong>{@render inline(node.children)}</strong>
		{:else if node.type === 'link'}
			{#if isExternalHref(node.href)}
				<a href={node.href} target="_blank" rel="external noopener noreferrer">
					{@render inline(node.children)}
				</a>
		{:else}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="{base}{node.href}">
				{@render inline(node.children)}
			</a>
		{/if}
		{:else}
			{renderUnsupportedInlineNode(node)}
		{/if}
	{/each}
{/snippet}

<article class="docs-article" aria-label={label}>
	{#each guide.blocks as block (block.id)}
		{#if block.type === 'heading'}
			{#if block.depth === 1}
				<h1 id={block.slug}>{@render inline(block.children)}</h1>
			{:else if block.depth === 2}
				<h2 id={block.slug}>{@render inline(block.children)}</h2>
			{:else}
				<h3 id={block.slug}>{@render inline(block.children)}</h3>
			{/if}
		{:else if block.type === 'paragraph'}
			<p>{@render inline(block.children)}</p>
		{:else if block.type === 'quote'}
			<blockquote>{@render inline(block.children)}</blockquote>
		{:else if block.type === 'list'}
			{#if block.ordered}
				<ol>
					{#each block.items as item (item.id)}
						<li>{@render inline(item.children)}</li>
					{/each}
				</ol>
			{:else}
				<ul>
					{#each block.items as item (item.id)}
						<li>{@render inline(item.children)}</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<pre data-language={block.language || undefined}><code>{block.code}</code></pre>
		{/if}
	{/each}
</article>

<style>
	.docs-article {
		max-width: 78ch;
	}
	.docs-article :global(a) {
		color: var(--live);
		font-weight: 700;
	}
	.docs-article :global(a:hover) {
		color: var(--ink);
	}
	.docs-article h1 {
		margin: 0 0 1rem;
		font-size: clamp(2rem, 6vw, 2.75rem);
		line-height: 1.05;
		font-weight: 900;
		text-transform: uppercase;
	}
	.docs-article h2 {
		margin: 2.4rem 0 0.7rem;
		padding-top: 0.3rem;
		border-top: var(--bd-heavy);
		font-size: 1.25rem;
		line-height: 1.2;
		font-weight: 850;
		text-transform: uppercase;
	}
	.docs-article h3 {
		margin: 1.5rem 0 0.5rem;
		font-size: 1.05rem;
		font-weight: 800;
	}
	.docs-article p,
	.docs-article li,
	.docs-article blockquote {
		color: var(--ink-2);
		font-size: 1rem;
		line-height: 1.7;
	}
	.docs-article p {
		margin: 0.75rem 0;
	}
	.docs-article ul,
	.docs-article ol {
		margin: 0.75rem 0 1rem;
		padding-left: 1.35rem;
	}
	.docs-article li + li {
		margin-top: 0.35rem;
	}
	.docs-article blockquote {
		margin: 1rem 0;
		padding: 0.7rem 0 0.7rem 1rem;
		border-left: 4px solid var(--live);
		background: var(--paper-inset);
	}
	.docs-article code {
		border: var(--bd);
		border-radius: var(--r-ctrl);
		padding: 0.1rem 0.28rem;
		background: var(--paper-inset);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.9em;
	}
	.docs-article pre {
		margin: 1rem 0;
		overflow-x: auto;
		border: var(--bd-heavy);
		border-radius: var(--r-card);
		padding: 1rem;
		background: var(--paper-inset);
		box-shadow: var(--stamp);
	}
	.docs-article pre code {
		border: 0;
		padding: 0;
		background: transparent;
		font-size: 0.9rem;
		line-height: 1.55;
	}
	@media (max-width: 640px) {
		.docs-article h1 {
			font-size: 2rem;
		}
	}
</style>
