<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Toaster } from 'svelte-sonner';
	import { Languages, Sun, Moon } from '@lucide/svelte';
	import { I18n, setI18nContext } from '$lib/i18n.svelte';
	import { Theme, setThemeContext } from '$lib/theme.svelte';
	import { initPwaUpdate } from '$lib/pwa-update';

	let { data, children } = $props();

	// svelte-ignore state_referenced_locally
	const i18n = setI18nContext(new I18n(data.lang));
	// svelte-ignore state_referenced_locally
	const theme = setThemeContext(new Theme(data.theme));
	const t = i18n.t;

	onMount(() => initPwaUpdate(i18n));
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;700;900&family=Source+Code+Pro:wght@400;500;600;700&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;0,900;1,400&display=swap"
	/>
</svelte:head>

<Toaster theme={theme.value} position="bottom-right" richColors />

<header class="masthead">
	<div class="mast-inner">
		<a class="brand" href="/">
			<span class="play-mark" aria-hidden="true"></span>
			<span class="name">rowplay</span>
		</a>
		<nav class="mast-tabs">
			<a href="/dashboard" class:active={$page.url.pathname.startsWith('/dashboard')}
				>{t('nav.dashboard')}</a
			>
			<a href="/leaderboard" class:active={$page.url.pathname.startsWith('/leaderboard')}
				>{t('nav.leaderboard')}</a
			>
			<a href="/settings" class:active={$page.url.pathname.startsWith('/settings')}
				>{t('nav.settings')}</a
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
			<form method="POST" action="/auth/logout" onsubmit={() => { navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_USER_CACHES' }); }}>
				<button class="btn ghost small" type="submit">{t('auth.logout')}</button>
			</form>
		{:else}
			<span class="tag live">{t('common.demoMode')}</span>
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
	<div class="container footer-inner muted">
		<span>rowplay · Concept2 logbook analytics &amp; real-time replay</span>
		<span>{t('common.notAffiliated')}</span>
	</div>
</footer>

<style>
	.masthead {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--paper);
		border-bottom: var(--bd-heavy);
	}
	.mast-inner {
		max-width: 1160px;
		margin: 0 auto;
		display: flex;
		align-items: stretch;
		gap: 1.25rem;
		padding: 0 1.5rem;
		min-height: 60px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		align-self: center;
		border: var(--bd-heavy);
		border-radius: var(--r-ctrl);
		padding: 0.25rem 0.65rem 0.25rem 0.5rem;
		background: var(--paper-raised);
		color: var(--ink);
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.35rem;
		letter-spacing: 0.01em;
	}
	.brand:hover {
		text-decoration: none;
	}
	.play-mark {
		width: 0;
		height: 0;
		border-style: solid;
		border-width: 7px 0 7px 11px;
		border-color: transparent transparent transparent var(--live);
	}
	.mast-tabs {
		display: flex;
		align-items: stretch;
		gap: 1.25rem;
		margin-left: 0.35rem;
	}
	.mast-tabs a {
		display: inline-flex;
		align-items: center;
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.92rem;
		color: var(--ink-2);
		border-bottom: 3px solid transparent;
		margin-bottom: -2px;
	}
	.mast-tabs a.active {
		color: var(--ink);
		border-bottom-color: var(--live);
	}
	.mast-tabs a:hover {
		text-decoration: none;
		color: var(--ink);
	}
	.spacer {
		flex: 1;
	}
	.iconbtn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		align-self: center;
		background: var(--paper-raised);
		border: var(--bd);
		color: var(--ink-2);
		border-radius: var(--r-ctrl);
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		font-family: var(--mono);
		cursor: pointer;
	}
	.iconbtn:hover {
		color: var(--ink);
		border-color: var(--ink);
	}
	.user {
		align-self: center;
		font-family: var(--mono);
		font-size: 0.78rem;
	}
	.btn.small {
		align-self: center;
		padding: 0.4rem 0.75rem;
		font-size: 0.82rem;
	}
	form {
		margin: 0;
		align-self: center;
	}
	main {
		min-height: calc(100vh - 120px);
	}
	footer {
		border-top: var(--bd-heavy);
		margin-top: 2.5rem;
	}
	.footer-inner {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-family: var(--mono);
		font-size: 0.76rem;
		padding-top: 1.25rem;
		padding-bottom: 1.25rem;
	}
	@media (max-width: 760px) {
		.mast-inner {
			gap: 0.75rem;
			padding: 0 1rem;
			min-height: 54px;
		}
		.user {
			display: none;
		}
	}
	@media (max-width: 460px) {
		.mast-tabs {
			gap: 0.75rem;
			margin-left: 0;
		}
		.iconbtn span {
			display: none;
		}
		.brand .name {
			font-size: 1.15rem;
		}
	}
	@media (max-width: 390px) {
		.mast-inner {
			flex-wrap: wrap;
			padding: 0.5rem 0.75rem;
			min-height: 48px;
		}
		.mast-tabs a {
			font-size: 0.82rem;
		}
		.footer-inner {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
