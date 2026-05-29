<script lang="ts">
	import { PlayCircle, LineChart, Zap } from '@lucide/svelte';
	let { data } = $props();
</script>

<section class="hero container">
	<div class="copy">
		<span class="tag">Concept2 · RowErg · SkiErg · BikeErg</span>
		<h1>Replay your workouts.<br />Understand your splits.</h1>
		<p class="muted lead">
			rowplay connects to your Concept2 logbook and turns every result into rich analytics — and a
			real-time replay you can watch stroke by stroke, with a live course and synchronized
			pace, rate, power and heart-rate telemetry.
		</p>
		<div class="cta">
			{#if data.user || data.demo}
				<a class="btn" href="/dashboard">{data.demo ? 'Explore the demo' : 'Open dashboard'} →</a>
			{:else}
				<a class="btn" href="/auth/login">Connect your Concept2 logbook →</a>
			{/if}
		</div>
		{#if data.demo}
			<p class="muted small">
				Running in <strong>demo mode</strong> with sample data. Add your Concept2 API keys to load
				your own logbook.
			</p>
		{/if}
	</div>

	<div class="features">
		<div class="card">
			<div class="ficon"><PlayCircle size={24} /></div>
			<h3>Real-time replay</h3>
			<p class="muted">Watch your pace race the course while gauges and charts play back in sync.</p>
		</div>
		<div class="card">
			<div class="ficon"><LineChart size={24} /></div>
			<h3>Split analytics</h3>
			<p class="muted">Pace, stroke rate, power and HR over time — across all three machines.</p>
		</div>
		<div class="card">
			<div class="ficon"><Zap size={24} /></div>
			<h3>On the edge</h3>
			<p class="muted">Served from Cloudflare with cached stroke data for instant replays.</p>
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
