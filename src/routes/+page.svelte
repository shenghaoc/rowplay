<script lang="ts">
	import { PlayCircle, LineChart, Zap } from '@lucide/svelte';
	import { getI18nContext } from '$lib/i18n.svelte';
	let { data } = $props();
	const t = getI18nContext().t;
</script>

<section class="hero container">
	<div class="copy">
		<span class="tag">{t('landing.tagline')}</span>
		<h1>{t('landing.title1')}<br />{t('landing.title2')}</h1>
		<p class="muted lead">{t('landing.lead')}</p>
		<div class="cta">
			{#if data.user || data.demo}
				<a class="btn" href="/dashboard">{data.demo ? t('landing.exploreDemo') : t('landing.openDashboard')}</a>
			{:else}
				<a class="btn" href="/auth/login">{t('landing.connect')}</a>
			{/if}
		</div>
		{#if data.demo}
			<p class="muted small">{t('landing.demoNote')}</p>
		{/if}
	</div>

	<div class="features">
		<div class="card">
			<div class="ficon"><PlayCircle size={24} /></div>
			<h3>{t('landing.feat1Title')}</h3>
			<p class="muted">{t('landing.feat1Body')}</p>
		</div>
		<div class="card">
			<div class="ficon"><LineChart size={24} /></div>
			<h3>{t('landing.feat2Title')}</h3>
			<p class="muted">{t('landing.feat2Body')}</p>
		</div>
		<div class="card">
			<div class="ficon"><Zap size={24} /></div>
			<h3>{t('landing.feat3Title')}</h3>
			<p class="muted">{t('landing.feat3Body')}</p>
		</div>
	</div>
</section>

<style>
	.hero {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 3rem;
		align-items: center;
		padding-top: 4rem;
		padding-bottom: 4rem;
	}
	h1 {
		font-size: 2.8rem;
		line-height: 1.05;
		margin: 1rem 0;
	}
	.lead {
		font-size: 1.1rem;
		line-height: 1.6;
		max-width: 38ch;
	}
	.cta {
		margin: 1.5rem 0 0.75rem;
	}
	.small {
		font-size: 0.85rem;
	}
	.features {
		display: grid;
		gap: 1rem;
	}
	.ficon {
		color: var(--accent);
		margin-bottom: 0.25rem;
	}
	.features h3 {
		margin: 0.5rem 0 0.25rem;
	}
	.features p {
		margin: 0;
		font-size: 0.92rem;
	}
	@media (max-width: 860px) {
		.hero {
			grid-template-columns: 1fr;
			padding-top: 2rem;
		}
		h1 {
			font-size: 2.1rem;
		}
	}
</style>
