<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { fmtDateFromEpochMillis } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { toast } from 'svelte-sonner';
	import { Download, RefreshCw, Trash2, Database } from '@lucide/svelte';

	let { data } = $props();
	const t = getI18nContext().t;

	let syncing = $state(false);
	let syncMode = $state<'incremental' | 'full' | null>(null);
	let deleting = $state(false);

	const lastSyncLabel = $derived(
		data.sync?.lastSyncAt
			? fmtDateFromEpochMillis(data.sync.lastSyncAt)
			: t('settings.neverSynced')
	);

	async function runSync(full: boolean) {
		if (data.demo || syncing) return;
		syncing = true;
		syncMode = full ? 'full' : 'incremental';
		const toastId = toast.loading(t('sync.loading'));
		try {
			const url = full ? '/api/sync?full=1' : '/api/sync';
			const res = await fetch(url, { method: 'POST' });
			if (!res.ok) {
				let message = `HTTP ${res.status}`;
				try {
					const body = (await res.json()) as { message?: string };
					if (body?.message) message = body.message;
				} catch {
					/* non-JSON */
				}
				throw new Error(message);
			}
			const { added, total } = (await res.json()) as { added: number; total: number };
			await invalidateAll();
			toast.success(t('sync.done', { added, total }), { id: toastId });
		} catch (e) {
			toast.error(t('sync.failed'), {
				id: toastId,
				description: e instanceof Error ? e.message : t('common.tryAgain')
			});
		} finally {
			syncing = false;
			syncMode = null;
		}
	}

	async function deleteData() {
		if (deleting) return;
		if (!confirm(t('settings.deleteConfirm'))) return;
		deleting = true;
		try {
			const res = await fetch('/api/account/delete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ confirm: true })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { demo?: boolean; ok?: boolean };
			if (body.demo) {
				toast.message(t('settings.deleteDemo'));
				return;
			}
			toast.success(t('settings.deleteDone'));
			await goto('/');
		} catch (e) {
			toast.error(t('settings.deleteFailed'), {
				description: e instanceof Error ? e.message : t('common.tryAgain')
			});
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{t('settings.title')} · rowplay</title></svelte:head>

<section class="wrap container">
	<p class="eyebrow">{t('settings.eyebrow')}</p>
	<h1>{t('settings.title')}</h1>

	<article class="panel">
		<h2><Database size={18} /> {t('settings.dataTitle')}</h2>
		<p class="muted">{t('settings.dataNote')}</p>
		<ul class="facts muted">
			<li>{t('settings.factWorkouts', { n: data.workoutCount })}</li>
			{#if data.demo}
				<li>{t('settings.factDemo')}</li>
			{:else}
				<li>{t('settings.factCache')}</li>
				<li>{t('settings.factSession')}</li>
			{/if}
		</ul>
	</article>

	<article class="panel">
		<h2><Download size={18} /> {t('settings.exportTitle')}</h2>
		<p class="muted">{t('settings.exportNote')}</p>
		<div class="row">
			<a class="btn btn-primary" href="/api/export?format=csv" download>{t('settings.exportCsv')}</a>
			<a class="btn btn-neutral" href="/api/export?format=json" download>{t('settings.exportJson')}</a>
		</div>
		{#if data.tcxWorkouts.length}
			<p class="muted small">{t('settings.exportTcxNote')}</p>
			<ul class="tcx-list">
				{#each data.tcxWorkouts as w (w.id)}
					<li>
						<a href="/api/export/{w.id}?format=tcx" download>{t('settings.exportTcx', { id: w.id })}</a>
						<span class="muted">{w.date}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</article>

	<article class="panel">
		<h2><RefreshCw size={18} /> {t('settings.syncTitle')}</h2>
		<p class="muted">{t('settings.syncNote')}</p>
		{#if data.demo}
			<p class="badge badge-primary">{t('settings.syncDemo')}</p>
		{:else}
			<p class="sync-meta muted">{t('settings.lastSync', { date: lastSyncLabel, total: data.sync?.total ?? 0 })}</p>
			<div class="row">
				<button
					class="btn btn-primary"
					type="button"
					disabled={syncing}
					onclick={() => runSync(false)}
				>
					{syncMode === 'incremental' ? t('dashboard.syncing') : t('settings.syncIncremental')}
				</button>
				<button
					class="btn btn-ghost"
					type="button"
					disabled={syncing}
					onclick={() => runSync(true)}
				>
					{syncMode === 'full' ? t('dashboard.syncing') : t('settings.syncFull')}
				</button>
			</div>
		{/if}
	</article>

	<article class="panel danger">
		<h2><Trash2 size={18} /> {t('settings.deleteTitle')}</h2>
		<p class="muted">{t('settings.deleteNote')}</p>
		<button class="btn btn-error" type="button" disabled={deleting} onclick={deleteData}>
			{deleting ? t('common.loading') : t('settings.deleteAction')}
		</button>
	</article>
</section>

<style>
	.wrap {
		padding: 2rem 0 3rem;
		display: grid;
		gap: 1.25rem;
		max-width: 42rem;
	}
	.eyebrow {
		font-family: var(--mono);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-2);
		margin: 0;
	}
	h1 {
		font-family: var(--display);
		margin: 0;
	}
	.panel {
		border: var(--bd);
		border-radius: var(--r-card);
		padding: 1.25rem;
		background: var(--paper-raised);
		display: grid;
		gap: 0.75rem;
	}
	.panel.danger {
		border-color: var(--alarm);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.05rem;
		margin: 0;
	}
	.facts {
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.88rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
	.tcx-list {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.88rem;
		display: grid;
		gap: 0.35rem;
		max-height: 12rem;
		overflow-y: auto;
	}
	.tcx-list li {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.sync-meta {
		font-family: var(--mono);
		font-size: 0.82rem;
		margin: 0;
	}
</style>
