<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head><title>Use a token · rowplay</title></svelte:head>

<section class="wrap">
	<h1>Use your Concept2 token</h1>
	<p class="muted">
		Paste a personal API token from your Concept2 logbook (<a
			href="https://log.concept2.com/profile/edit"
			target="_blank"
			rel="noreferrer">Edit Profile → Applications</a
		>). rowplay keeps it server-side for your session only and uses it to read your own workouts —
		it never reaches the browser.
	</p>

	<form method="POST" use:enhance>
		<label for="token">API token</label>
		<input
			id="token"
			name="token"
			type="password"
			autocomplete="off"
			placeholder="Paste your token"
			required
		/>
		{#if form?.error}
			<p class="err" role="alert">{form.error}</p>
		{/if}
		<button class="btn" type="submit">Connect with token</button>
	</form>

	{#if data.oauthEnabled}
		<p class="muted small">Prefer the standard flow? <a href="/auth/login">Connect Concept2</a></p>
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
	form {
		display: grid;
		gap: 0.6rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	input {
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: rgba(255, 255, 255, 0.03);
		color: var(--text);
		font: inherit;
	}
	.err {
		color: #f85149;
		font-size: 0.9rem;
		margin: 0;
	}
	.small {
		font-size: 0.85rem;
	}
	button {
		justify-self: start;
	}
</style>
