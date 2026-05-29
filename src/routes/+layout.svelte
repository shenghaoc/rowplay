<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { data, children } = $props();
</script>

<header class="topbar">
	<div class="topbar-inner">
		<a class="brand" href="/">
			<span class="logo">🚣</span>
			<span class="name">rowplay</span>
		</a>
		<nav>
			<a href="/dashboard" class:active={$page.url.pathname.startsWith('/dashboard')}>Dashboard</a>
		</nav>
		<div class="spacer"></div>
		{#if data.demo}
			<span class="tag">demo mode</span>
		{/if}
		{#if data.user}
			<span class="muted user">@{data.user.username}</span>
			<form method="POST" action="/auth/logout">
				<button class="btn ghost small">Log out</button>
			</form>
		{:else if !data.demo}
			<a class="btn small" href="/auth/login">Connect Concept2</a>
		{/if}
	</div>
</header>

<main>
	{@render children()}
</main>

<footer>
	<div class="container muted">
		rowplay · Concept2 logbook analytics &amp; real-time replay · not affiliated with Concept2
	</div>
</footer>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: rgba(13, 17, 23, 0.85);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--border);
	}
	.topbar-inner {
		max-width: 1180px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 0.7rem 1.5rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 750;
		font-size: 1.15rem;
		color: var(--text);
	}
	.brand:hover {
		text-decoration: none;
	}
	.logo {
		font-size: 1.3rem;
	}
	nav a {
		color: var(--text-dim);
		font-weight: 600;
		font-size: 0.95rem;
	}
	nav a.active {
		color: var(--text);
	}
	.spacer {
		flex: 1;
	}
	.user {
		font-size: 0.9rem;
	}
	.btn.small {
		padding: 0.4rem 0.8rem;
		font-size: 0.85rem;
	}
	form {
		margin: 0;
	}
	main {
		min-height: calc(100vh - 120px);
	}
	footer {
		border-top: 1px solid var(--border);
		padding: 1.5rem 0;
		font-size: 0.85rem;
	}
</style>
