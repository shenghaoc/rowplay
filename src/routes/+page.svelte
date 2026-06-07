<script lang="ts">
	import PlayCircle from '@lucide/svelte/icons/play-circle';
	import LineChart from '@lucide/svelte/icons/line-chart';
	import GitCompare from '@lucide/svelte/icons/git-compare';
	import Download from '@lucide/svelte/icons/download';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	import {
		dismissFirstRunSurface,
		isFirstRunSurfaceDismissed
	} from '$lib/firstRun';
	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	let showLandingTour = $state(false);

	onMount(() => {
		showLandingTour = data.firstRunEligible && !isFirstRunSurfaceDismissed('landing');
	});

	function dismissLandingTour() {
		dismissFirstRunSurface('landing');
		showLandingTour = false;
	}
</script>

<section class="splash container">
	<div class="copy">
		<span class="badge badge-soft badge-primary">{t('landing.tagline')}</span>
		<h1>{t('landing.title1')}<br />{t('landing.title2')}</h1>
		<p class="muted lead">{t('landing.lead')}</p>
		<div class="cta">
			{#if data.user || data.demo}
				<a class="btn btn-primary" href="/dashboard">{data.demo ? t('landing.exploreDemo') : t('landing.openDashboard')}</a>
			{:else}
				<a class="btn btn-primary" href="/auth/login">{t('landing.connect')}</a>
			{/if}
			<a class="btn btn-ghost" href="/docs">{t('landing.readGuide')}</a>
		</div>
		{#if data.demo}
			<p class="muted small">{t('landing.demoNote')}</p>
		{/if}
		{#if showLandingTour}
			<div class="card card-border bg-base-100 shadow-md p-5 tour" data-e2e="landing-tour">
				<div class="tour-head">
					<div>
						<p class="eyebrow">{t('landing.tourEyebrow')}</p>
						<h2>{t('landing.tourTitle')}</h2>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-square btn-sm"
						aria-label={t('landing.tourDismiss')}
						onclick={dismissLandingTour}
					>
						<X size={16} />
					</button>
				</div>
				<p class="muted tour-body">{t('landing.tourBody')}</p>
				<div class="tour-steps">
					<div class="tour-step">
						<LayoutDashboard size={18} aria-hidden="true" />
						<span>{t('landing.tourDashboard')}</span>
					</div>
					<div class="tour-step">
						<PlayCircle size={18} aria-hidden="true" />
						<span>{t('landing.tourReplay')}</span>
					</div>
					<div class="tour-step">
						<GitCompare size={18} aria-hidden="true" />
						<span>{t('landing.tourGhost')}</span>
					</div>
					<div class="tour-step">
						<Download size={18} aria-hidden="true" />
						<span>{t('landing.tourExport')}</span>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="features">
		<div class="card card-border bg-base-100 shadow-md p-5 feat">
			<div class="ficon"><PlayCircle size={24} strokeWidth={2} /></div>
			<h3>{t('landing.feat1Title')}</h3>
			<p class="muted">{t('landing.feat1Body')}</p>
		</div>
		<div class="card card-border bg-base-100 shadow-md p-5 feat">
			<div class="ficon"><GitCompare size={24} strokeWidth={2} /></div>
			<h3>{t('landing.feat2Title')}</h3>
			<p class="muted">{t('landing.feat2Body')}</p>
		</div>
		<div class="card card-border bg-base-100 shadow-md p-5 feat">
			<div class="ficon"><LineChart size={24} strokeWidth={2} /></div>
			<h3>{t('landing.feat3Title')}</h3>
			<p class="muted">{t('landing.feat3Body')}</p>
		</div>
	</div>
</section>

<style>
	.splash {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 3rem;
		align-items: center;
		padding-top: 4rem;
		padding-bottom: 4rem;
	}
	h1 {
		font-size: clamp(2rem, 6vw, 2.8rem);
		font-weight: 900;
		text-transform: uppercase;
		line-height: 1.05;
		margin: 1rem 0;
		letter-spacing: -0.02em;
	}
	.lead {
		font-size: 1.05rem;
		line-height: 1.6;
		max-width: 38ch;
	}
	.cta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 1.5rem 0 0.75rem;
	}
	.small {
		font-size: 0.85rem;
		font-family: var(--mono);
	}
	.features {
		display: grid;
		gap: 1rem;
	}
	.feat {
		box-shadow: var(--stamp);
	}
	.ficon {
		color: var(--live);
		margin-bottom: 0.25rem;
	}
	.features h3 {
		margin: 0.5rem 0 0.25rem;
		font-size: 1.05rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}
	.features p {
		margin: 0;
		font-size: 0.92rem;
	}
	.tour {
		margin-top: 1.25rem;
		border-color: color-mix(in srgb, var(--live) 28%, var(--hairline));
		background: linear-gradient(135deg, color-mix(in srgb, var(--live) 8%, var(--paper-raised)), var(--paper-raised) 70%);
	}
	.tour-head {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
	}
	.tour h2 {
		font-size: 1rem;
		font-weight: 800;
		margin: 0.15rem 0 0;
		text-transform: uppercase;
	}
	.tour-body {
		font-size: 0.9rem;
		margin: 0.65rem 0 0;
	}
	.tour-steps {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 0.9rem;
	}
	.tour-step {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--hairline);
		border-radius: var(--r-ctrl);
		background: var(--paper-inset);
		font-size: 0.82rem;
		font-weight: 700;
	}
	.tour-step :global(svg) {
		flex: 0 0 auto;
		color: var(--live);
	}
	@media (max-width: 860px) {
		.splash {
			grid-template-columns: 1fr;
			padding-top: 2rem;
		}
	}
	@media (max-width: 390px) {
		.splash {
			padding-top: 1.25rem;
			padding-bottom: 2rem;
			gap: 1.5rem;
		}
		h1 {
			font-size: 1.85rem;
		}
		.lead {
			font-size: 0.95rem;
		}
		.tour-steps {
			grid-template-columns: 1fr;
		}
	}
</style>
