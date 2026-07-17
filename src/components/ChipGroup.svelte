<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Visible group label (uppercase styling via `.chiplabel`). */
		label?: string;
		ariaLabel: string;
		children: Snippet;
	}

	let { label, ariaLabel, children }: Props = $props();
</script>

<div class="chip-group">
	{#if label}
		<span class="chiplabel muted">{label}</span>
	{/if}
	<div class="join join-horizontal flex-wrap" role="group" aria-label={ariaLabel}>
		{@render children()}
	</div>
</div>

<style>
	.chip-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs);
		margin-top: 0.65rem;
	}
	.chiplabel {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-right: 0.25rem;
	}
	.chip-group :global(.join) {
		gap: 0;
	}
</style>
