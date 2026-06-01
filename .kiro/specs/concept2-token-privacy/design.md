# Concept2 Token Privacy — Design

## Overview

Three changes, each localized, no replay/renderer impact:

```
A. Token holding   paste → validate (fetchMe) → SEAL into httpOnly `rp_tok` cookie
                   KV session keeps identity only (no token)
                   client() opens the cookie per request to call Concept2

B. Data default    personal session ⇒ read Concept2 LIVE, write nothing to D1
                   (OAuth session unchanged; demo unchanged)

C. Leaderboard     publish = the one explicit write to shared storage
                   + withdraw (delete) = the symmetric, reversible opt-out
```

The seam we exploit: `event.locals` already distinguishes `demo` vs real, and the
session already carries a `personal` flag. We surface `personal` on `locals`, then
branch the data layer on it. Token handling moves from "stored in KV, read from
session" to "sealed in a cookie, opened on demand."

```
hooks.server.ts ──reads KV session──> locals.user / locals.personal   (identity only)
data.ts/client() ──opens rp_tok cookie──> Concept2Client               (credential, per request)
data loaders ──branch on locals.personal──> live API  | D1 (OAuth) | mock (demo)
```

## A. Token holding — sealed httpOnly cookie

### A.1 Crypto module — `src/lib/server/tokenCrypto.ts` (new, unit-tested)

WebCrypto AES-GCM (same primitive family already used by the ErgData webhook
HMAC verifier, so no new dependency). Key derived from `SESSION_SECRET`.

```ts
// Derive a 256-bit AES-GCM key from SESSION_SECRET (SHA-256 of the secret bytes).
async function deriveKey(secret: string): Promise<CryptoKey>;

// base64url( iv(12 bytes) || ciphertext ) — authenticated (GCM tag included).
export async function sealToken(secret: string, plaintext: string): Promise<string>;

// Returns the plaintext, or null when the blob is malformed / tampered / wrong key.
export async function openToken(secret: string, blob: string): Promise<string | null>;
```

- `sealToken`: random 12-byte IV via `crypto.getRandomValues`, `encrypt` with
  AES-GCM, concatenate `iv || ct`, base64url-encode.
- `openToken`: decode, split IV/ct, `decrypt`; any throw (bad tag, bad input) →
  `null`. Never throws to callers; the caller treats `null` as "no credential."
- No secret material, IV, or plaintext is ever logged.

### A.2 Cookie + session shape

- New cookie **`rp_tok`**: `httpOnly`, `secure` (on https), `sameSite: 'lax'`,
  `path: '/'`, `maxAge` = 30 days (matches the session cookie). Value = sealed
  token. Constant added next to `SESSION_COOKIE` in `session.ts`
  (`TOKEN_COOKIE = 'rp_tok'`).
- `SessionData.tokens.accessToken` becomes **optional**. For personal sessions it
  is written empty (`''`); the real token lives in the cookie. OAuth sessions are
  untouched (they still keep `accessToken`/`refreshToken` in KV — they need the
  refresh token, and OAuth tokens are not the athlete's own long-lived
  credential).
- `locals` gains `personal: boolean` (set in hooks from `session.personal`), so
  data loaders can branch without re-reading the session.

### A.3 Connect — `auth/token/+page.server.ts`

After `fetchMe` validates the token (unchanged):

1. `const secret = env.SESSION_SECRET` — if missing, `fail(500, tr('token.serverMisconfigured'))`.
2. `const sealed = await sealToken(secret, token)`.
3. Write KV session **without** the token: `tokens: { accessToken: '', refreshToken: '', expiresAt: now + YEAR, scope: '' }`, `personal: true`.
4. Set `SESSION_COOKIE` (as today) **and** `TOKEN_COOKIE = sealed` with the same cookie options.
5. Redirect to `/dashboard` (unchanged; stays outside the try/catch).

The raw token never enters KV and never leaves the server in a response body.

### A.4 Hooks — `hooks.server.ts`

Unchanged identity flow (still reads KV session → `locals.user`). One addition:
`event.locals.personal = session.personal === true`. The token cookie is **not**
read here — it is opened lazily only when a Concept2 call is actually needed
(`client()`), keeping non-API requests cheap and limiting where the plaintext
token exists in memory.

### A.5 Client construction — `data.ts > client(event)`

```ts
async function client(event): Promise<Concept2Client | null> {
  const env = event.platform?.env;
  if (!env?.SESSIONS || !event.locals.sessionId) return null;
  const session = await readSession(env.SESSIONS, event.locals.sessionId);
  if (!session) return null;

  if (session.personal) {
    // BYOT: the credential lives in the cookie, never in KV.
    const sealed = event.cookies.get(TOKEN_COOKIE);
    const secret = env.SESSION_SECRET;
    const token = sealed && secret ? await openToken(secret, sealed) : null;
    if (!token) return null;                 // missing/rotated/tampered ⇒ reconnect
    session.tokens = { ...session.tokens, accessToken: token };
  }
  return new Concept2Client(getConfig(event), env.SESSIONS, event.locals.sessionId, session);
}
```

`Concept2Client.accessToken()` already returns `tokens.accessToken` directly for
`personal` sessions (concept2.ts:114) — so injecting the opened token into the
in-memory session object is all that's needed; the client class is **unchanged**.

When `client()` returns `null` for a personal session (no/invalid cookie), the
existing callers already throw `401 Not authenticated` — which the UI funnels to
the reconnect screen. That satisfies Req 1.6 (legacy KV-token sessions can't be
used because there's no `rp_tok` cookie → reconnect; the stale KV record is
cleared on the next logout or by `clearUserCachedData`).

### A.6 Logout / disconnect — `auth/logout`

Clear `TOKEN_COOKIE` in addition to `SESSION_COOKIE`, and `destroySession`. Same
addition in `clearUserCachedData` (account delete) so disconnecting removes every
trace from the browser.

## B. Lazy live reads, no D1 mirror (personal sessions)

The data layer (`src/lib/server/data.ts`) currently branches `demo` vs live, and
live = D1-first with an API fallback. We add a third branch: **personal = live,
no persistence.** A small helper keeps it readable:

```ts
// true when we must read live and persist nothing (BYOT privacy default).
function liveNoMirror(event): boolean { return !event.locals.demo && event.locals.personal; }
```

### B.1 `loadWorkouts`

- demo → `mockWorkouts()` (unchanged).
- personal (`liveNoMirror`) → page the **full history live** via the existing
  `Concept2Client.listWorkoutsPage` loop (250/page until `totalPages`), return the
  array. **No `upsertWorkouts`.** The Concept2 API is unmetered, so full-history
  paging on demand is acceptable (maintainer-confirmed).
- OAuth → existing D1-first behavior.

To avoid re-paging the full history three times within one dashboard render
(`loadWorkouts`, `loadWorkoutList`, aggregates all call it), memoize the live
fetch **per request** using `event.locals` (an in-request promise cache —
`locals` lives for one request only, so this persists nothing across requests).

### B.2 `loadWorkoutList`

- demo → unchanged.
- personal → load the full live list (via the memoized `loadWorkouts`) and
  filter/sort in JS with the existing `filterAndSortWorkouts` + `pbWorkoutIds`
  (this is already the non-D1 fallback path — we just always take it for BYOT).
- OAuth → existing D1 query path.

### B.3 `loadDashboardAggregates`

- demo → `null` (unchanged; the page derives from `workouts`).
- personal → compute aggregates **in JS** from the memoized full live list using
  the existing pure helpers in `analytics.ts` (per-sport summaries + distance
  PBs), returning the same `DashboardAggregates` shape the page already consumes.
  (Factor the SQL aggregation's JS equivalent out of `analytics.ts` if not already
  exposed; `distancePBs` / sport summaries already exist there.)
- OAuth → existing D1 aggregate path.

### B.4 `loadWorkoutDetail`

- demo → mock (unchanged).
- personal → `client.getWorkout(id)` live, **no `getCachedDetail` / `putCachedDetail`**.
- OAuth → existing D1 detail cache path.

### B.5 Sync — `/api/sync` + dashboard UI

- `syncWorkouts` is the eager mirror; it must not run for personal sessions.
  `/api/sync/+server.ts`: if `event.locals.personal`, return a clean
  `400`/`409` ("Sync isn't used in token mode — your data is read live") instead
  of writing D1. (Kept functional for OAuth, where the mirror is intentional.)
- The dashboard's sync affordance (the "Sync" button / `syncStatus` panel) is
  **hidden** for personal sessions (`{#if !data.demo && !data.personal}`); the
  dashboard load skips `syncStatus()` for them. `data.personal` is plumbed from
  `locals` through the page `load`.

### B.6 Annotations & goals (app-authored data, not Concept2 data)

Out of scope to move, but called out for clarity: coaching **annotations** and
**annual goals** are content the athlete creates *in rowplay*, not a copy of their
Concept2 logbook, so keeping them in D1/cookie does not contradict the privacy
goal (no Concept2 credential or logbook mirror). Goals already use a cookie in
demo mode. We leave these as-is; a follow-up could move annotations to a
cookie/local store if desired.

## C. Explicit, reversible leaderboard opt-in

Publishing already is the explicit write (the leaderboard spec's `publishWorkout`
upserts the minimal entry + a share token). Two adjustments:

### C.1 Publish still works without a mirror

`publishWorkout` resolves the workout via `loadWorkouts(event)` — now a live read
for BYOT — then `createWorkoutShare` + `upsertLeaderboardEntry`. `createWorkoutShare`
calls `loadWorkoutDetail` (live) and persists the **shared** detail + token to D1.
That persistence is **intended and consented**: it only happens because the
athlete chose to publish. No code change needed beyond confirming the live path
flows through; add a test.

### C.2 Withdraw — the symmetric opt-out (new)

- `db.ts`: `deleteLeaderboardEntry(db, userId, sport, distance)` and
  `deleteAllLeaderboardEntries(db, userId)` (best-effort, file's try/catch style).
- `server/leaderboard.ts`: `withdrawWorkout(event, workoutId)` — resolve the
  workout's `(sport, distance)`, delete the athlete's entry for that board; demo →
  no-op success; unauthenticated live → 401.
- API: extend `src/routes/api/leaderboard/publish/+server.ts` with a `DELETE`
  handler (body `{ workoutId }`) → `withdrawWorkout`, `private, no-store`. Mirrors
  the existing POST.
- `clearUserCachedData` (account delete) → also `deleteAllLeaderboardEntries`
  and clear the share tokens it created. Verify `deleteUserData` already removes
  `leaderboard_entry` rows for the user; if not, extend it.

### C.3 UI

- Leaderboard page: on a row flagged `isYou`, show a **Withdraw** action next to
  Open/Race. On the replay page's publish control, after a successful publish,
  offer **Remove from leaderboard**.
- Publish control copy gains an i18n'd note: "Publishing makes this result public
  on rowplay's leaderboard. It does not change your Concept2 logbook." Withdraw
  copy: "Removes your result from rowplay's leaderboard only."

## Settings / connect status (small UX)

`/settings` (and/or the connect screen) gains an i18n'd privacy statement
reflecting the new model: *your token stays in your browser (encrypted), your
workouts are read live and not stored, and only results you publish are shared.*
The existing account-delete control keeps working and now also clears the token
cookie and leaderboard entries.

## Security notes

- AES-GCM gives confidentiality **and** integrity: a flipped byte fails the tag
  and `openToken` returns `null` (reconnect), so a mangled cookie can't be
  coerced into a different valid token.
- The token cookie is `httpOnly` → not reachable from page JS (XSS can't read
  it), `secure` on https, `sameSite=lax` → not sent on cross-site subrequests.
- The plaintext token exists in memory only transiently, inside `client()` during
  an actual Concept2 call — never in `locals` for the whole request, never logged,
  never serialized to a response.
- Rotating `SESSION_SECRET` invalidates all token cookies → all athletes
  reconnect. That is the intended, safe failure mode (no plaintext fallback).
- KV identity records carry no secret; a KV dump no longer exposes a credential
  that can mutate a Concept2 account.

## Migration / rollout

- **No D1 schema change.** (`leaderboard_entry` and `workout_detail` already
  exist.) `SessionData.tokens.accessToken` becomes optional — backward compatible
  for reads.
- **Existing personal sessions** (token in KV) keep working for *identity* but
  `client()` finds no `rp_tok` cookie → 401 → reconnect. On reconnect the new
  sealed-cookie path takes over and the next `clearUserCachedData`/logout drops
  the stale KV token. (Optional nicety, not required: a one-time hook that
  proactively clears the legacy `tokens.accessToken` from KV on first request.)
- **Existing D1 mirror rows** for personal users are not auto-deleted (some may be
  OAuth users); they are removable via account-delete. Documented in the PR notes.

## Testing

- **Unit (`tokenCrypto.test.ts`)**: seal→open round-trip; open(tampered)→null;
  open(wrong secret)→null; open(garbage)→null.
- **Unit (data layer)**: with a mocked Concept2 client and `locals.personal`,
  `loadWorkouts`/`loadWorkoutList` read live and perform **no** D1 writes
  (assert the D1 upsert spies are never called); `loadWorkoutDetail` does not hit
  the D1 cache. Update any existing test that asserted a token in KV.
- **Unit (leaderboard)**: `withdrawWorkout` removes the athlete's entry; account
  delete clears entries.
- **E2E (demo)**: unchanged smoke — demo mode persists/needs nothing, so existing
  specs must stay green (guards Req 2.6).
- **Manual on `npm run preview`** (recorded in tasks): paste token → connect →
  confirm `rp_tok` cookie is `HttpOnly` and KV holds no token → dashboard renders
  from live reads → publish → entry appears → withdraw → entry gone → logout →
  both cookies cleared.

## Out of scope (follow-ups)

- Moving annotations/goals off D1 to a browser/local store (B.6).
- A short-lived encrypted edge cache of the live workout list for very large
  logbooks (kept out to preserve the "no server-side copy" guarantee).
- Proactive KV migration that scrubs legacy plaintext tokens on first request
  (current plan lets them expire / be cleared on reconnect/logout).
