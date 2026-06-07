# Sync Transparency, Export Polish & Observability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sync state transparency (last sync time, in-progress, partial/failure, retry), polish export behavior (schema version, stable CSV headers, robust TCX, preview), and add privacy-safe server logging with redaction.

**Architecture:** Three independent subsystems that share i18n keys and the settings page. Each subsystem can be implemented, tested, and verified independently. Only the locale files and settings page `.svelte` have cross-cutting changes.

**Tech Stack:** SvelteKit + Svelte 5 runes, Vitest, TypeScript, Cloudflare Workers

---

## Sub-Plan A: Logbook Sync Transparency

### Files Modified
- `src/lib/server/data.ts` — add `SyncFailure` tracking, `syncError` state to `SyncState`, `ScheduleConnectSync` now returns status
- `src/lib/server/db.ts` — extend `SyncState` with `lastError`/`lastErrorAt`/`inProgress`
- `src/routes/api/sync/+server.ts` — extended response shape
- `src/routes/api/sync/backfill/+server.ts` — extended response shape
- `src/routes/settings/+page.server.ts` — load sync error state
- `src/routes/settings/+page.svelte` — retry action, failure badge, in-progress spinner, demo explanation
- `src/routes/dashboard/+page.server.ts` — surface sync partial state
- `src/lib/locales/en.ts` — new sync keys
- `src/lib/locales/zh.ts` — new sync keys
- `src/lib/locales/de.ts` — new sync keys
- `src/lib/locales/es.ts` — new sync keys
- `src/lib/locales/fr.ts` — new sync keys
- `src/lib/locales/ja.ts` — new sync keys

### Files Created
- `src/lib/server/syncState.test.ts` — new tests for sync state transitions

### Tests Extended
- `src/lib/server/data.test.ts` — add tests for sync failure tracking, scheduleConnectSync status
- `src/routes/api/sync/server.test.ts` — add tests for error surfacing, in-progress guard
- `src/routes/settings/page.server.test.ts` — add tests for sync error/failure loading
- `src/routes/dashboard/page.server.test.ts` — add tests for partial sync rendering

### Task A1: Extend SyncState with error and in-progress fields

**Files:**
- Modify: `src/lib/server/db.ts:256-262`
- Modify: `src/lib/server/db.ts:264-290`
- Modify: `src/lib/server/db.ts:359-389`

- [ ] **Step 1: Add the new SyncState fields and extend getSyncState/setSyncState**

In `src/lib/server/db.ts`, update the `SyncState` interface:

```typescript
export interface SyncState {
	lastDate: string | null;
	lastSyncAt: number;
	total: number;
	oldestDate: string | null;
	backfillDone: boolean;
	/** True when a sync run is in flight (optimistic lock, set by the caller). */
	inProgress: boolean;
	/** Last non-empty error message, or null when the last run succeeded. */
	lastError: string | null;
	/** Epoch ms of the last error, or 0 when no error has occurred. */
	lastErrorAt: number;
}
```

Update `getSyncState` to read the new columns:

```typescript
export async function getSyncState(
	db: D1Database | undefined,
	userId: number
): Promise<SyncState | null> {
	if (!db) return null;
	try {
		const row = await db
			.prepare(
				'SELECT last_date, last_sync_at, total, oldest_date, backfill_done, in_progress, last_error, last_error_at FROM sync_state WHERE user_id = ?'
			)
			.bind(userId)
			.first<{
				last_date: string | null;
				last_sync_at: number;
				total: number;
				oldest_date: string | null;
				backfill_done: number;
				in_progress: number;
				last_error: string | null;
				last_error_at: number;
			}>();
		return row
			? {
					lastDate: row.last_date,
					lastSyncAt: row.last_sync_at,
					total: row.total,
					oldestDate: row.oldest_date,
					backfillDone: row.backfill_done === 1,
					inProgress: row.in_progress === 1,
					lastError: row.last_error,
					lastErrorAt: row.last_error_at ?? 0
				}
			: null;
	} catch {
		return null;
	}
}
```

Update `setSyncState` to persist the new fields:

```typescript
export async function setSyncState(
	db: D1Database,
	userId: number,
	patch: {
		lastDate: string | null;
		total: number;
		oldestDate: string | null;
		backfillDone: boolean;
		inProgress?: boolean;
		lastError?: string | null;
		lastErrorAt?: number;
	}
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO sync_state (user_id, last_date, last_sync_at, total, oldest_date, backfill_done, in_progress, last_error, last_error_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET
			   last_date=excluded.last_date,
			   last_sync_at=excluded.last_sync_at,
			   total=excluded.total,
			   oldest_date=excluded.oldest_date,
			   backfill_done=excluded.backfill_done,
			   in_progress=excluded.in_progress,
			   last_error=excluded.last_error,
			   last_error_at=excluded.last_error_at`
		)
		.bind(
			userId,
			patch.lastDate,
			nowEpochMillis(),
			patch.total,
			patch.oldestDate,
			patch.backfillDone ? 1 : 0,
			patch.inProgress ? 1 : 0,
			patch.lastError ?? null,
			patch.lastErrorAt ?? 0
		)
		.run();
}
```

You must also define `nowEpochMillis` as an import if not already present in db.ts. It should already be imported from `$lib/datetime`. Verify the import at top of db.ts.

- [ ] **Step 2: Add D1 migration for new columns**

Create `migrations/0012_sync_state_progress.sql`:

```sql
ALTER TABLE sync_state ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN last_error TEXT;
ALTER TABLE sync_state ADD COLUMN last_error_at INTEGER NOT NULL DEFAULT 0;
```

Run local migration:
```
npm run db:migrate:local
```

- [ ] **Step 3: Update existing tests for new SyncState shape**

In `src/lib/server/db.test.ts`, update any test that constructs a `SyncState` to include the new fields with defaults:
```typescript
inProgress: false,
lastError: null,
lastErrorAt: 0
```

Also update any `getSyncState` mock return values in `src/lib/server/data.test.ts` to include these fields.

Run: `npm run test -- src/lib/server/db.test.ts`
Expected: All existing tests pass with updated shape.

- [ ] **Step 4: Commit**

```bash
git add migrations/0012_sync_state_progress.sql src/lib/server/db.ts src/lib/server/db.test.ts src/lib/server/data.test.ts
git commit -m "feat: add inProgress/lastError fields to SyncState for sync transparency"
```

### Task A2: Track sync in-progress and error in runSync/backfillWorkouts/scheduleConnectSync

**Files:**
- Modify: `src/lib/server/data.ts:201-278` (runSync)
- Modify: `src/lib/server/data.ts:287-357` (backfillWorkouts)
- Modify: `src/lib/server/data.ts:371-390` (scheduleConnectSync)

- [ ] **Step 1: Extend SyncResult with sync status**

In `src/lib/server/data.ts`, update `SyncResult`:

```typescript
export interface SyncResult {
	added: number;
	total: number;
	newPbs: DistancePB[];
	workouts: Workout[];
	/** Populated when the sync fails — client uses this for retry UI. */
	error?: string;
}
```

- [ ] **Step 2: Wrap runSync with in-progress flag and error capture**

Modify `runSync` in `src/lib/server/data.ts` to set `inProgress=true` before and `inProgress=false` + error on catch:

```typescript
async function runSync(
	db: D1Database,
	userId: number,
	c: Concept2Client,
	full: boolean
): Promise<SyncResult> {
	// Mark in-progress so concurrent requests don't race.
	await setSyncState(db, userId, {
		lastDate: (await getSyncState(db, userId))?.lastDate ?? null,
		total: await countWorkouts(db, userId),
		oldestDate: (await getSyncState(db, userId))?.oldestDate ?? null,
		backfillDone: (await getSyncState(db, userId))?.backfillDone ?? false,
		inProgress: true
	});

	const state = await getSyncState(db, userId);
	const now = Temporal.Now.plainDateISO('UTC');
	const plan = planSync(state, now, full ? 'full' : 'forward');
	const from =
		plan.kind === 'window' ? plan.from : plan.kind === 'incremental' ? plan.from : undefined;

	let allBeforeFailed = false;
	const allBefore = await getAllWorkouts(db, userId).catch(() => {
		allBeforeFailed = true;
		return [] as Workout[];
	});
	const beforePbs = distancePBs(allBefore);

	let page = 1;
	let totalPages = 1;
	let added = 0;
	const synced: Workout[] = [];

	try {
		do {
			const { workouts, totalPages: tp } = await c.listWorkoutsPage(page, from);
			totalPages = tp;
			if (workouts.length) {
				await upsertWorkouts(db, userId, workouts);
				synced.push(...workouts);
				added += workouts.length;
			}
			page++;
		} while (page <= totalPages);

		const dates = synced.map((w) => w.date);
		let wm = mergeWatermark(
			{
				lastDate: state?.lastDate ?? null,
				oldestDate: state?.oldestDate ?? null,
				backfillDone: state?.backfillDone ?? false
			},
			dates,
			false
		);

		if (plan.kind === 'window') {
			wm = { ...wm, oldestDate: historyWindowStart(now), backfillDone: false };
		}
		if (full) {
			wm = { ...wm, backfillDone: true };
		}

		const total = await countWorkouts(db, userId);
		await setSyncState(db, userId, {
			lastDate: wm.lastDate,
			total,
			oldestDate: wm.oldestDate,
			backfillDone: wm.backfillDone,
			inProgress: false
		});

		let afterPbs: DistancePB[];
		if (allBeforeFailed) {
			afterPbs = distancePBs(await getAllWorkouts(db, userId));
		} else {
			const syncedById = new Map(synced.map((w) => [w.id, w]));
			const existingIds = new Set(allBefore.map((w) => w.id));
			const afterWorkouts = [
				...allBefore.map((w) => syncedById.get(w.id) ?? w),
				...synced.filter((w) => !existingIds.has(w.id))
			];
			afterPbs = distancePBs(afterWorkouts);
		}
		const newPbs = detectNewPBs(beforePbs, afterPbs);
		return { added, total, newPbs, workouts: synced };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		// Clear in-progress and record the error so the UI can surface it.
		await setSyncState(db, userId, {
			lastDate: state?.lastDate ?? null,
			total: await countWorkouts(db, userId),
			oldestDate: state?.oldestDate ?? null,
			backfillDone: state?.backfillDone ?? false,
			inProgress: false,
			lastError: msg,
			lastErrorAt: nowEpochMillis()
		}).catch(() => {});
		throw e;
	}
}
```

- [ ] **Step 3: Wrap backfillWorkouts with in-progress and error tracking**

Apply the same pattern to `backfillWorkouts` in `src/lib/server/data.ts`: set `inProgress=true` before the loop, `inProgress=false` + error on catch, `inProgress=false` on success.

```typescript
export async function backfillWorkouts(event: RequestEvent): Promise<BackfillResult> {
	const c = await client(event);
	const db = event.platform?.env?.DB;
	const userId = event.locals.user?.id;
	if (!c) throw error(401, 'Not authenticated.');
	if (!db || userId == null) throw error(500, 'Database (D1) is not configured.');

	const state = await getSyncState(db, userId);
	const now = Temporal.Now.plainDateISO('UTC');
	const plan = planSync(state, now, 'backfill');
	if (plan.kind !== 'backfill') {
		if (plan.kind === 'done' && state && !state.backfillDone) {
			await setSyncState(db, userId, {
				lastDate: state.lastDate,
				total: await countWorkouts(db, userId),
				oldestDate: state.oldestDate,
				backfillDone: true
			});
		}
		return {
			added: 0,
			oldestDate: state?.oldestDate ?? null,
			done: plan.kind === 'done'
		};
	}

	// Mark in-progress
	await setSyncState(db, userId, {
		lastDate: state?.lastDate ?? null,
		total: await countWorkouts(db, userId),
		oldestDate: state?.oldestDate ?? null,
		backfillDone: state?.backfillDone ?? false,
		inProgress: true
	});

	let page = 1;
	let totalPages = 1;
	let added = 0;
	const dates: string[] = [];
	let pagesFetched = 0;

	try {
		while (page <= totalPages && pagesFetched < BACKFILL_PAGES_PER_RUN) {
			const { workouts, totalPages: tp } = await c.listWorkoutsPage(page, undefined, plan.to);
			totalPages = tp;
			if (workouts.length) {
				await upsertWorkouts(db, userId, workouts);
				added += workouts.length;
				dates.push(...workouts.map((w) => w.date));
			}
			page++;
			pagesFetched++;
		}

		const wm = mergeWatermark(
			{
				lastDate: state?.lastDate ?? null,
				oldestDate: state?.oldestDate ?? null,
				backfillDone: state?.backfillDone ?? false
			},
			dates,
			dates.length === 0 || page > totalPages
		);

		const total = await countWorkouts(db, userId);
		await setSyncState(db, userId, {
			lastDate: wm.lastDate,
			total,
			oldestDate: wm.oldestDate,
			backfillDone: wm.backfillDone,
			inProgress: false
		});

		return { added, oldestDate: wm.oldestDate, done: wm.backfillDone };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await setSyncState(db, userId, {
			lastDate: state?.lastDate ?? null,
			total: await countWorkouts(db, userId),
			oldestDate: state?.oldestDate ?? null,
			backfillDone: state?.backfillDone ?? false,
			inProgress: false,
			lastError: msg,
			lastErrorAt: nowEpochMillis()
		}).catch(() => {});
		throw e;
	}
}
```

- [ ] **Step 4: Update scheduleConnectSync to reflect in-progress**

Modify `scheduleConnectSync` in `src/lib/server/data.ts` to allow the `waitUntil` promise to surface status indirectly. The `runSync` call inside it already sets `inProgress`. No structural change needed — just ensure the comment reflects the new behavior:

```typescript
/**
 * Right after a BYOT connect, kick a full history backfill into the D1 cache in
 * the background. Sets in_progress=1 in the sync_state row while running so the
 * dashboard can show a "syncing…" indicator; clears it on completion or error.
 * Runs via the Workers `waitUntil`; best-effort, no-op without Workers runtime.
 */
export function scheduleConnectSync(
	event: RequestEvent,
	sid: string,
	user: SessionUser,
	token: string
): void {
	// ... existing body unchanged
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/lib/server/data.test.ts`
Expected: scheduleConnectSync test still passes, plus any new tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/data.ts src/lib/server/data.test.ts
git commit -m "feat: track sync in-progress and error state for transparency"
```

### Task A3: Surface sync state in API responses

**Files:**
- Modify: `src/routes/api/sync/+server.ts`

- [ ] **Step 1: Include syncState in sync response**

Modify `src/routes/api/sync/+server.ts` to return `sync` state alongside the result:

```typescript
import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncWorkouts, syncStatus } from '$lib/server/data';

export const POST: RequestHandler = async (event) => {
	if (event.locals.demo) throw error(400, 'Sync is unavailable in demo mode.');
	const full = new URL(event.request.url).searchParams.get('full') === '1';
	try {
		const result = await syncWorkouts(event, full);
		const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
		return json({ ...result, sync }, { headers: { 'cache-control': 'private, no-store' } });
	} catch (e) {
		if (isHttpError(e)) throw e;
		const msg = e instanceof Error ? e.message : String(e);
		if (/no such table|D1_ERROR/i.test(msg)) {
			throw error(
				503,
				'Workout storage isn\'t set up yet — apply the D1 migrations and sync again.'
			);
		}
		// Surface the error so client can show retry UI
		const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
		throw error(502, `Sync failed: ${msg}`);
	}
};
```

- [ ] **Step 2: Add tests for sync response shape**

In `src/routes/api/sync/server.test.ts`, add:

```typescript
it('includes sync state in successful response', async () => {
	(syncWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue({
		added: 5, total: 10, workouts: [], newPbs: []
	});
	(syncStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
		lastDate: '2026-06-01', lastSyncAt: 1717000000000, total: 10,
		oldestDate: '2025-06-01', backfillDone: true,
		inProgress: false, lastError: null, lastErrorAt: 0,
		historyWindowMonths: 12
	});
	const event = fakeEvent();
	const res = await POST(event as any);
	const body = await res.json();
	expect(body.sync).toBeDefined();
	expect(body.sync.backfillDone).toBe(true);
});
```

Note: You'll need to add `syncStatus` to the mock imports in the test file. Update the `vi.mock('$lib/server/data', ...)` call to include `syncStatus: vi.fn()`.

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/routes/api/sync/server.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/sync/+server.ts src/routes/api/sync/server.test.ts
git commit -m "feat: include sync state in sync API response"
```

### Task A4: Add i18n keys for sync transparency

**Files:**
- Modify: `src/lib/locales/en.ts` (add new keys under `sync` and `settings`)
- Modify: `src/lib/locales/zh.ts`
- Modify: `src/lib/locales/de.ts`
- Modify: `src/lib/locales/es.ts`
- Modify: `src/lib/locales/fr.ts`
- Modify: `src/lib/locales/ja.ts`

- [ ] **Step 1: Add new English keys**

In `src/lib/locales/en.ts`, add a new top-level `sync` section after `settings`:

```typescript
sync: {
	loading: 'Syncing…',
	done: '{added} new · {total} total workouts cached',
	failed: 'Sync failed',
	incrementalDone: 'Caught up — {total} workouts cached',
	historyBackfilling: '{total} workouts · history back to {date}',
	historyComplete: 'Full history synced',
	historyWindow: 'Showing the last {months} months — loading older history…',
	retry: 'Retry sync',
	errorBadge: 'Last sync failed',
	errorHint: '{message}',
	demoUnavailable: 'Sync is unavailable in demo mode — connect your logbook to sync real data.',
	partialWarning: 'History is still loading — totals and PBs may be incomplete until the sync finishes.',
	inProgress: 'Sync in progress…',
},
```

Update `settings.lastSync` to include the error badge when applicable:

In `settings` add:
```typescript
lastSyncError: '{total} workouts · last sync failed: {message}',
partialCache: '{n} workouts cached · history still loading',
```

- [ ] **Step 2: Add keys to all other locales**

For each locale file (`zh.ts`, `de.ts`, `es.ts`, `fr.ts`, `ja.ts`), add the same structure with appropriate translations. If a locale file is large, use the `locales.test.ts` completeness check to verify:

Run: `npm run validate:locales`
Expected: All locales have the new keys (may warn about missing translations which is acceptable).

- [ ] **Step 3: Commit**

```bash
git add src/lib/locales/
git commit -m "i18n: add sync transparency keys to all locales"
```

### Task A5: Update settings page for sync transparency

**Files:**
- Modify: `src/routes/settings/+page.server.ts`
- Modify: `src/routes/settings/+page.svelte`
- Modify: `src/routes/settings/page.server.test.ts`

- [ ] **Step 1: Add SyncStatusPayload to settings page server load**

In `src/routes/settings/+page.server.ts`, import `SyncStatusPayload` from data and pass the sync state:

```typescript
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadHomeTimezone, loadWorkouts, syncStatus, type SyncStatusPayload } from '$lib/server/data';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.demo && !event.locals.user) {
		throw redirect(303, '/auth/login');
	}
	if (!event.locals.demo) {
		event.setHeaders({ 'cache-control': 'private, no-store' });
	}

	const workouts = await loadWorkouts(event);
	const sync: SyncStatusPayload | null = event.locals.demo ? null : await syncStatus(event).catch(() => null);
	const tcxWorkouts = workouts.filter((w) => w.hasStrokeData).map((w) => ({ id: w.id, date: w.date }));
	const homeTimezone = await loadHomeTimezone(event);
	return {
		demo: event.locals.demo,
		workoutCount: workouts.length,
		sync,
		tcxWorkouts,
		homeTimezone
	};
};
```

The change is: `sync` is now typed as `SyncStatusPayload | null` (was implicitly `SyncState & { historyWindowMonths } | null`).

- [ ] **Step 2: Update settings page Svelte to show error badge, in-progress spinner, retry**

In `src/routes/settings/+page.svelte`, update the sync section (around line 272):

Replace the sync status section after line 280 (`{#if data.demo}`) with:

```svelte
{#if data.demo}
	<span class="badge badge-soft badge-primary">{t('settings.syncDemo')}</span>
	<p class="muted small">{t('sync.demoUnavailable')}</p>
{:else}
	{#if data.sync?.inProgress}
		<div class="flex items-center gap-2">
			<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
			<span class="sync-meta muted">{t('sync.inProgress')}</span>
		</div>
	{:else if data.sync?.lastError}
		<span class="badge badge-soft badge-error">{t('sync.errorBadge')}</span>
		<p class="sync-meta muted">{t('settings.lastSyncError', { total: data.sync?.total ?? 0, message: data.sync.lastError })}</p>
	{:else if !data.sync?.backfillDone && data.sync}
		<p class="sync-meta muted">{t('sync.partialWarning')}</p>
	{/if}

	{#if !data.sync?.inProgress}
		{#if data.sync}
			<p class="sync-meta muted">{syncHistoryNote}</p>
			<p class="sync-meta muted">{t('settings.lastSync', { date: lastSyncLabel, total: data.sync.total })}</p>
		{:else}
			<p class="sync-meta muted">{t('settings.lastSync', { date: lastSyncLabel, total: 0 })}</p>
		{/if}
	{/if}
	<div class="row">
		<button
			class="btn btn-primary btn-sm"
			type="button"
			disabled={syncing || deleting || !!data.sync?.inProgress}
			onclick={() => runSync(false)}
		>
			{#if syncMode === 'incremental'}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
			{syncMode === 'incremental' ? t('sync.loading') : t('settings.syncIncremental')}
		</button>
		<button
			class="btn btn-ghost btn-sm"
			type="button"
			disabled={syncing || deleting || !!data.sync?.inProgress}
			onclick={() => runSync(true)}
		>
			{#if syncMode === 'full'}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
			{syncMode === 'full' ? t('sync.loading') : t('settings.syncFull')}
		</button>
		{#if data.sync?.lastError}
			<button
				class="btn btn-ghost btn-sm"
				type="button"
				disabled={syncing || deleting || !!data.sync?.inProgress}
				onclick={() => runSync(false)}
			>
				{#if syncMode === 'incremental'}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
				{syncMode === 'incremental' ? t('sync.loading') : t('sync.retry')}
			</button>
		{/if}
		{#if data.sync && !data.sync.backfillDone}
			<button
				class="btn btn-ghost btn-sm"
				type="button"
				disabled={syncing || deleting || !!data.sync?.inProgress}
				onclick={loadFullHistory}
			>
				{#if syncMode === 'history'}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
				{syncMode === 'history' ? t('sync.loading') : t('settings.loadFullHistory')}
			</button>
		{/if}
	</div>
{/if}
```

- [ ] **Step 3: Add tests for settings page sync state**

In `src/routes/settings/page.server.test.ts`, add:

```typescript
it('loads sync state with inProgress flag from D1', async () => {
	(loadWorkouts as Mock).mockResolvedValue([]);
	(syncStatus as Mock).mockResolvedValue({
		lastDate: '2026-06-01',
		lastSyncAt: 1717000000000,
		total: 5,
		oldestDate: '2025-01-01',
		backfillDone: false,
		inProgress: true,
		lastError: null,
		lastErrorAt: 0,
		historyWindowMonths: 12
	});
	const event = authedEvent();
	const result = await load(event);
	expect(result.sync?.inProgress).toBe(true);
});

it('loads sync state with error from D1', async () => {
	(loadWorkouts as Mock).mockResolvedValue([]);
	(syncStatus as Mock).mockResolvedValue({
		lastDate: null,
		lastSyncAt: 0,
		total: 0,
		oldestDate: null,
		backfillDone: false,
		inProgress: false,
		lastError: 'Network timeout',
		lastErrorAt: 1717000000000,
		historyWindowMonths: 12
	});
	const event = authedEvent();
	const result = await load(event);
	expect(result.sync?.lastError).toBe('Network timeout');
});
```

Make sure to import `loadWorkouts` and `syncStatus` and mock them in the test. The test file may need updated mocks — check the existing mock setup. If there is no `vi.mock` for the data module in this test file yet, add one:

```typescript
vi.mock('$lib/server/data', () => ({
	loadHomeTimezone: vi.fn().mockResolvedValue(undefined),
	loadWorkouts: vi.fn().mockResolvedValue([]),
	syncStatus: vi.fn().mockResolvedValue(null)
}));
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/routes/settings/page.server.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/+page.server.ts src/routes/settings/+page.svelte src/routes/settings/page.server.test.ts
git commit -m "feat: sync transparency — error badge, in-progress spinner, retry on settings page"
```

### Task A6: Dashboard partial-sync warning

**Files:**
- Modify: `src/routes/dashboard/+page.server.ts`
- Modify: `src/routes/dashboard/page.server.test.ts`

- [ ] **Step 1: Add partialSync flag to dashboard server load**

In `src/routes/dashboard/+page.server.ts`, add a `partialSync` boolean to the return:

```typescript
// After the syncStatus call
const sync = event.locals.demo ? null : await syncStatus(event).catch(() => null);
const partialSync = !event.locals.demo && !!sync && !sync.backfillDone;
```

Add `partialSync` to the return object:

```typescript
return {
	workouts,
	listWorkouts,
	listQuery,
	aggregates,
	sync,
	demo: event.locals.demo,
	firstRunEligible: firstRunEligible(event.locals.demo, event.locals.user),
	calendarEndDay,
	annualGoal,
	goalYear,
	homeTimezone,
	partialSync
};
```

- [ ] **Step 2: No Svelte change needed for now**

The dashboard already uses `sync` for the history note. The `partialSync` flag is available for future UI (e.g., a banner at the top of the dashboard). No visual change in this task — the flag is ready for the frontend.

- [ ] **Step 3: Add test for partialSync**

In `src/routes/dashboard/page.server.test.ts`, add:

```typescript
it('sets partialSync true when sync is incomplete', async () => {
	(syncStatus as Mock).mockResolvedValue({
		lastDate: '2026-06-01', lastSyncAt: 1717000000000, total: 5,
		oldestDate: '2025-01-01', backfillDone: false,
		inProgress: false, lastError: null, lastErrorAt: 0,
		historyWindowMonths: 12
	});
	const event = authedEvent();
	const result = await load(event);
	expect(result.partialSync).toBe(true);
});

it('sets partialSync false when sync is complete', async () => {
	(syncStatus as Mock).mockResolvedValue({
		lastDate: '2026-06-01', lastSyncAt: 1717000000000, total: 5,
		oldestDate: '2025-01-01', backfillDone: true,
		inProgress: false, lastError: null, lastErrorAt: 0,
		historyWindowMonths: 12
	});
	const event = authedEvent();
	const result = await load(event);
	expect(result.partialSync).toBe(false);
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/routes/dashboard/page.server.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/dashboard/+page.server.ts src/routes/dashboard/page.server.test.ts
git commit -m "feat: add partialSync flag to dashboard for incomplete history warning"
```

### Task A7: Add sync state transition tests

**Files:**
- Create: `src/lib/server/syncState.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { planSync, mergeWatermark, historyWindowStart, HISTORY_WINDOW_MONTHS } from './historyWindow';

describe('sync state transitions', () => {
	it('planSync: first connect returns window plan', () => {
		const now = Temporal.PlainDate.from('2026-06-07');
		const plan = planSync(null, now, 'forward');
		expect(plan.kind).toBe('window');
	});

	it('planSync: incremental after initial window sync', () => {
		const now = Temporal.PlainDate.from('2026-06-07');
		const state = {
			lastDate: '2026-06-01',
			oldestDate: '2025-06-01',
			backfillDone: false
		};
		const plan = planSync(state, now, 'forward');
		expect(plan.kind).toBe('incremental');
	});

	it('planSync: full forces re-sync with undefined from', () => {
		const now = Temporal.PlainDate.from('2026-06-07');
		const state = {
			lastDate: '2026-06-01',
			oldestDate: '2025-06-01',
			backfillDone: true
		};
		const plan = planSync(state, now, 'full');
		expect(plan.kind).toBe('incremental');
		expect((plan as { from: string | undefined }).from).toBeUndefined();
	});

	it('planSync: backfill when not done returns backfill plan', () => {
		const now = Temporal.PlainDate.from('2026-06-07');
		const state = {
			lastDate: '2026-06-01',
			oldestDate: '2025-06-01',
			backfillDone: false
		};
		const plan = planSync(state, now, 'backfill');
		expect(plan.kind).toBe('backfill');
	});

	it('planSync: backfill when done returns done plan', () => {
		const now = Temporal.PlainDate.from('2026-06-07');
		const state = {
			lastDate: '2026-06-01',
			oldestDate: '2025-06-01',
			backfillDone: true
		};
		const plan = planSync(state, now, 'backfill');
		expect(plan.kind).toBe('done');
	});

	it('mergeWatermark: moves oldest backward and lastDate forward', () => {
		const result = mergeWatermark(
			{ lastDate: '2026-01-01', oldestDate: '2025-12-01', backfillDone: false },
			['2026-06-01', '2025-06-01'],
			false
		);
		expect(result.lastDate).toBe('2026-06-01');
		expect(result.oldestDate).toBe('2025-06-01');
		expect(result.backfillDone).toBe(false);
	});

	it('mergeWatermark: sets backfillDone when reachedEnd is true', () => {
		const result = mergeWatermark(
			{ lastDate: '2026-01-01', oldestDate: '2025-12-01', backfillDone: false },
			['2025-06-01'],
			true
		);
		expect(result.backfillDone).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- src/lib/server/syncState.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/syncState.test.ts
git commit -m "test: sync state transition tests for planSync and mergeWatermark"
```

---

## Sub-Plan B: Export Polish

### Files Modified
- `src/lib/server/export.ts` — add JSON schema version, document CSV headers, make TCX robust, add export preview helper
- `src/routes/api/export/+server.ts` — cache-control, content-disposition
- `src/routes/api/export/[id]/+server.ts` — cache-control, content-disposition
- `src/routes/settings/+page.server.ts` — load export preview
- `src/routes/settings/+page.svelte` — show export preview text
- `src/lib/locales/en.ts` — new export keys
- `src/lib/locales/zh.ts` — new export keys
- `src/lib/locales/de.ts` — new export keys
- `src/lib/locales/es.ts` — new export keys
- `src/lib/locales/fr.ts` — new export keys
- `src/lib/locales/ja.ts` — new export keys

### Tests Extended
- `src/lib/server/export.test.ts` — add tests for JSON schema version, TCX robustness, export preview
- `src/routes/api/export/server.test.ts` — add tests for cache-control, filename format, auth/demo behavior
- `src/routes/api/export/[id]/server.test.ts` — add tests for malformed IDs, missing HR/stroke fields in TCX

### Task B1: Add JSON export schema version

**Files:**
- Modify: `src/lib/server/export.ts:64-88`

- [ ] **Step 1: Add version and schema metadata to JSON export**

Change `workoutsToJson`:

```typescript
const EXPORT_SCHEMA_VERSION = 1;

export function workoutsToJson(workouts: Workout[]): string {
	return JSON.stringify(
		{
			schema: 'rowplay-logbook-export',
			version: EXPORT_SCHEMA_VERSION,
			exportedAt: new Date().toISOString(),
			workoutCount: workouts.length,
			workouts: workouts.map((w) => ({
				id: w.id,
				date: w.date,
				sport: w.sport,
				distance: w.distance,
				time: w.time,
				pace: w.pace,
				strokeRate: w.strokeRate,
				strokeCount: w.strokeCount,
				heartRateAvg: w.heartRateAvg,
				hrMin: w.hrMin,
				hrMax: w.hrMax,
				caloriesTotal: w.caloriesTotal,
				wattMinutes: w.wattMinutes,
				dragFactor: w.dragFactor,
				workoutType: w.workoutType,
				comments: w.comments,
				hasStrokeData: w.hasStrokeData
			}))
		},
		null,
		2
	);
}
```

- [ ] **Step 2: Update tests**

In `src/lib/server/export.test.ts`, update `workoutsToJson` tests:

```typescript
describe('workoutsToJson', () => {
	it('produces valid JSON with schema metadata', () => {
		const json = workoutsToJson([makeWorkout({ id: 7 })]);
		const parsed = JSON.parse(json);
		expect(parsed.schema).toBe('rowplay-logbook-export');
		expect(parsed.version).toBe(1);
		expect(parsed.exportedAt).toBeDefined();
		expect(parsed.workoutCount).toBe(1);
		expect(Array.isArray(parsed.workouts)).toBe(true);
		expect(parsed.workouts[0].id).toBe(7);
		expect(parsed.workouts[0].sport).toBe('rower');
	});

	it('returns empty workouts array for no workouts', () => {
		const parsed = JSON.parse(workoutsToJson([]));
		expect(parsed.workoutCount).toBe(0);
		expect(parsed.workouts).toEqual([]);
	});

	it('includes all expected fields in each workout', () => {
		const json = workoutsToJson([makeWorkout()]);
		const row = JSON.parse(json).workouts[0];
		const expected = ['id', 'date', 'sport', 'distance', 'time', 'pace', 'hasStrokeData'];
		for (const key of expected) {
			expect(row).toHaveProperty(key);
		}
	});
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/lib/server/export.test.ts`
Expected: Updated tests pass. Old tests that expected flat array `parsed[0].id` now fail — update them.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/export.ts src/lib/server/export.test.ts
git commit -m "feat: add schema version and metadata to JSON export"
```

### Task B2: Document and make CSV headers stable

**Files:**
- Modify: `src/lib/server/export.ts:12-30`

- [ ] **Step 1: Add JSDoc and a header documentation comment**

Update the CSV_HEADERS constant:

```typescript
/**
 * CSV export column order (stable).
 * Columns match {@link Workout} fields:
 *   id              — Concept2 logbook ID
 *   date            — ISO-ish date string from logbook
 *   sport           — rower | skierg | bike
 *   distance_m      — total distance in metres
 *   time_s          — total elapsed time in seconds
 *   pace_s_per_500m — average pace in seconds per 500 m
 *   stroke_rate     — average strokes per minute (spm), or empty
 *   stroke_count    — total stroke count, or empty
 *   heart_rate_avg  — average heart rate (bpm), or empty
 *   hr_min          — minimum HR, or empty
 *   hr_max          — maximum HR, or empty
 *   calories        — total calories, or empty
 *   watt_minutes    — watt-minutes, or empty
 *   drag_factor     — drag factor setting, or empty
 *   workout_type    — workout type label, or empty
 *   comments        — free-text comments, or empty
 *   has_stroke_data — 1 when per-stroke data is available, 0 otherwise
 */
```

The `CSV_HEADERS` array itself does not change — it is already the stable header list.

- [ ] **Step 2: Run tests (existing should still pass)**

Run: `npm run test -- src/lib/server/export.test.ts`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/export.ts
git commit -m "docs: document CSV export schema with stable column reference"
```

### Task B3: Make TCX export robust for missing HR/stroke fields

**Files:**
- Modify: `src/lib/server/export.ts:164-178` (strokeTrackpoints)
- Modify: `src/lib/server/export.ts:114-162` (workoutDetailToTcx)

- [ ] **Step 1: Guard against missing strokes array**

In `workoutDetailToTcx`:

```typescript
export function workoutDetailToTcx(detail: WorkoutDetail): string {
	const name = detail.workoutType || `rowplay ${detail.id}`;
	const sport = SPORT_TCX[detail.sport];
	const start = tcxTime(detail.date, 0);
	const strokes = Array.isArray(detail.strokes) ? detail.strokes : [];
	const trackpoints = strokeTrackpoints(detail.date, strokes);

	// ... rest unchanged
```

- [ ] **Step 2: Guard strokeTrackpoints against missing fields**

In `strokeTrackpoints`, add null guards:

```typescript
function strokeTrackpoints(date: string, strokes: Stroke[]): string {
	if (!strokes.length) return '';
	return strokes
		.map((s) => {
			const t = typeof s.t === 'number' ? s.t : 0;
			const d = typeof s.d === 'number' ? s.d : 0;
			const parts = [
				`<Time>${xmlEscape(tcxTime(date, t))}</Time>`,
				`<DistanceMeters>${d.toFixed(1)}</DistanceMeters>`
			];
			if (typeof s.spm === 'number' && s.spm > 0) parts.push(`<Cadence>${Math.round(s.spm)}</Cadence>`);
			if (typeof s.hr === 'number' && s.hr > 0) parts.push(`<HeartRateBpm><Value>${s.hr}</Value></HeartRateBpm>`);
			if (typeof s.watts === 'number' && s.watts > 0) parts.push(`<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Watts>${Math.round(s.watts)}</Watts></TPX></Extensions>`);
			return `\n        <Trackpoint>${parts.join('')}</Trackpoint>`;
		})
		.join('');
}
```

- [ ] **Step 3: Add tests for robust TCX behavior**

In `src/lib/server/export.test.ts`, add:

```typescript
it('handles strokes with missing t, d, spm, hr gracefully', () => {
	const d: WorkoutDetail = {
		...detail,
		strokes: [
			// All fields null/undefined — should not throw
			{ t: undefined as unknown as number, d: undefined as unknown as number, pace: 0, spm: 0, watts: 0 },
			// Missing optional fields
			{ t: 100, d: 500, pace: 0, spm: 0, watts: 0 },
		]
	};
	expect(() => workoutDetailToTcx(d)).not.toThrow();
	const tcx = workoutDetailToTcx(d);
	expect(tcx).toContain('<Trackpoint>');
});

it('handles undefined strokes array', () => {
	const d = { ...detail, strokes: undefined as unknown as Stroke[] };
	expect(() => workoutDetailToTcx(d)).not.toThrow();
});

it('skips Cadence when spm is 0 or missing', () => {
	const d: WorkoutDetail = {
		...detail,
		strokes: [{ t: 0, d: 0, pace: 120, spm: 0, watts: 120 }]
	};
	const tcx = workoutDetailToTcx(d);
	expect(tcx).not.toContain('<Cadence>');
});

it('skips HeartRateBpm when hr is null or 0', () => {
	const d: WorkoutDetail = {
		...detail,
		strokes: [{ t: 0, d: 0, pace: 120, spm: 28, watts: 120 }]
	};
	const tcx = workoutDetailToTcx(d);
	expect(tcx).not.toContain('<HeartRateBpm>');
});

it('skips watts Extension when watts is 0', () => {
	const d: WorkoutDetail = {
		...detail,
		strokes: [{ t: 0, d: 0, pace: 120, spm: 28, watts: 0 }]
	};
	const tcx = workoutDetailToTcx(d);
	expect(tcx).not.toContain('<Watts>');
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/lib/server/export.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/export.ts src/lib/server/export.test.ts
git commit -m "fix: make TCX export robust against missing HR, stroke, and pace fields"
```

### Task B4: Add export preview text on settings page

**Files:**
- Modify: `src/routes/settings/+page.server.ts`
- Modify: `src/routes/settings/+page.svelte`

- [ ] **Step 1: Add i18n keys for export preview**

In `src/lib/locales/en.ts` under `settings`, add:

```typescript
exportPreviewCsv: 'CSV: one row per workout, stable column order (17 columns)',
exportPreviewJson: 'JSON: array wrapped with schema metadata (version 1)',
exportPreviewTcx: 'TCX 2.0: per-stroke trackpoints, Garmin/Strava compatible',
noTcxAvailable: 'No workouts with per-stroke data for TCX export.',
```

Add corresponding keys to all other locale files (`zh.ts`, `de.ts`, `es.ts`, `fr.ts`, `ja.ts`).

- [ ] **Step 2: Update settings page server load**

In `src/routes/settings/+page.server.ts`, the `tcxWorkouts` list is already available. Add an `exportHasCsv` and `exportHasJson` flag:

```typescript
return {
	demo: event.locals.demo,
	workoutCount: workouts.length,
	sync,
	tcxWorkouts,
	homeTimezone,
	exportHasWorkouts: workouts.length > 0
};
```

- [ ] **Step 3: Add preview text to settings Svelte**

In `src/routes/settings/+page.svelte`, update the export section (around line 247). Add preview descriptions after the download buttons:

```svelte
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
		<p class="muted small">{t('settings.exportPreviewCsv')}</p>
		<p class="muted small">{t('settings.exportPreviewJson')}</p>
		{#if data.tcxWorkouts.length}
			<p class="muted small">{t('settings.exportTcxNote')}</p>
			<p class="muted small">{t('settings.exportPreviewTcx')}</p>
			<ul class="tcx-list">
				{#each data.tcxWorkouts as w (w.id)}
					<li>
						<a href="/api/export/{w.id}?format=tcx" download>{t('settings.exportTcx', { id: w.id })}</a>
						<span class="muted">{w.date}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted small">{t('settings.noTcxAvailable')}</p>
		{/if}
	</div>
</article>
```

- [ ] **Step 4: Run tests and build**

Run: `npm run test -- src/routes/settings/page.server.test.ts`
Run: `npm run validate:locales`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/+page.server.ts src/routes/settings/+page.svelte src/lib/locales/
git commit -m "feat: add export preview text and format descriptions on settings page"
```

### Task B5: Add export route tests for filenames, content-type, cache-control, auth/demo, malformed IDs

**Files:**
- Modify: `src/routes/api/export/server.test.ts`
- Modify: `src/routes/api/export/[id]/server.test.ts`

- [ ] **Step 1: Add cache-control and filename tests to bulk export**

In `src/routes/api/export/server.test.ts`, add:

```typescript
it('sets cache-control: private, no-store', async () => {
	(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
	const res = await GET(fakeEvent('json') as any);
	expect(res.headers.get('cache-control')).toBe('private, no-store');
});

it('sets content-disposition with attachment filename', async () => {
	(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
	const res = await GET(fakeEvent('csv') as any);
	const disposition = res.headers.get('content-disposition');
	expect(disposition).toContain('attachment');
	expect(disposition).toMatch(/filename="rowplay-logbook-\d{4}-\d{2}-\d{2}\.csv"/);
});

it('sets content-type with charset=utf-8 for csv', async () => {
	(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
	const res = await GET(fakeEvent('csv') as any);
	expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
});

it('returns json with correct charset', async () => {
	(loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
	const res = await GET(fakeEvent('json') as any);
	expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
});
```

- [ ] **Step 2: Add TCX export tests for content-type and malformed IDs**

In `src/routes/api/export/[id]/server.test.ts`, add:

```typescript
it('throws 400 for zero or negative id', async () => {
	await expect(GET(fakeEvent('0') as any)).rejects.toMatchObject({ status: 400 });
	await expect(GET(fakeEvent('-1') as any)).rejects.toMatchObject({ status: 400 });
});

it('throws 400 for fractional id', async () => {
	await expect(GET(fakeEvent('1.5') as any)).rejects.toMatchObject({ status: 400 });
});

it('throws 400 for non-numeric id with letters', async () => {
	await expect(GET(fakeEvent('abc123') as any)).rejects.toMatchObject({ status: 400 });
});

it('sets correct content-type for tcx', async () => {
	(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
	const res = await GET(fakeEvent('1001', 'tcx') as any);
	expect(res.headers.get('content-type')).toBe('application/vnd.garmin.tcx+xml; charset=utf-8');
});

it('sets cache-control: private, no-store', async () => {
	(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
	const res = await GET(fakeEvent('1001', 'tcx') as any);
	expect(res.headers.get('cache-control')).toBe('private, no-store');
});

it('sets content-disposition with filename', async () => {
	(loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
	const res = await GET(fakeEvent('1001', 'tcx') as any);
	expect(res.headers.get('content-disposition')).toContain('filename="rowplay-workout-1001.tcx"');
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/routes/api/export/`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/export/server.test.ts src/routes/api/export/\[id\]/server.test.ts
git commit -m "test: add export route tests for content-type, cache-control, filenames, malformed IDs"
```

---

## Sub-Plan C: Privacy-Safe Observability

### Files Modified
- `src/lib/server/data.ts` — import logger, use for sync errors
- `.kiro/steering/tech.md` — document logging convention
- `AGENTS.md` — document logging convention

### Files Created
- `src/lib/server/logger.ts` — privacy-safe logger wrapper
- `src/lib/server/logger.test.ts` — redaction tests

### Task C1: Create privacy-safe logger wrapper

**Files:**
- Create: `src/lib/server/logger.ts`
- Create: `src/lib/server/logger.test.ts`

- [ ] **Step 1: Write the failing test first**

`src/lib/server/logger.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createLogger, redact, REDACTED } from './logger';

describe('redact', () => {
	it('returns the value unchanged when no patterns match', () => {
		expect(redact('Workout sync completed')).toBe('Workout sync completed');
	});

	it('redacts Concept2 API tokens (32-char hex)', () => {
		expect(redact('Token: abcdef0123456789abcdef0123456789')).toBe('Token: ' + REDACTED);
	});

	it('redacts session cookie values', () => {
		expect(redact('rp_tok=sealed-value-here;')).toContain(REDACTED);
	});

	it('redacts SESSION_SECRET-like strings', () => {
		expect(redact('secret=super-secret-key-12345')).toContain(REDACTED);
	});

	it('redacts Authorization headers', () => {
		expect(redact('Authorization: Bearer token123')).toContain(REDACTED);
	});

	it('redacts full workout payloads (large JSON-like bodies)', () => {
		const payload = '{"workouts":[{"id":1,"date":"2026-01-01","strokes":[{ ... }]}]}';
		expect(redact(payload)).toContain(REDACTED);
	});

	it('redacts multi-line workout detail', () => {
		const detail = 'workoutDetail: {\n  id: 1001,\n  strokes: [...]\n}';
		const result = redact(detail);
		expect(result).toContain(REDACTED);
		expect(result).not.toContain('strokes:');
	});

	it('handles non-string inputs gracefully', () => {
		expect(redact(null)).toBe(String(null));
		expect(redact(undefined)).toBe(String(undefined));
		expect(redact(42)).toBe('42');
	});
});

describe('createLogger', () => {
	it('redacts all arguments before passing to console.error', () => {
		const errors: unknown[][] = [];
		const fakeConsole = { error: vi.fn((...args: unknown[]) => errors.push(args)) };
		const log = createLogger(fakeConsole as unknown as Console);

		log.error('Sync failed with token', 'abc123def456...token-value');
		expect(fakeConsole.error).toHaveBeenCalled();
		const firstArg = errors[0]?.[0];
		expect(firstArg).not.toContain('abc123');
	});

	it('does not redact safe log messages', () => {
		const errors: unknown[][] = [];
		const fakeConsole = { error: vi.fn((...args: unknown[]) => errors.push(args)) };
		const log = createLogger(fakeConsole as unknown as Console);

		log.error('D1 query failed: no such table: workouts');
		expect(errors[0]?.[0]).toBe('D1 query failed: no such table: workouts');
	});

	it('redacts objects containing tokens', () => {
		const errors: unknown[][] = [];
		const fakeConsole = { error: vi.fn((...args: unknown[]) => errors.push(args)) };
		const log = createLogger(fakeConsole as unknown as Console);

		log.error('Config error', { baseUrl: 'https://log.concept2.com', token: 'secret123' });
		const logged = JSON.stringify(errors[0]);
		expect(logged).not.toContain('secret123');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/server/logger.test.ts`
Expected: FAIL — `Cannot find module './logger'`

- [ ] **Step 3: Implement the logger**

`src/lib/server/logger.ts`:

```typescript
/**
 * Privacy-safe logger for Cloudflare Workers / SvelteKit server.
 *
 * Redacts before writing to console so personal tokens, raw cookies, full
 * workout payloads, and session secrets are never emitted to Workers logs.
 *
 * Use `createLogger(console)` in production; tests inject a fake console.
 */

export const REDACTED = '[REDACTED]';

/** Patterns that match personally sensitive data. Applied before logging. */
const SENSITIVE_PATTERNS: RegExp[] = [
	// Concept2 API token: 32-character hex string
	/\b[a-f0-9]{32,}\b/gi,
	// rp_tok cookie value
	/rp_tok=[^;]+/gi,
	// session cookie value
	/session=[^;]+/gi,
	// Authorization header
	/Authorization:\s*Bearer\s+\S+/gi,
	// SESSION_SECRET env value (if accidentally logged)
	/SESSION_SECRET[=:]\s*\S+/gi,
	// Full workout payloads (JSON array/blob of workout data > 200 chars)
	/\{(?:[^{}]|\{[^{}]*\}){200,}\}/g,
	// Multi-line debug dumps of workout detail
	/workoutDetail:\s*\{[\s\S]*?\b(strokes|splits)\b[\s\S]*?\}/gi,
];

/**
 * Redact sensitive content from a string. Idempotent — safe to call on
 * already-redacted strings.
 */
export function redact(value: unknown): string {
	if (typeof value !== 'string') return String(value);
	let result = value;
	for (const pattern of SENSITIVE_PATTERNS) {
		result = result.replace(pattern, REDACTED);
	}
	return result;
}

function redactArgs(args: unknown[]): unknown[] {
	return args.map((a) => {
		if (typeof a === 'string') return redact(a);
		if (a instanceof Error) {
			return new Error(redact(a.message));
		}
		if (typeof a === 'object' && a !== null) {
			try {
				return JSON.parse(redact(JSON.stringify(a)));
			} catch {
				return a;
			}
		}
		return a;
	});
}

export interface Logger {
	error(...args: unknown[]): void;
	warn(...args: unknown[]): void;
}

export function createLogger(consoleObj: Pick<Console, 'error' | 'warn'>): Logger {
	return {
		error(...args: unknown[]) {
			consoleObj.error(...redactArgs(args));
		},
		warn(...args: unknown[]) {
			consoleObj.warn(...redactArgs(args));
		}
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/server/logger.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/logger.ts src/lib/server/logger.test.ts
git commit -m "feat: add privacy-safe logger with redaction for personal tokens and payloads"
```

### Task C2: Wire logger into server error paths

**Files:**
- Modify: `src/lib/server/data.ts` — add logger for sync errors
- Modify: `src/lib/server/concept2.ts` — add logger for API failures (optionally)

- [ ] **Step 1: Import and use logger in data.ts**

At the top of `src/lib/server/data.ts`, add:

```typescript
import { createLogger } from './logger';
const logger = createLogger(console);
```

In the `catch` blocks of `runSync` and `backfillWorkouts`, add a log before rethrowing:

```typescript
} catch (e) {
	const msg = e instanceof Error ? e.message : String(e);
	logger.error('[sync] runSync failed:', msg);
	await setSyncState(db, userId, {
		// ... existing cleanup
	}).catch(() => {});
	throw e;
}
```

In `scheduleConnectSync`, the `runSync` call already has `.catch(() => {})` — add a log there:

```typescript
ctx.waitUntil(runSync(db, user.id, c, true).catch((e) => {
	logger.error('[sync] connectSync background sync failed:', e instanceof Error ? e.message : String(e));
}));
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- src/lib/server/data.test.ts`
Expected: All pass. The logger is transparent to tests — console.error is silenced by Vitest.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/data.ts
git commit -m "feat: wire privacy-safe logger into sync error paths"
```

### Task C3: Document logging convention

**Files:**
- Modify: `.kiro/steering/tech.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add logging section to tech.md**

After line 65 (end of Backend section) in `.kiro/steering/tech.md`, add:

```markdown
### Server Observability (Privacy-Safe)

- Use `createLogger(console)` from `src/lib/server/logger.ts` instead of raw `console.error` / `console.warn` in server code.
- Errors **worth logging** (non-exhaustive):
  - Concept2 API failure
  - Sync failure
  - D1/KV failure
  - Invalid sealed token (BYOT cookie)
  - Replay detail cache miss
- Logs **must never** include:
  - Personal Concept2 tokens (sealed or plaintext)
  - Raw `rp_tok` or session cookie values
  - Full workout payloads (JSON with strokes/splits)
  - Personally sensitive fields (names, emails)
- `redact()` runs a regex allow/deny list before `console.error` receives the message; the underlying `console` object is injected so tests can assert redaction.
```

- [ ] **Step 2: Add logging reference to AGENTS.md**

At the bottom of `AGENTS.md`, before the quality gate section, add:

```markdown
## Server logging

- Use `{ createLogger }` from `src/lib/server/logger.ts`, not bare `console.error`.
- All server-originated `console.error` calls must go through the logger so
  personal tokens, cookie values, and full workout payloads are redacted before
  emission to Workers logs. See `.kiro/steering/tech.md#server-observability`.
```

- [ ] **Step 3: Commit**

```bash
git add .kiro/steering/tech.md AGENTS.md
git commit -m "docs: add privacy-safe logging convention to tech.md and AGENTS.md"
```

---

## Summary of All Changes

| Subsystem | Files Changed | New Files | Test Files Changed | New Test Files |
|-----------|--------------|-----------|---------------------|-----------------|
| A: Sync Transparency | 14 | 1 | 5 | 1 |
| B: Export Polish | 10 | 0 | 3 | 0 |
| C: Observability | 3 | 2 | 0 | 1 |
| **Total** | **27** | **3** | **8** | **2** |

### Quality Gate (after all changes)

```
npm run check
npm run test
npm run build
npm run validate:locales
```
