# Concept2 Token Privacy — Design

## Overview

Three changes, each localized, no replay/renderer impact:

```
A. Token holding   paste → validate (fetchMe) → SEAL into httpOnly `rp_tok` cookie
                   KV session keeps identity only (no token)
                   client() opens the cookie per request to call Concept2

B. Data cache      keep the D1 cache of the athlete's workouts (fast dashboard),
                   but treat it as SESSION-SCOPED: purge on disconnect/logout and
                   account-delete; demo unchanged

C. Leaderboard     publish = the one explicit thing exposed to OTHER athletes
                   + withdraw (delete) = the symmetric, reversible opt-out
```

The token is the privacy crux (Part A). The athlete's own workout data stays
cached in D1 for speed (Part B) — the only change there is **lifecycle**: the
cache is purged when the athlete disconnects, so it doesn't outlive the session.

Token handling moves from "stored in KV, read from session" to "sealed in a
cookie, opened on demand." We surface the session's existing `personal` flag on
`locals` so logout knows to purge a personal athlete's cache.

```
hooks.server.ts ──reads KV session──> locals.user / locals.personal   (identity only)
data.ts/client() ──opens rp_tok cookie──> Concept2Client               (credential, per request)
data loaders ─────> D1 cache (lazy-filled from live API) | mock (demo)
logout/disconnect ─(personal)─> purge D1 cache + clear both cookies + destroy KV
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

## B. Session-scoped D1 cache (keep the cache, bind its lifecycle to the session)

The data layer (`src/lib/server/data.ts`) already caches the athlete's workouts in
D1 (D1-first reads, lazy-filled from the live API via `syncWorkouts`, plus the
TTL'd `workout_detail` cache from the detail-cache-ttl spec). That stays — it is
what makes the dashboard fast, and the data is the athlete's own. The **only**
change is lifecycle: the cache must not outlive the session.

So the data-loader code paths (`loadWorkouts`, `loadWorkoutList`,
`loadDashboardAggregates`, `loadWorkoutDetail`, `syncWorkouts`) are **left as they
are today** for both BYOT and OAuth — no `liveNoMirror` branch, no JS-side
aggregate reimplementation, no disabling of sync. The work in Part B is purely:

### B.1 Surface `personal` on `locals`

`hooks.server.ts` sets `event.locals.personal = session.personal === true` (also
needed by Part A). This lets logout decide whether to purge.

### B.2 Purge the cache on disconnect/logout — `auth/logout`

Today logout destroys the KV session and clears the session cookie but leaves the
D1 cache. For a **personal** session, logout now also:

- clears the `rp_tok` cookie (Part A.6), and
- purges the athlete's cached workout data via the existing
  `deleteUserData(db, userId)` (the same helper account-delete already uses).

This is what makes the D1 copy "session-scoped": once you disconnect, nothing of
your logbook remains in D1 (your published leaderboard entries are separate and
governed by Part C's explicit opt-in/withdraw). The trade-off — re-connecting
re-pages the history into the cache — is acceptable (the Concept2 API is
unmetered, and it only happens on an explicit reconnect).

### B.3 Cache freshness (unchanged, noted)

The incremental `syncWorkouts` (overlap-date refresh) and the `workout_detail`
TTL already keep the cache from going stale; no change. The dashboard's existing
sync affordance stays available for BYOT (it is the cache's refresh control), so
**Req 2.5's earlier "disable sync for BYOT" idea is dropped** — sync is the
cache, not a separate mirror.

### B.4 Account-delete (unchanged)

`clearUserCachedData` already purges the D1 cache and destroys the session; Part
A.6/C.2 extend it to also clear the token cookie and leaderboard entries.

### B.5 Annotations & goals (app-authored data)

Unchanged and unaffected: coaching **annotations** and **annual goals** are
content the athlete creates *in rowplay*, not a copy of their Concept2 logbook.
They live in D1 keyed by user and are purged by the same `deleteUserData` path on
disconnect/account-delete.

## C. Explicit, reversible leaderboard opt-in

Publishing already is the explicit write (the leaderboard spec's `publishWorkout`
upserts the minimal entry + a share token). Two adjustments:

### C.1 Publish (unchanged path)

`publishWorkout` resolves the workout via `loadWorkouts(event)` (served from the
D1 cache), then `createWorkoutShare` + `upsertLeaderboardEntry`. The share token +
public leaderboard entry are the **only** artifacts exposed to *other* athletes,
and they are written **only** because the athlete chose to publish. No code change
needed; add a test. Note the lifecycle distinction: disconnect purges the
*private cache* (Part B.2) but **not** published entries/share tokens — those are
governed solely by the explicit publish/withdraw controls (Part C.2).

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
  sealed-cookie path takes over.
- **Legacy KV records** that still hold a plaintext token are cleared
  **manually** by the maintainer — current scale is the maintainer's own data
  only, so no automatic migration/scrub is built (maintainer-confirmed).

## Testing

- **Unit (`tokenCrypto.test.ts`)**: seal→open round-trip; open(tampered)→null;
  open(wrong secret)→null; open(garbage)→null.
- **Unit (logout/disconnect)**: a personal-session logout purges the D1 cache
  (`deleteUserData` spy called) and clears both cookies; an OAuth/non-personal
  logout does **not** purge. Update any existing test that asserted a token in KV.
- **Unit (leaderboard)**: `withdrawWorkout` removes the athlete's entry; account
  delete clears entries.
- **E2E (demo)**: unchanged smoke — demo mode persists/needs nothing, so existing
  specs must stay green (guards Req 2.6).
- **Manual on `pnpm run preview`** (recorded in tasks): paste token → connect →
  confirm `rp_tok` cookie is `HttpOnly` and KV holds **no** token → dashboard
  reads from the D1 cache → publish → entry appears → withdraw → entry gone →
  logout → both cookies cleared **and** the D1 cache purged.

## Out of scope (follow-ups)

- Moving annotations/goals off D1 to a browser/local store (B.5).
- Automatic eviction of caches whose KV session has expired (no KV-expiry
  callback exists); abandoned caches are handled by manual deletion at the
  current scale, and freshness TTLs keep stale data from being served.
- Proactive KV migration that scrubs legacy plaintext tokens (done manually).
