<script lang="ts">
	import Sailboat from '@lucide/svelte/icons/sailboat';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Bike from '@lucide/svelte/icons/bike';
	import type { Sport } from '$lib/types';

	interface Props {
		sport: Sport;
		size?: number;
	}
	let { sport, size = 18 }: Props = $props();

	const Icon = $derived(sport === 'rower' ? Sailboat : sport === 'skierg' ? Snowflake : Bike);
</script>

<Icon {size} />
