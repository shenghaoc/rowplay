<script lang="ts">
	import { Pencil, Plus, Trash2, X, MessageSquareText } from '@lucide/svelte';
	import { fmtTime } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import type { Annotation } from '$lib/types';

	let {
		annotations = [] as Annotation[],
		currentTime = 0,
		readOnly = false,
		onsave = undefined as ((a: { id: number; timestamp: number; text: string }) => Promise<void>) | undefined,
		ondelete = undefined as ((id: number) => Promise<void>) | undefined,
		onseek = undefined as ((timestamp: number) => void) | undefined
	} = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	let adding = $state(false);
	let editingId = $state<number | null>(null);
	let editingTimestamp = $state(0); // preserved from original during edit
	let draftText = $state('');
	let saving = $state(false);
	let saveError = $state('');

	function startAdd() {
		draftText = '';
		adding = true;
		editingId = null;
		editingTimestamp = 0;
		saveError = '';
	}

	function startEdit(a: Annotation) {
		draftText = a.text;
		editingId = a.id;
		editingTimestamp = a.timestamp;
		adding = false;
		saveError = '';
	}

	function cancel() {
		adding = false;
		editingId = null;
		editingTimestamp = 0;
		draftText = '';
		saveError = '';
	}

	async function save() {
		const text = draftText.trim();
		if (!text || saving) return;
		saving = true;
		saveError = '';
		try {
			if (editingId != null) {
				await onsave?.({ id: editingId, timestamp: editingTimestamp, text });
			} else {
				await onsave?.({ id: 0, timestamp: currentTime, text });
			}
			draftText = '';
			adding = false;
			editingId = null;
			editingTimestamp = 0;
		} catch {
			saveError = t('annotations.saveError');
		} finally {
			saving = false;
		}
	}

	async function confirmDelete(id: number) {
		if (!window.confirm(t('annotations.confirmDelete'))) return;
		saving = true;
		saveError = '';
		try {
			await ondelete?.(id);
		} catch {
			saveError = t('annotations.deleteError');
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		// Don't act on Enter while an IME is composing (e.g. zh/ja) — that Enter
		// confirms the candidate, it isn't a submit.
		if (e.isComposing) return;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			save();
		}
		if (e.key === 'Escape') cancel();
	}

	function seekTo(ts: number) {
		onseek?.(ts);
	}
</script>

<div class="anno-panel card">
	<div class="anno-head">
		<h3 class="anno-title"><MessageSquareText size={16} /> {t('annotations.title')}</h3>
		{#if !readOnly}
			<button class="btn add-btn" onclick={startAdd} aria-label={t('annotations.addNote')} disabled={saving}>
				<Plus size={14} /> {t('annotations.addNote')}
			</button>
		{/if}
	</div>

	{#if adding}
		<div class="anno-form">
			<div class="anno-ts mono">{t('annotations.pinnedTo')} <strong>{fmtTime(currentTime, true)}</strong></div>
			<textarea
				bind:value={draftText}
				placeholder={t('annotations.addPlaceholder')}
				rows="2"
				maxlength="1000"
				onkeydown={onKeydown}
				class="anno-input"
			></textarea>
			<div class="anno-actions">
				<button class="btn save-btn" onclick={save} disabled={!draftText.trim()}>{t('annotations.saveNote')}</button>
				<button class="btn cancel-btn" onclick={cancel}>{t('annotations.cancelNote')}</button>
			</div>
		</div>
	{/if}

	{#if saveError}
		<p class="anno-error">{saveError}</p>
	{/if}
	{#if annotations.length === 0 && !adding}
		<p class="anno-empty muted">{t('annotations.noNotes')}</p>
	{:else}
		<ul class="anno-list">
			{#each annotations as a (a.id)}
				<li class="anno-item" class:editing={editingId === a.id}>
					{#if editingId === a.id}
						<div class="anno-form">
							<div class="anno-ts mono">{t('annotations.timestampLabel')} <strong>{fmtTime(a.timestamp, true)}</strong></div>
							<textarea
								bind:value={draftText}
								rows="2"
								maxlength="1000"
								onkeydown={onKeydown}
								class="anno-input"
							></textarea>
							<div class="anno-actions">
								<button class="btn save-btn" onclick={save} disabled={!draftText.trim()}>{t('annotations.saveNote')}</button>
								<button class="btn cancel-btn" onclick={cancel}>{t('annotations.cancelNote')}</button>
							</div>
						</div>
					{:else}
						<button class="anno-seek" onclick={() => seekTo(a.timestamp)} aria-label={t('annotations.seekTo', { time: fmtTime(a.timestamp, true) })}>
							<span class="anno-marker"></span>
							<span class="anno-ts mono">{fmtTime(a.timestamp, true)}</span>
						</button>
						<span class="anno-text">{a.text}</span>
						{#if !readOnly}
							<div class="anno-item-actions">
								<button class="btn-icon" onclick={() => startEdit(a)} aria-label={t('annotations.editNote')}>
									<Pencil size={13} />
								</button>
								<button class="btn-icon danger" onclick={() => confirmDelete(a.id)} aria-label={t('annotations.deleteNote')}>
									<Trash2 size={13} />
								</button>
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.anno-panel {
		margin-top: 0.75rem;
	}
	.anno-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.anno-title {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.add-btn {
		font-size: 0.8rem;
		padding: 0.3rem 0.6rem;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.anno-empty {
		font-size: 0.85rem;
	}
	.anno-error {
		font-size: 0.8rem;
		color: #ef4444;
		margin: 0.5rem 0;
		padding: 0.35rem 0.6rem;
		background: #fef2f2;
		border-radius: var(--r-ctrl);
	}
	.anno-form {
		border: var(--bd);
		border-radius: var(--r-ctrl);
		padding: 0.6rem;
		margin-bottom: 0.5rem;
		background: var(--paper-inset);
	}
	.anno-ts {
		font-size: 0.78rem;
		color: var(--ink-2);
		margin-bottom: 0.4rem;
	}
	.anno-input {
		width: 100%;
		border: var(--bd);
		border-radius: var(--r-ctrl);
		padding: 0.4rem 0.5rem;
		font-size: 0.82rem;
		background: var(--paper);
		color: var(--ink);
		resize: vertical;
		font-family: inherit;
	}
	.anno-input:focus {
		outline: 2px solid var(--live);
		outline-offset: -1px;
	}
	.anno-actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.4rem;
		justify-content: flex-end;
	}
	.save-btn {
		font-size: 0.75rem;
		padding: 0.25rem 0.55rem;
		background: var(--live);
		color: var(--paper-raised);
		border-color: var(--live);
	}
	.save-btn:disabled {
		opacity: 0.4;
	}
	.cancel-btn {
		font-size: 0.75rem;
		padding: 0.25rem 0.55rem;
	}
	.anno-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.anno-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--bd);
	}
	.anno-item:last-child {
		border-bottom: none;
	}
	.anno-item.editing {
		display: block;
	}
	.anno-seek {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
		cursor: pointer;
		background: none;
		border: none;
		color: var(--ink-2);
		font-size: 0.78rem;
		padding: 0.15rem 0.35rem;
		border-radius: var(--r-ctrl);
		transition: background 0.15s;
	}
	.anno-seek:hover {
		background: var(--paper-inset);
		color: var(--ink);
	}
	.anno-marker {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--live);
		flex-shrink: 0;
	}
	.anno-text {
		flex: 1;
		font-size: 0.85rem;
		line-height: 1.35;
	}
	.anno-item-actions {
		display: flex;
		gap: 0.15rem;
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.anno-item:hover .anno-item-actions {
		opacity: 1;
	}
	.btn-icon {
		background: none;
		border: none;
		color: var(--ink-2);
		cursor: pointer;
		padding: 0.2rem;
		border-radius: var(--r-ctrl);
		display: flex;
	}
	.btn-icon:hover {
		background: var(--paper-inset);
		color: var(--ink);
	}
	.btn-icon.danger:hover {
		color: #ef4444;
	}
</style>
