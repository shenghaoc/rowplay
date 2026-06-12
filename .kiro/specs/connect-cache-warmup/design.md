# Snappy BYOT connect & dashboard loads — Design

## Overview

Four localized changes, no replay/renderer impact. Two are perceived-latency wins
(A, B), one is a correctness guard that the perf work made necessary (C), one is a
small de-dup (D).

```
A. Connect feedback   submit → pending state (disable + spinner) until redirect/error
B. Warm on connect    connect → waitUntil(full backfill into D1)  [Workers runtime]
C. Honest reads       D1 is the full history ONLY after a sync completes (sync_state);
                      otherwise serve a live page, never persisted
D. De-dup             loadWorkouts memoised per request (one live page on cold load)
```

The ordering matters: A/B make the common path fast, while C ensures the fast path is
never _wrong_ — a half-filled cache (mid-backfill, failed backfill, or `waitUntil`
unavailable) must not masquerade as the complete logbook.

## A. Connect submit feedback — `auth/token/+page.svelte`

`use:enhance` with an inline submit function drives a `submitting` rune:

```svelte
let submitting = $state(false);
<form method="POST" use:enhance={() => {
  submitting = true;
  return async ({ update }) => { await update(); submitting = false; };
}}>
  <button class="btn btn-primary" type="submit" disabled={submitting} aria-busy={submitting}>
    {#if submitting}<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>{/if}
    {submitting ? t('token.connecting') : t('token.connect')}
  </button>
</form>
```

- On **success** the action throws `redirect(303, '/dashboard')`; `update()` follows it
  and the form unmounts, so the spinner naturally persists through navigation.
- On **failure** (`fail(...)`) `update()` re-renders `form.error` and `submitting`
  resets, re-enabling the button.
- Inlining the callback lets Svelte infer the `SubmitFunction` type (no import).
- New i18n key `token.connecting` ("Connecting…") in `en, zh, de, es, fr, ja`.

Matches the existing loading convention (`settings` uses `disabled={syncing}`;
`LiveModePanel` uses `loading loading-spinner`).

## B. Warm the cache on connect — `data.ts`, `auth/token/+page.server.ts`, `app.d.ts`

The paging loop is extracted from `syncWorkouts` into a reusable core so it can run
without a `RequestEvent`:

```ts
async function runSync(
  db: D1Database,
  userId: number,
  c: Concept2Client,
  full: boolean,
): Promise<SyncResult>;
export async function syncWorkouts(event, full = false) {
  // /api/sync path
  const c = await client(event);
  /* …guards… */ return runSync(db, userId, c, full);
}
```

`scheduleConnectSync` is called from the connect action right after the cookies are
set, before the redirect:

```ts
export function scheduleConnectSync(event, sid, user, token): void {
  const env = event.platform?.env;
  const ctx = event.platform?.context;
  const db = env?.DB;
  if (!db || !env?.SESSIONS || typeof ctx?.waitUntil !== "function") return; // dev no-op
  const session = { user, personal: true, tokens: { accessToken: token /* … */ } };
  const c = new Concept2Client(getConfig(event), env.SESSIONS, sid, session);
  ctx.waitUntil(runSync(db, user.id, c, /* full */ true).catch(() => {}));
}
```

Why build the client directly instead of `syncWorkouts(event)`:

- On connect, `event.locals.sessionId` is `null` (the session cookie was just _set_,
  not read by hooks), so `client(event)` would return `null`.
- Re-reading the just-written KV session risks read-after-write lag → a background read
  could miss and 401.
- The token is already validated and in hand; constructing the client with it captures
  everything synchronously (`db`, `c`, `user.id`) so the background task never reaches
  back into the post-response `event`.

Privacy: KV still stores an **empty** access token (unchanged from
`concept2-token-privacy`); the real token lives only in the cookie and this transient
in-memory client.

Types: `app.d.ts` gains `Platform.context: ExecutionContext` so `waitUntil` is typed.

## C. Honest reads — gate D1 on completed sync (`data.ts`)

The cache is authoritative only once `runSync` has written `sync_state` at the end of a
full page-through. A per-request memo avoids redundant reads:

```ts
const syncStateByEvent = new WeakMap<RequestEvent, Promise<SyncState | null>>();
function syncStateFor(event): Promise<SyncState | null> {
  /* memoise getSyncState */
}
```

Applied to every reader that could otherwise expose a partial cache:

- `loadWorkouts` — `if (db && userId != null && (await syncStateFor(event)))` → D1, else
  serve `c.listWorkouts()` **without persisting**.
- `loadWorkoutList` — same gate before the `countWorkouts`/`queryWorkouts` branch; else
  fall back to `filterAndSortWorkouts(await loadWorkouts(event), …)`.
- `loadDashboardAggregates` — `if (!(await syncStateFor(event))) return null;` so the
  dashboard computes stats client-side from the live page instead of from partial SQL
  aggregates.
- `syncStatus` — now just returns `syncStateFor(event)` (dedups the dashboard's existing
  status read with the gate).

This also closes a latent pre-existing window: a first _manual_ sync filling an empty D1
incrementally could previously be read as complete mid-flight.

### Why not keep the lazy-fill?

An earlier iteration persisted the cold live page into D1 (best-effort, no sync state) for
speed. Review (PR #75, Codex P1) flagged that this makes a partial page indistinguishable
from a completed sync whenever the background sync is unavailable / fails / is mid-flight —
skewing PBs/aggregates/export. With reads gated on sync state, a persisted partial page is
never read anyway, so the lazy-fill is pointless and was removed. Speed is restored by B
(the background backfill writes sync state, flipping the gate to D1).

## D. De-dup the cold load — `data.ts`

```ts
const workoutsByEvent = new WeakMap<RequestEvent, Promise<Workout[]>>();
export function loadWorkouts(event): Promise<Workout[]> {
  /* memoise loadWorkoutsFresh */
}
```

A single dashboard load calls `loadWorkouts` directly **and** via `loadWorkoutList`'s cold
fallback; without the memo that races two live pages on first connect. Safe because
`filterAndSortWorkouts` is pure (it `.filter()`s and copies before `.sort()`), so sharing
the array can't cross-mutate consumers. Keyed by the request event → GC'd with the request.

## Sequence (first connect, large logbook)

```
POST /auth/token → validate (fetchMe) → seal cookie → scheduleConnectSync(waitUntil) → 303
  └ background: runSync pages full history → upsert → setSyncState (gate flips)
GET /dashboard (immediately): syncStateFor=null → live page (de-duped), aggregates=null
GET /dashboard (after backfill): syncStateFor set → D1 (fast, complete)
```

## Trade-offs

- During the (short) window between connect and backfill completion, navigations serve a
  fresh live page (~1s) rather than a cached one — correctness over a few seconds of
  cold-window latency. A possible follow-up: when the whole history fits one page
  (`totalPages === 1`), persist **and** write sync state in the cold path — safe because
  that page genuinely _is_ the complete history — to make small logbooks instant.
- `vite dev` has no `waitUntil`/D1, so connect doesn't warm and every load is live; this is
  acceptable (dev defaults to demo mode).

## Testing

- Automated gate: `check` (0 errors), `test`, `build`, `validate:locales`.
- The data layer has no isolated unit harness today (the only data-layer test mocks
  `loadWorkouts` wholesale); a faithful test of the gate/memo/`waitUntil` needs D1/KV/ctx
  mocks. Deferred — noted as a follow-up.
- Manual on `pnpm run preview` (maintainer, needs a real token + `SESSION_SECRET`): connect →
  dashboard shows a live page immediately → after a moment, navigations are D1-fast and span
  the full history; `rp_tok` stays HttpOnly and KV holds no token.

## Out of scope

- The single-page fast-path optimization above (follow-up).
- Auto-refreshing an open dashboard when the background backfill lands (next navigation /
  LiveMode poll already picks it up).
- Moving the data layer onto a testable harness.
