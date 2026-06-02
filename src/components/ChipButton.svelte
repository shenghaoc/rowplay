<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		active?: boolean;
		ariaPressed?: boolean;
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let { active = false, ariaPressed, disabled = false, onclick, children }: Props = $props();
</script>

<button
	type="button"
	class="btn btn-sm join-item"
	class:btn-active={active}
	class:btn-neutral={active}
	aria-pressed={ariaPressed ?? active}
	{disabled}
	{onclick}
>
	{@render children()}
</button>
