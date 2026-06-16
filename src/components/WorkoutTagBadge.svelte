<script lang="ts">
	import {
		resolveTag,
		tagBadgeClass,
		WORKOUT_TAGS,
		type TaggableWorkout,
		type WorkoutTag
	} from '$lib/workoutTag';
	import type { Workout } from '$lib/types';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { toast } from 'svelte-sonner';

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	interface Props {
		workout: TaggableWorkout;
		medianPaceSecs?: number;
		/** Called after a successful save so parents can sync list state. */
		onTagSaved?: (workoutId: number, userTag: WorkoutTag | null) => void;
	}

	let { workout, medianPaceSecs, onTagSaved }: Props = $props();

	let editing = $state(false);
	let saving = $state(false);
	let selectEl = $state<HTMLSelectElement | null>(null);
	let overrideForId = $state<number | null>(null);
	let localUserTag = $state<string | null>(null);

	const effectiveTag = $derived(
		overrideForId === workout.id ? localUserTag : (workout.userTag ?? null)
	);

	const effective = $derived(
		resolveTag({ ...workout, userTag: effectiveTag }, { medianPaceSecs })
	);

	const badgeClass = $derived(`badge badge-sm badge-soft ${tagBadgeClass(effective)}`);

	$effect(() => {
		if (editing) selectEl?.focus();
	});

	function tagLabel(tag: WorkoutTag): string {
		return t(`workout.tag.${tag}`);
	}

	async function saveTag(tag: WorkoutTag | null) {
		const prev = localUserTag;
		overrideForId = workout.id;
		localUserTag = tag;
		editing = false;
		saving = true;
		try {
			const res = await fetch(`/api/workouts/${workout.id}/tag`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tag })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { tag: WorkoutTag | null };
			localUserTag = body.tag;
			onTagSaved?.(workout.id, body.tag);
		} catch {
			localUserTag = prev;
			toast.error(t('workout.tag.saveError'));
		} finally {
			saving = false;
		}
	}

	function onSelectChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		void saveTag(value === '' ? null : (value as WorkoutTag));
	}
</script>

{#if editing}
	<select
		bind:this={selectEl}
		class="select select-bordered select-xs w-full max-w-40"
		disabled={saving}
		value={effectiveTag ?? ''}
		aria-label={t('workout.tag.label')}
		onchange={onSelectChange}
		onblur={() => (editing = false)}
	>
		<option value="">{t('workout.tag.auto')}</option>
		{#each WORKOUT_TAGS as tag}
			<option value={tag}>{tagLabel(tag)}</option>
		{/each}
	</select>
{:else}
	<button
		type="button"
		class={badgeClass}
		disabled={saving}
		aria-busy={saving}
		title={t('workout.tag.label')}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			editing = true;
		}}
	>
		{#if saving}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
		{tagLabel(effective)}
	</button>
{/if}
