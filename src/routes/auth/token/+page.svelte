<script lang="ts">
	import { enhance } from '$app/forms';
	import { getI18nContext } from '$lib/i18n.svelte';
	let { data, form } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	// Validating the token hits the Concept2 API server-side, so the submit can
	// take a few seconds. Drive a pending state so the button isn't a dead click.
	let submitting = $state(false);
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

	<div class="card card-border bg-base-100 shadow-md p-5 trust">
		<h2>{t('token.trustTitle')}</h2>
		<ul>
			<li><strong>{t('token.trustAccessTitle')}</strong> {t('token.trustAccessBody')}</li>
			<li><strong>{t('token.trustStoredTitle')}</strong> {t('token.trustStoredBody')}</li>
			<li><strong>{t('token.trustDisconnectTitle')}</strong> {t('token.trustDisconnectBody')}</li>
			<li><strong>{t('token.trustCacheTitle')}</strong> {t('token.trustCacheBody')}</li>
		</ul>
	</div>

	<form
		method="POST"
		use:enhance={() => {
			// Show a spinner + disable the button until the action redirects
			// (success) or returns an error (failure re-enables it for a retry).
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<fieldset class="fieldset">
			<label class="fieldset-legend" for="token">{t('token.apiToken')}</label>
			<input
				id="token"
				name="token"
				type="password"
				class="input input-bordered w-full"
				autocomplete="off"
				placeholder={t('token.placeholder')}
				required
			/>
			{#if form?.error}
				<div class="alert alert-error" role="alert">{form.error}</div>
			{/if}
			<button class="btn btn-primary" type="submit" disabled={submitting} aria-busy={submitting}>
				{#if submitting}
					<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
				{/if}
				{submitting ? t('token.connecting') : t('token.connect')}
			</button>
		</fieldset>
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
		gap: var(--space-lg);
	}
	.small {
		font-size: 0.85rem;
	}
	.trust {
		border-color: color-mix(in srgb, var(--live) 24%, var(--hairline));
		background: linear-gradient(135deg, color-mix(in srgb, var(--live) 6%, var(--paper-raised)), var(--paper-raised) 72%);
	}
	.trust h2 {
		margin: 0 0 0.65rem;
		font-size: 0.95rem;
		font-weight: var(--fw-extrabold);
		text-transform: uppercase;
	}
	.trust ul {
		margin: 0;
		padding-left: 1rem;
		display: grid;
		gap: var(--space-sm);
	}
	.trust li {
		line-height: 1.45;
	}
	button {
		justify-self: start;
	}
</style>
