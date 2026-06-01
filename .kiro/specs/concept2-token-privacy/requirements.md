# Concept2 Token Privacy — Requirements

## Introduction

rowplay began as a single-user app: the Concept2 API token was the **maintainer's
own**, so storing it in KV and mirroring the logbook into D1 was unremarkable —
it was the maintainer's data on the maintainer's infrastructure.

The BYOT (bring-your-own-token) transition changed the actor. Production now asks
**each athlete** to paste their **own** Concept2 personal API token. That token
is not read-only in any meaningful safety sense: it authenticates against the
official Concept2 API as the athlete and can **add and delete** their logbook
records. With BYOT, the previous design is now a privacy problem on two fronts:

1. **The credential is stored.** `auth/token/+page.server.ts` writes the pasted
   token in **plaintext into KV** (`SessionData.tokens.accessToken`) for 30 days.
   A token that can mutate the athlete's Concept2 account sits at rest in our
   shared store.
2. **The data is mirrored.** `syncWorkouts` pages the athlete's **entire**
   logbook into D1 keyed by `user_id`, and workout detail is cached in D1 too.
   The app holds a durable copy of every athlete's training history by default.

Because the token authenticates against Concept2's official API, it is sound to
treat a **validated token as proof of identity** — we do not need to store it to
trust who the caller is for the duration of a request. And because the Concept2
logbook API is effectively **unmetered**, reading the athlete's data **live and
lazily** on each request is acceptable; we do not need a server-side mirror to be
fast enough.

This spec makes BYOT **private by default**: the token lives only in the
athlete's browser (sealed, httpOnly — never in client JS, never in shared server
storage), the athlete's Concept2 data is read live and **never persisted
server-side by default**, and the **only** way any of the athlete's data leaves
their browser onto shared storage is an **explicit, reversible** choice to
publish to the leaderboard.

It must obey every project rule in `AGENTS.md`: it works in **demo mode**
unchanged, every new user-visible string goes through **i18n** in **all** locale
files, it uses the existing **RACE BOARD** design tokens, and it passes the full
quality gate (`check` + `build` + `test` + `test:e2e`).

## Decisions (locked with the maintainer)

- **Token holding:** the validated personal token is **sealed (encrypted) into an
  httpOnly cookie** with `SESSION_SECRET`. It is never returned in client JS and
  never written to KV or D1.
- **Data default:** **lazy live reads, no D1 mirror.** For BYOT sessions the
  dashboard/replay read from the Concept2 API on demand; nothing of the athlete's
  Concept2 data is persisted server-side by default.
- **Leaderboard:** **explicit opt-in, and reversible** (publish AND withdraw).
  Publishing is the single, deliberate moment an athlete's result is written to
  shared storage.

## Glossary

- **BYOT / personal session** — a session created by pasting a personal token
  (`SessionData.personal === true`), as opposed to a legacy OAuth session.
- **Seal / open** — authenticated symmetric encryption (AES-GCM) of the token
  with a key derived from `SESSION_SECRET`. "Seal" = encrypt, "open" = decrypt +
  verify; a tampered or wrong-key blob fails to open.
- **Token cookie** — the httpOnly cookie (`rp_tok`) carrying the sealed token.
- **Mirror** — a durable server-side copy of the athlete's Concept2 data (the D1
  `workout` rows and cached `workout_detail`). This spec removes it as a default.

## Requirements

### Requirement 1 — The token is never stored at rest server-side

**User story:** As an athlete, I want my Concept2 token to never be saved on the
server, so that a token that can modify my logbook is not sitting in someone
else's database.

#### Acceptance criteria

1. WHEN an athlete connects by pasting a valid personal token THEN the system
   SHALL validate it against the Concept2 API (`fetchMe`) and, on success, store
   it **only** as a sealed value in an **httpOnly** cookie — never in KV, D1, or
   any response body readable by client JS.
2. THE sealed token SHALL be produced with authenticated encryption (AES-GCM)
   using a key derived from `SESSION_SECRET`; a tampered or wrong-key cookie
   SHALL fail to open and be treated as no token.
3. WHERE `SESSION_SECRET` is not configured THE connect action SHALL fail with a
   clear, i18n'd "server not configured" error rather than fall back to storing
   the token in plaintext.
4. THE KV session record for a personal session SHALL contain only non-secret
   identity (`id`, `username`, `firstName`, the `personal` flag) and SHALL NOT
   contain the access token.
5. WHEN the athlete disconnects/logs out THEN the system SHALL clear the token
   cookie (and the session cookie) so no credential remains in the browser, and
   SHALL destroy the KV session record.
6. WHERE a legacy personal session still carries a plaintext token in KV (created
   before this change) THE system SHALL NOT use it; the athlete SHALL be treated
   as unauthenticated and prompted to reconnect, and the stale KV record SHALL be
   cleared.

### Requirement 2 — Athlete data is read live and not mirrored by default

**User story:** As an athlete, I want my training history to be read on demand
rather than copied into the app's database, so that connecting doesn't hand over
a durable copy of all my workouts.

#### Acceptance criteria

1. WHERE a session is a personal (BYOT) session THE system SHALL read workout
   summaries, lists, detail, and dashboard aggregates **live from the Concept2
   API** and SHALL NOT write the athlete's Concept2 data to D1 (no `workout`
   upserts, no `workout_detail` cache) as part of normal browsing.
2. THE dashboard SHALL present the same information as before (full-history list,
   PBs, per-sport aggregates, annual goal progress) computed from the live-read
   data using the existing pure analytics helpers — not from D1 SQL.
3. THE replay view SHALL load workout detail (including strokes) live for a
   personal session, with no durable server-side cache write.
4. WHERE a session is a legacy OAuth session (only when `CONCEPT2_CLIENT_ID` is
   configured) THE existing D1-backed sync/cache behavior MAY be retained
   unchanged; this spec's no-mirror rule targets BYOT sessions.
5. THE eager "sync my whole history into D1" path SHALL NOT run for personal
   sessions; any sync UI/endpoint SHALL be hidden or rejected for them so the
   mirror is not silently re-created.
6. THE demo-mode experience SHALL be byte-for-byte unchanged (mock data, no
   network, no persistence).

### Requirement 3 — Publishing to the leaderboard is the only persistence, and it is explicit

**User story:** As an athlete, I want a clear, deliberate choice to put a result
on the public leaderboard, so that I — and only I — decide when any of my data
leaves my browser onto shared storage.

#### Acceptance criteria

1. BY DEFAULT, after connecting, the system SHALL have written none of the
   athlete's Concept2 data to shared storage; the leaderboard SHALL show no entry
   for the athlete until they publish.
2. WHEN the athlete explicitly publishes a result THEN — and only then — the
   system SHALL write the minimal entry (display name, time, pace, date, sport,
   distance, the public replay share token, and `user_id` as a non-exposed key)
   to D1, reusing the existing publish path.
3. THE UI that triggers a publish SHALL make clear, in i18n'd copy, that
   publishing makes the result public and is the moment the data leaves the
   browser.
4. THE published entry SHALL expose only a display name and result metrics —
   never an email, raw user id, or other PII (unchanged from the leaderboard
   spec's Req 5.2).

### Requirement 4 — Publishing is reversible (add and remove)

**User story:** As an athlete, I want to remove my result from the leaderboard as
easily as I added it, so that my opt-in is never a one-way door — mirroring that
the same token can both add and delete records on Concept2.

#### Acceptance criteria

1. WHERE the athlete has a published entry THE system SHALL offer a "withdraw"
   action that deletes their entry from the matching `(sport, distance)` board.
2. WHEN the athlete withdraws THEN the system SHALL remove the leaderboard row(s)
   for that athlete and board so they no longer appear to other athletes.
3. THE withdraw endpoint SHALL reject unauthenticated callers (401) and SHALL be
   a no-op success in demo mode (consistent with publish in demo mode).
4. WHEN the athlete deletes their account / clears their data THEN the system
   SHALL remove all of their leaderboard entries and any associated share tokens
   in addition to clearing the session and token cookie.
5. THE distinction SHALL be clear in copy: withdrawing removes the athlete from
   **rowplay's** leaderboard; it does **not** modify or delete anything in the
   athlete's **Concept2** logbook.

### Requirement 5 — Quality, privacy, and i18n

**User story:** As the maintainer, I want the change to meet rowplay's bar, so
that it ships without regressions and the privacy properties are tested.

#### Acceptance criteria

1. THE seal/open token-crypto SHALL live in a focused, server-side module and
   SHALL be covered by Vitest unit tests: round-trip correctness, that opening a
   tampered blob fails, and that opening with the wrong key fails.
2. NO test, log line, error message, or response body SHALL print the raw token;
   existing tests asserting a token in KV SHALL be updated to the new model.
3. EVERY new user-visible string SHALL be added to ALL locale files
   (`en`, `zh`, `de`, `es`, `fr`, `ja`) and pass `npm run validate:locales`;
   sport names (RowErg/SkiErg/BikeErg) stay untranslated.
4. THE feature SHALL pass the full gate: `npm run check` (0 errors),
   `npm run build`, `npm run test`, and `npm run test:e2e` (demo-mode smoke
   unaffected). Token-cookie + live-read behavior SHALL be verified on
   `npm run preview` (Workers runtime) and the steps recorded in the spec.
