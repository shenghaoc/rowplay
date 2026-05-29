<script lang="ts">
	import { Sailboat, Snowflake, Bike } from '@lucide/svelte';
	import type { Sport } from '$lib/types';

	interface Props {
		sport: Sport;
		size?: number;
	}
	let { sport, size = 18 }: Props = $props();

	const Icon = $derived(sport === 'rower' ? Sailboat : sport === 'skierg' ? Snowflake : Bike);
</script>

<Icon {size} />
