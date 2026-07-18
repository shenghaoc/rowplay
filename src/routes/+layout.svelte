<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import { Toaster } from 'svelte-sonner';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import LanguagePicker from '$components/LanguagePicker.svelte';
	import { I18n, setI18nContext } from '$lib/i18n.svelte';
	import { Theme, setThemeContext } from '$lib/theme.svelte';
	import { initPwaUpdate } from '$lib/pwa-update';

	let { data, children } = $props();

	// svelte-ignore state_referenced_locally
	const i18n = setI18nContext(new I18n(data.lang));
	// svelte-ignore state_referenced_locally
	const theme = setThemeContext(new Theme(data.theme));
	const t = $derived(i18n.translate);

	let menuOpen = $state(false);
	let mobileNav = $state<HTMLDialogElement | undefined>();

	function closeMenu() {
		mobileNav?.close();
	}

	function onNavClose() {
		menuOpen = false;
	}

	function toggleMenu() {
		if (!mobileNav) return;
		if (mobileNav.open) closeMenu();
		else {
			mobileNav.showModal();
			menuOpen = true;
		}
	}

	$effect(() => {
		void page.url.pathname;
		closeMenu();
	});

	// Scoped cross-fade between routes. Only the <main> region animates
	// (view-transition-name: rp-main in app.css); the masthead/footer persist.
	// Skipped when the API is unavailable or the user prefers reduced motion.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	onMount(() => {
		document.documentElement.dataset.appHydrated = 'true';
		initPwaUpdate(i18n);
	});
</script>

<a class="skip-link" href="#main">{t('nav.skipToContent')}</a>

<Toaster theme={theme.value} position="bottom-right" richColors />

<header class="masthead">
	<div class="mast-inner">
		<a class="brand" href="/">
			<span class="play-mark" aria-hidden="true"></span>
			<span class="name">rowplay</span>
		</a>

		<nav class="mast-tabs desktop-only" aria-label="Main">
			<a href="/dashboard" class:active={page.url.pathname.startsWith('/dashboard')}
				>{t('nav.dashboard')}</a
			>
			<a href="/docs" class:active={page.url.pathname.startsWith('/docs')}>{t('nav.docs')}</a>
		</nav>

		<div class="spacer desktop-only"></div>

		<div class="mast-actions desktop-only">
			<LanguagePicker />
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
				<form
					method="POST"
					action="/auth/logout"
					onsubmit={() => {
						// Clear page/api caches before the logout POST so stale
						// data doesn't outlive the session. The fetch is a
						// best-effort fire-and-forget: the server-side session
						// invalidation and no-store headers are the authoritative
						// guards — this just cleans up proactively.
						navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHES' });
					}}
				>
					<button class="btn btn-ghost btn-sm" type="submit">{t('auth.logout')}</button>
				</form>
			{:else}
				<span class="badge badge-soft badge-primary">{t('common.demoMode')}</span>
				{#if data.oauthEnabled}
					<a class="btn btn-ghost btn-sm" href="/auth/login">{t('auth.connect')}</a>
				{/if}
				<a class="btn btn-primary btn-sm" href="/auth/token">{t('auth.useToken')}</a>
			{/if}
		</div>

		<button
			class="iconbtn menu-btn mobile-only"
			type="button"
			onclick={toggleMenu}
			aria-expanded={menuOpen}
			aria-controls="mobile-nav"
			aria-haspopup="dialog"
			aria-label={menuOpen ? t('nav.menuClose') : t('nav.menuOpen')}
		>
			{#if menuOpen}<X size={18} />{:else}<Menu size={18} />{/if}
		</button>
	</div>

	<dialog
		id="mobile-nav"
		class="mobile-drawer mobile-only"
		bind:this={mobileNav}
		closedby="any"
		onclose={onNavClose}
		onclick={(e) => {
			if (!mobileNav?.open) return;
			if (e.target === mobileNav) {
				const rect = mobileNav.getBoundingClientRect();
				if (
					e.clientX < rect.left ||
					e.clientX > rect.right ||
					e.clientY < rect.top ||
					e.clientY > rect.bottom
				) {
					closeMenu();
				}
			}
		}}
	>
			<nav class="drawer-nav" aria-label="Main">
				<a href="/dashboard" class:active={page.url.pathname.startsWith('/dashboard')}
					>{t('nav.dashboard')}</a
				>
				<a href="/docs" class:active={page.url.pathname.startsWith('/docs')}>{t('nav.docs')}</a>
			</nav>
			<div class="drawer-actions">
				<LanguagePicker />
				<button
					class="btn btn-ghost btn-square btn-sm drawer-theme"
					type="button"
					onclick={() => theme.toggle()}
					aria-label={theme.isDark ? t('theme.toLight') : t('theme.toDark')}
				>
					{#if theme.isDark}<Sun size={16} />{:else}<Moon size={16} />{/if}
				</button>
				{#if data.user}
					<span class="muted user">@{data.user.username}</span>
					<form
						method="POST"
						action="/auth/logout"
						onsubmit={() => {
							// Clear page/api caches before the logout POST so stale
							// data doesn't outlive the session. The fetch is a
							// best-effort fire-and-forget: the server-side session
							// invalidation and no-store headers are the authoritative
							// guards — this just cleans up proactively.
							navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHES' });
						}}
					>
						<button class="btn btn-ghost btn-sm" type="submit">{t('auth.logout')}</button>
					</form>
				{:else}
					<span class="badge badge-soft badge-primary">{t('common.demoMode')}</span>
					{#if data.oauthEnabled}
						<a class="btn btn-ghost btn-sm" href="/auth/login">{t('auth.connect')}</a>
					{/if}
					<a class="btn btn-primary btn-sm" href="/auth/token">{t('auth.useToken')}</a>
				{/if}
			</div>
	</dialog>
</header>

<main id="main" inert={menuOpen ? true : undefined}>
	{@render children()}
</main>

<footer>
	<div class="container footer-inner muted">
		<span>{t('common.tagline')}</span>
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
		position: relative;
		z-index: 12;
		max-width: 1160px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 0 1.5rem;
		min-height: 60px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		border: var(--bd-heavy);
		border-radius: var(--r-ctrl);
		padding: 0.25rem 0.65rem 0.25rem 0.5rem;
		background: var(--paper-raised);
		color: var(--ink);
		font-family: var(--display);
		font-weight: var(--fw-extrabold);
		font-size: 1.35rem;
		letter-spacing: 0.01em;
		flex-shrink: 0;
	}
	.brand:hover {
		text-decoration: none;
	}
	.play-mark {
		width: 0;
		height: 0;
		border-style: solid;
		border-width: 7px 0 7px 11px;
		border-color: transparent transparent transparent var(--chrome);
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
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.92rem;
		color: var(--ink-2);
		border-bottom: 3px solid transparent;
		margin-bottom: -2px;
	}
	.mast-tabs a.active {
		color: var(--ink);
		border-bottom-color: var(--chrome);
	}
	.mast-tabs a:hover {
		text-decoration: none;
		color: var(--ink);
	}
	.mast-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		flex-shrink: 0;
	}
	.spacer {
		flex: 1;
	}
	.iconbtn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
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
	.menu-btn {
		margin-left: auto;
	}
	.user {
		font-family: var(--mono);
		font-size: 0.78rem;
	}
	form {
		margin: 0;
	}
	.mobile-only {
		display: none;
	}
	.mobile-drawer {
		margin: 0;
		/* Top sheet: pin to top, height from content (not the modal's inset:0). */
		inset: 0 0 auto 0;
		padding: 0.75rem 1rem 1rem;
		border: none;
		border-bottom: var(--bd-heavy);
		width: 100%;
		max-width: 100vw;
		max-height: calc(100dvh - 54px);
		overflow-y: auto;
		background: var(--paper);
		box-shadow: var(--shadow-lg);
	}
	.mobile-drawer::backdrop {
		background: rgb(15 42 54 / 0.35);
		transition:
			background 0.2s ease,
			display 0.2s ease,
			overlay 0.2s ease;
		transition-behavior: allow-discrete;
	}
	.mobile-drawer:not([open]) {
		display: none;
		opacity: 0;
		translate: 0 -8px;
	}
	.mobile-drawer[open] {
		display: grid;
		gap: var(--space-lg);
		align-content: start;
		opacity: 1;
		translate: 0 0;
		transition:
			opacity 0.18s ease,
			translate 0.18s ease,
			display 0.18s ease,
			overlay 0.18s ease;
		transition-behavior: allow-discrete;
	}
	@starting-style {
		.mobile-drawer[open] {
			opacity: 0;
			translate: 0 -8px;
		}
		.mobile-drawer[open]::backdrop {
			background: rgb(15 42 54 / 0);
		}
	}
	.drawer-nav {
		display: grid;
		gap: var(--space-xs);
		align-content: start;
	}
	.drawer-nav a {
		display: block;
		padding: 0.55rem 0.65rem;
		border-radius: var(--r-ctrl);
		font-family: var(--display);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.92rem;
		color: var(--ink-2);
	}
	.drawer-nav a.active {
		color: var(--ink);
		background: var(--paper-raised);
	}
	.drawer-nav a:hover {
		text-decoration: none;
		color: var(--ink);
		background: var(--paper-raised);
	}
	.drawer-actions {
		display: grid;
		gap: 0.65rem;
		justify-items: start;
		align-content: start;
		padding-top: 0.35rem;
		border-top: var(--bd);
	}
	.drawer-theme {
		font-family: var(--display);
		font-size: 0.85rem;
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
		gap: var(--space-sm);
		font-family: var(--mono);
		font-size: 0.76rem;
		padding-top: 1.25rem;
		padding-bottom: 1.25rem;
	}
	@media (max-width: 760px) {
		.desktop-only {
			display: none !important;
		}
		.mobile-only {
			display: block;
		}
		.menu-btn.mobile-only {
			display: inline-flex;
		}
		.mast-inner {
			gap: var(--space-md);
			padding: 0 1rem;
			min-height: 54px;
		}
		.brand .name {
			font-size: 1.15rem;
		}
		.footer-inner {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
