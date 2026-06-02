<script lang="ts">
	import { enhance } from '$app/forms';
	import { getI18nContext } from '$lib/i18n.svelte';
	let { data, form } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
</script>

<svelte:head><title>Use a token · rowplay</title></svelte:head>

<section class="wrap">
	<h1>{t('token.title')}</h1>
	<p class="muted">
		{t('token.introBefore')}<a
			href="https://log.concept2.com/profile/edit"
			target="_blank"
			rel="noreferrer">{t('token.introLink')}</a
		>{t('token.introAfter')}
	</p>

	<form method="POST" use:enhance>
		<label for="token">{t('token.apiToken')}</label>
		<input
			id="token"
			name="token"
			type="password"
			autocomplete="off"
			placeholder={t('token.placeholder')}
			required
		/>
		{#if form?.error}
			<p class="err" role="alert">{form.error}</p>
		{/if}
		<button class="btn btn-primary" type="submit">{t('token.connect')}</button>
	</form>

	{#if data.oauthEnabled}
		<p class="muted small">{t('token.preferBefore')}<a href="/auth/login">{t('token.preferLink')}</a></p>
	{/if}
</section>

<style>
	.wrap {
		max-width: 32rem;
		margin: 3rem auto;
		padding: 0 1.5rem;
		display: grid;
		gap: 1rem;
	}
	.small {
		font-size: 0.85rem;
	}
	button {
		justify-self: start;
	}
</style>
