# rowplay — Handoff Prompts

Each section below is a **self-contained prompt** for a fresh agent. Copy one
into a new session. They assume the repo is cloned and on `main`. Read
`AGENTS.md` first (stack, commands, caveats). Common ground truth:

- SvelteKit (Svelte 5, runes) → Cloudflare **Workers**; config is `wrangler.jsonc`.
- Verify on the real runtime with `npm run preview` (build + `wrangler dev`), not
  just `vite dev` — KV/D1/asset bindings only exist under `wrangler`.
- Gate every change on `npm run check` (0 errors) and `npm run build`.
- Demo mode (no `CONCEPT2_CLIENT_ID`) serves mock data and skips auth.
- All work goes to `main` directly (push when done). End commit messages with the
  session link convention already used in `git log`.

Tasks are independent unless noted. **Task 1 (deploy) needs human Cloudflare
auth — an agent can only prepare it.**

---

## Task 1 — Live deploy (human-in-the-loop)

> rowplay is ready to deploy to Cloudflare Workers at
> `https://rowplay.shenghaoc.workers.dev`. KV (`SESSIONS`) and D1 (`DB`) ids are
> already in `wrangler.jsonc`. Walk me through and run the deploy. Steps:
> 1. `wrangler d1 migrations apply rowplay --remote` (applies 0001–0003; the
>    `workouts`, `sync_state`, and HR/watt-minute columns).
> 2. Confirm I've registered a Concept2 app at
>    https://log.concept2.com/developers/keys with redirect URI
>    `https://rowplay.shenghaoc.workers.dev/auth/callback`, then set
>    `CONCEPT2_CLIENT_ID` in `wrangler.jsonc` `vars`.
> 3. `wrangler secret put CONCEPT2_CLIENT_SECRET` and
>    `wrangler secret put SESSION_SECRET` (generate the latter with
>    `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`).
> 4. `npm run deploy`.
> 5. After deploy, smoke-check the live URL: `/` and `/dashboard` load, and the
>    "Connect Concept2" flow reaches the C2 authorize page.
> Anything needing my Cloudflare login, stop and tell me the exact command to run.

---

## Task 2 — Validate against a real logbook (the biggest open risk)

> rowplay has only ever run on mock data + the local Workers runtime. Nothing has
> synced a real multi-thousand-workout Concept2 logbook. Once it's deployed (or
> running locally with real `.dev.vars` credentials), drive a real sync and hunt
> for scale/edge bugs. Specifically verify:
> - The full-history sync (`POST /api/sync`, `src/lib/server/data.ts` →
>   `syncWorkouts`) pages correctly through thousands of results (API max 250/page)
>   and the incremental `from=` overlap logic doesn't miss or duplicate sessions.
> - D1 `upsertWorkouts` batching (chunks of 100) holds at scale.
> - Odd `workout_type` values, rest intervals, BikeErg pace units (per-1000m, see
>   `mapStrokes`), and missing optional fields all parse without throwing.
> - Dashboard analytics (PBs, trends, per-sport, distance bands) compute over the
>   FULL history, not a recent slice.
> - The virtualized workout list (`WorkoutList.svelte`, TanStack Virtual) renders
>   smoothly with thousands of rows.
> Report any data that renders wrong or any request that errors, with the workout
> id/shape that triggered it. Fix what you find; commit per fix.

---

## Task 3 — Finish the code-review cleanup backlog

> A code review of recent work surfaced cleanup items that were deferred (the
> correctness bugs are already fixed in commit d59c452). Address these; they're
> low-risk quality fixes. Gate on `npm run check` (0 errors) + `npm run build`.
> 1. `fmtPace(v).replace('/500m', '')` is duplicated ~10× across
>    `dashboard/+page.svelte` and `replay/[id]/+page.svelte`. Add a
>    `fmtPaceBare()` (or a `fmtPace(pace, { unit: false })` option) to
>    `src/lib/format.ts` and replace all sites.
> 2. `src/routes/dashboard/+page.svelte`: `verdictText` re-implements the
>    metric-formatting that the `metricFmt` `$derived` already does, with a
>    different +/- convention. Unify so dps/distance/pace format in one place.
> 3. `src/lib/i18n.ts`: `getValue()` re-walks the nested dictionary by splitting
>    the dot-path on every `t()` call, and `t()` does it twice (target lang +
>    English fallback). The replay page calls `t()` 60+ times per render, some
>    inside `$derived` that re-run during playback. Memoize a flattened
>    `Map<string,string>` per language so lookups are O(1). Keep the same public
>    `t()` signature and behavior.
> 4. Optional: extract a shared `avgWatts(workout)` helper (replay page derives it
>    from `wattMinutes` else `paceToWatts(pace)`) so the dependency on the cached
>    detail JSON is explicit and reused.
> Do NOT "fix" the 4 `state_referenced_locally` svelte-check warnings — they are
> verified false positives (one-time seeds of the i18n/theme classes; no
> replay→replay navigation exists to stale the `const detail` capture).

---

## Task 4 — Authoritatively sync the Svelte skills

> `.kiro/skills/` (and the dropped `skills-lock.json`) hold Svelte agent skills
> that were hand-reconstructed/copied, not installed by the official tool, so
> hashes/content may not match upstream. Install the official Svelte skills via
> the Claude Code plugin marketplace (or `@sveltejs/opencode`) and let it
> regenerate the skill files + lock from `sveltejs/ai-tools` canonically. Confirm
> the two skills are `svelte-code-writer` and `svelte-core-bestpractices`. Commit
> the regenerated files. This needs to run on a machine with network + the plugin
> installed (the previous environment was sandboxed without either).

---

## Task 5 — Real mobile/visual verification

> The mobile layout and the emoji→lucide-icon overhaul were verified structurally
> (CSS + DOM) but never visually — the previous environment had no browser.
> Install a browser (`npx playwright install chromium`) and actually look:
> 1. Screenshot `/`, `/dashboard`, and `/replay/1005` at 390px (iPhone) and
>    768px (tablet) widths against `npm run preview`.
> 2. Check specifically: the replay transport controls (play/clock/scrub/speeds)
>    don't overflow or wrap badly; the dashboard hero pace number and
>    `fastest → slowest` stat fit; the workout-list rows and per-sport table are
>    readable; lucide icons (not emoji) render everywhere.
> 3. Fix any overflow/cramping you see. Re-screenshot to confirm. Commit.
> Note there's already a WebKit Playwright smoke suite (`tests/e2e/smoke.spec.ts`,
> `npm run test:e2e`) — make sure it still passes.

---

## Task 6 — Feature: training calendar / streak heatmap (next feature)

> Build a GitHub-style training calendar heatmap on the dashboard: a year grid
> where each day's cell intensity reflects training volume (meters or time), to
> show consistency/streaks at a glance. It's the one analytics view we sketched
> but never built, and it leverages the full D1 history.
> - Add a pure aggregation helper in `src/lib/analytics.ts` (group workouts by
>   day → volume), unit-testable, no DOM. Follow the existing pure-function style.
> - Render it on `dashboard/+page.svelte` using the existing design tokens /
>   Tailwind v4 + lucide; no new heavy deps if a simple CSS grid suffices.
> - Must work in demo mode (mock data) and i18n'd (en/zh) — all strings via
>   `i18n.t()`, add keys to both dictionaries in `src/lib/i18n.ts`.
> - Gate on `npm run check` + `npm run build`; verify on `npm run preview`.

---

## Optional follow-ups (lower priority, mentioned for completeness)

- **Push dashboard aggregation into SQL.** Totals/PBs/per-sport currently pull all
  rows into JS each render. At thousands of workouts, `GROUP BY`/`MIN` in D1 is
  faster and more correct. Only worth it if Task 2 shows a perf issue.
- **Detail-cache versioning.** `getCachedDetail` (`src/lib/server/db.ts`) serves
  stored `WorkoutDetail` JSON forever with no invalidation, so workouts replayed
  before a schema change never pick up new fields. Add a `payload_version`
  column + check if/when that becomes a real problem.
