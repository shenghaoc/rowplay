<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { Toaster } from 'svelte-sonner';
	import { Activity, Languages, Sun, Moon } from '@lucide/svelte';
	import { I18n, setI18nContext } from '$lib/i18n.svelte';
	import { Theme, setThemeContext } from '$lib/theme.svelte';

	let { data, children } = $props();

	const i18n = setI18nContext(new I18n(data.lang));
	const theme = setThemeContext(new Theme(data.theme));
	const t = i18n.t;
</script>

<Toaster theme={theme.value} position="bottom-right" richColors />


<header class="topbar">
	<div class="topbar-inner">
		<a class="brand" href="/">
			<span class="logo"><Activity size={20} strokeWidth={2.5} /></span>
			<span class="name">rowplay</span>
		</a>
		<nav>
			<a href="/dashboard" class:active={$page.url.pathname.startsWith('/dashboard')}
				>{t('nav.dashboard')}</a
			>
		</nav>
		<div class="spacer"></div>
		<button class="iconbtn" onclick={() => i18n.toggle()} title={t('lang.switch')} aria-label={t('lang.switch')}>
			<Languages size={16} />
			<span>{i18n.lang === 'en' ? '中文' : 'EN'}</span>
		</button>
		<button
			class="iconbtn"
			onclick={() => theme.toggle()}
			title={theme.isDark ? t('theme.toLight') : t('theme.toDark')}
			aria-label={theme.isDark ? t('theme.toLight') : t('theme.toDark')}
		>
			{#if theme.isDark}<Sun size={16} />{:else}<Moon size={16} />{/if}
		</button>
		{#if data.user}
			<span class="muted user">@{data.user.username}</span>
			<form method="POST" action="/auth/logout">
				<button class="btn ghost small">{t('auth.logout')}</button>
			</form>
		{:else}
			<span class="tag">{t('common.demoMode')}</span>
			{#if data.oauthEnabled}
				<a class="btn ghost small" href="/auth/login">{t('auth.connect')}</a>
			{/if}
			<a class="btn small" href="/auth/token">{t('auth.useToken')}</a>
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
		background: var(--topbar-bg);
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
		display: inline-flex;
		align-items: center;
		color: var(--accent);
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
	.iconbtn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-dim);
		border-radius: 8px;
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		font-family: var(--mono);
		cursor: pointer;
	}
	.iconbtn:hover {
		color: var(--text);
		border-color: var(--accent);
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
