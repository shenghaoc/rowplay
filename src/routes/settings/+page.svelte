<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { fmtDateFromEpochMillis } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { toast } from 'svelte-sonner';
	import Download from '@lucide/svelte/icons/download';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Database from '@lucide/svelte/icons/database';

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	let syncing = $state(false);
	let syncMode = $state<'incremental' | 'full' | null>(null);
	let deleting = $state(false);

	const lastSyncLabel = $derived(
		data.sync?.lastSyncAt
			? fmtDateFromEpochMillis(data.sync.lastSyncAt)
			: t('settings.neverSynced')
	);

	async function runSync(full: boolean) {
		if (data.demo || syncing || deleting) return;
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
		if (deleting || syncing) return;
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

	<article class="card bg-base-100 border border-base-300 shadow-md p-5">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head">
				<Database size={18} style="color: var(--ghost)" />
				{t('settings.dataTitle')}
			</h2>
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
		</div>
	</article>

	<article class="card bg-base-100 border border-base-300 shadow-md p-5">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head">
				<Download size={18} style="color: var(--ghost)" />
				{t('settings.exportTitle')}
			</h2>
			<p class="muted">{t('settings.exportNote')}</p>
			<div class="row">
				<a class="btn btn-primary btn-sm" href="/api/export?format=csv" download>{t('settings.exportCsv')}</a>
				<a class="btn btn-neutral btn-sm" href="/api/export?format=json" download>{t('settings.exportJson')}</a>
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
		</div>
	</article>

	<article class="card bg-base-100 border border-base-300 shadow-md p-5">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head">
				<RefreshCw size={18} style="color: var(--ghost)" />
				{t('settings.syncTitle')}
			</h2>
			<p class="muted">{t('settings.syncNote')}</p>
			{#if data.demo}
				<span class="badge badge-soft badge-primary">{t('settings.syncDemo')}</span>
			{:else}
				<p class="sync-meta muted">{t('settings.lastSync', { date: lastSyncLabel, total: data.sync?.total ?? 0 })}</p>
				<div class="row">
					<button
						class="btn btn-primary btn-sm"
						type="button"
						disabled={syncing || deleting}
						onclick={() => runSync(false)}
					>
						{#if syncMode === 'incremental'}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
						{syncMode === 'incremental' ? t('dashboard.syncing') : t('settings.syncIncremental')}
					</button>
					<button
						class="btn btn-ghost btn-sm"
						type="button"
						disabled={syncing || deleting}
						onclick={() => runSync(true)}
					>
						{#if syncMode === 'full'}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
						{syncMode === 'full' ? t('dashboard.syncing') : t('settings.syncFull')}
					</button>
				</div>
			{/if}
		</div>
	</article>

	<article class="card bg-base-100 shadow-md p-5 border danger-card">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head">
				<Trash2 size={18} style="color: var(--ghost)" />
				{t('settings.deleteTitle')}
			</h2>
			<p class="muted">{t('settings.deleteNote')}</p>
			<div>
				<button
					class="btn btn-ghost btn-sm danger-action"
					type="button"
					disabled={deleting || syncing}
					onclick={deleteData}
				>
					{#if deleting}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
					{deleting ? t('common.loading') : t('settings.deleteAction')}
				</button>
			</div>
		</div>
	</article>
</section>

<style>
	.wrap {
		padding: 2rem 0 3rem;
		display: grid;
		gap: 1.25rem;
		max-width: 44rem;
		margin-inline: auto;
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
	.section-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
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
	.danger-card { border-color: color-mix(in srgb, var(--alarm) 45%, var(--hairline)); }
	.danger-action { color: var(--alarm); }
</style>
