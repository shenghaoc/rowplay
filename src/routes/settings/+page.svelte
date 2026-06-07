<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { fmtDate, fmtDateFromEpochMillis } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import { toast } from 'svelte-sonner';
	import Download from '@lucide/svelte/icons/download';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Database from '@lucide/svelte/icons/database';
	import { runHistoryBackfillLoop } from '$lib/historyBackfill';
	import Globe from '@lucide/svelte/icons/globe';
	import { TIMEZONE_OPTIONS } from '$lib/timezoneOptions';
	import {
		clearHomeTimezoneClient,
		readHomeTimezoneClient,
		writeHomeTimezoneClient
	} from '$lib/homeTimezone';
	import { onMount } from 'svelte';

	let { data } = $props();
	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	let syncing = $state(false);
	let syncMode = $state<'incremental' | 'full' | 'history' | null>(null);
	let deleting = $state(false);
	// Seed from server data so SSR renders the selected option (no flash of the
	// default "UTC" option before hydration). Demo mode reads localStorage on mount.
	let selectedTz = $state(data.homeTimezone ?? '');
	let savingTz = $state(false);

	onMount(() => {
		if (data.demo) selectedTz = readHomeTimezoneClient() ?? '';
	});

	const syncHistoryNote = $derived.by(() => {
		const sync = data.sync;
		if (!sync) return '';
		if (sync.backfillDone) return t('sync.historyComplete');
		if (sync.oldestDate) {
			return t('sync.historyBackfilling', {
				total: sync.total,
				date: fmtDate(sync.oldestDate)
			});
		}
		return t('sync.historyWindow', { months: sync.historyWindowMonths });
	});

	// Start the backfill loop when the windowed sync is present and incomplete. Gate on a
	// STABLE derived rather than raw data.sync: the loop's invalidateAll() replaces
	// data.sync every chunk, but shouldBackfill stays `true` until backfillDone flips, so
	// the effect runs once and does not restart per chunk (which would bypass PACE_MS and
	// hammer the API). $effect rather than onMount also covers first connect, where
	// data.sync is null at mount and only appears after the initial sync. The
	// component-level controller lets loadFullHistory() cancel this background loop, and
	// the cleanup aborts whichever loop is in flight when the page unmounts.
	let backfillController: AbortController | null = null;
	const shouldBackfill = $derived(!!data.sync && !data.sync.backfillDone && !data.demo);

	$effect(() => {
		if (!shouldBackfill) return;
		backfillController = new AbortController();
		void runHistoryBackfillLoop({ signal: backfillController.signal }).catch((e) => {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			console.error('[historyBackfill]', e);
		});
		return () => backfillController?.abort();
	});

	const lastSyncLabel = $derived(
		data.sync?.lastSyncAt
			? fmtDateFromEpochMillis(data.sync.lastSyncAt)
			: t('settings.neverSynced')
	);

	async function loadFullHistory() {
		if (data.demo || syncing) return;
		syncing = true;
		syncMode = 'history';
		// Cancel the background backfill so the manual run is the only loop in flight, and
		// give it its own signal so it stops cleanly if the user navigates away.
		backfillController?.abort();
		backfillController = new AbortController();
		const toastId = toast.loading(t('sync.historyWindow', { months: data.sync?.historyWindowMonths ?? 12 }));
		try {
			await runHistoryBackfillLoop({ signal: backfillController.signal });
			await invalidateAll();
			toast.success(t('sync.historyComplete'), { id: toastId });
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				toast.dismiss(toastId);
				return;
			}
			toast.error(t('sync.failed'), {
				id: toastId,
				description: e instanceof Error ? e.message : t('common.tryAgain')
			});
		} finally {
			syncing = false;
			syncMode = null;
		}
	}

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

	async function saveTimezone() {
		if (savingTz) return;
		savingTz = true;
		const tz = selectedTz.trim() || undefined;
		try {
			if (data.demo) {
				if (tz) writeHomeTimezoneClient(tz);
				else clearHomeTimezoneClient();
			} else {
				const res = await fetch('/api/settings/timezone', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ timezone: tz ?? null })
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
			}
			await invalidateAll();
			toast.success(t('settings.timezoneSaved'));
		} catch (e) {
			toast.error(t('common.tryAgain'), {
				description: e instanceof Error ? e.message : undefined
			});
		} finally {
			savingTz = false;
		}
	}

	async function deleteData() {
		if (deleting || syncing) return;
		if (!confirm(t('settings.deleteConfirm'))) return;
		deleting = true;
		try {
			// Clear the service-worker caches before the account-delete request
			// so cached authenticated pages/api responses don't outlive the session.
			navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_USER_CACHES' });
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

	<article class="card card-border bg-base-100 shadow-md p-5">
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

	<article class="card card-border bg-base-100 shadow-md p-5">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head">
				<Globe size={18} style="color: var(--ghost)" />
				{t('settings.timezoneTitle')}
			</h2>
			<p class="muted">{t('settings.timezoneNote')}</p>
			<label class="tzlabel" for="tz-select">{t('settings.timezoneLabel')}</label>
			<select
				id="tz-select"
				name="timezone"
				class="select select-bordered w-full max-w-md"
				bind:value={selectedTz}
				disabled={savingTz}
				onchange={saveTimezone}
			>
				<option value="">{t('settings.timezoneUtcDefault')}</option>
				{#each TIMEZONE_OPTIONS as group (group.group)}
					<optgroup label={t(group.group)}>
						{#each group.options as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</div>
	</article>

	<article class="card card-border bg-base-100 shadow-md p-5">
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

	<article class="card card-border bg-base-100 shadow-md p-5">
		<div class="card-body p-0 gap-3">
			<h2 class="section-head">
				<RefreshCw size={18} style="color: var(--ghost)" />
				{t('settings.syncTitle')}
			</h2>
			<p class="muted">{t('settings.syncNote')}</p>
			{#if data.demo}
				<span class="badge badge-soft badge-primary">{t('settings.syncDemo')}</span>
			{:else}
				{#if data.sync}
					<p class="sync-meta muted">{syncHistoryNote}</p>
					<p class="sync-meta muted">{t('settings.lastSync', { date: lastSyncLabel, total: data.sync.total })}</p>
				{:else}
					<p class="sync-meta muted">{t('settings.lastSync', { date: lastSyncLabel, total: 0 })}</p>
				{/if}
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
					{#if data.sync && !data.sync.backfillDone}
						<button
							class="btn btn-ghost btn-sm"
							type="button"
							disabled={syncing || deleting}
							onclick={loadFullHistory}
						>
							{#if syncMode === 'history'}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
							{syncMode === 'history' ? t('dashboard.syncing') : t('settings.loadFullHistory')}
						</button>
					{/if}
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
	.tzlabel {
		font-size: 0.85rem;
	}
	.danger-card { border-color: color-mix(in srgb, var(--alarm) 45%, var(--hairline)); }
	.danger-action { color: var(--alarm); }
</style>
