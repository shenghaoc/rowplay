<script lang="ts">
	import PlayCircle from '@lucide/svelte/icons/play-circle';
	import LineChart from '@lucide/svelte/icons/line-chart';
	import GitCompare from '@lucide/svelte/icons/git-compare';
	import { getI18nContext } from '$lib/i18n.svelte';
	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);
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
		</div>
		{#if data.demo}
			<p class="muted small">{t('landing.demoNote')}</p>
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
	}
</style>
