# rowplay — Top 10 to Feature-Complete

> **Vision (the north star — keep every task pointed at it):**
> Mainstream Concept2 apps' features, I have. Features they *don't* have, I also
> have. There's no technical moat left in "log your erg" — the moat is the
> **post-workout replay / re-watch experience**. rowplay exists for the athlete
> who cares about reliving and dissecting a session: an avatar racing the course
> with synchronized pace / rate / power / HR, scrub + speed controls, and
> ghost-racing your past self. Make that experience the best in the world, and
> reach parity on everything an ErgData / Concept2-Online / Strava user expects.

This file is the **build backlog**. Each task below is a **self-contained prompt**
— copy ONE into a fresh agent session and it has everything it needs. They are
written deliberately verbose and explicit because the agent running them may have
little context. Tasks are independent unless a "Depends on" line says otherwise.

---

## Ground truth (read this before any task)

- Stack: **SvelteKit (Svelte 5, runes mode)** → Cloudflare **Workers**. Config is
  `wrangler.jsonc` (JSON, not TOML). Bindings: `ASSETS` (static), `SESSIONS`
  (KV, sessions), `DB` (D1, cached workouts + strokes).
- Read **`AGENTS.md`** first — it has the full stack, commands, and the
  non-obvious caveats (stroke-pace units differ for the bike; interval `t`/`d`
  restart per rep; demo mode; etc.). Do not re-discover those the hard way.
- **Demo mode is the default**: with `CONCEPT2_CLIENT_ID` empty (current state),
  the app serves deterministic mock data (`src/lib/mockData.ts`) and skips auth.
  **Every feature you build MUST work in demo mode**, because that's how it's
  developed, screenshotted, and e2e-tested.
- **i18n is mandatory**: every user-visible string goes through `i18n.t('key')`.
  Add keys to BOTH the `en` and `zh` dictionaries in `src/lib/i18n.ts`. Never
  hardcode English. Sport names (RowErg/SkiErg/BikeErg) stay untranslated.
- **Theming**: light/dark via `src/lib/theme.svelte.ts` + CSS custom properties
  in `src/app.css`. Use the existing design tokens, Tailwind v4, and
  `@lucide/svelte` icons (no emoji). The look is the "RACE BOARD" design system.
- **Quality gate for EVERY task** (a task is not done until all pass):
  1. `npm run check` → **0 errors** (a few `state_referenced_locally` warnings
     are known false positives — do not "fix" them).
  2. `npm run build` → succeeds.
  3. `npm run test:e2e` → green (Playwright/WebKit; first run on a fresh VM:
     `npx playwright install --with-deps webkit`).
  4. Manually verify on the **real runtime** with `npm run preview`
     (= build + `wrangler dev` on `http://127.0.0.1:8787`). `vite dev` does NOT
     provide KV/D1/asset bindings, so it is not a faithful test.
- **Git**: branch off `main`, commit per logical change with a clear message,
  push, and open a PR (the owner reviews + merges). End commit messages with the
  session-link convention already in `git log`.

## What already exists (do NOT rebuild these)

The repo is far past MVP. Before adding anything, grep for it — odds are a pure
helper already exists in `src/lib/analytics.ts`, `src/lib/format.ts`, or
`src/lib/replay/`. Already built:

- **Dashboard**: totals, pace trend, per-sport filter, distance bands, PB table,
  **training calendar heatmap** (`buildTrainingCalendar`, `TrainingHeatmap.svelte`),
  **fitness & freshness / training-load chart** (`trainingLoad`).
- **Replay** (`src/routes/replay/[id]/`): rAF clock + interpolation
  (`replay/engine.ts` `sampleAt`/`ReplayEngine`), canvas course **with a ghost
  lane already in the renderer** (`replay/renderer.ts`, `AvatarState`), play /
  pause / scrub / speed (0.5×–8×), live pace/rate/power/HR gauges
  (`MetricGauge.svelte`) + uPlot telemetry (`UPlotChart.svelte`).
- **Ghost racing is ALREADY BUILT** (`src/routes/replay/[id]/+page.svelte`, lines
  ~39–211). A "compare against" control offers THREE modes — `session` (race
  another of your workouts), `pace` (a constant-pace boat via `parsePaceInput` +
  `constantPaceGhost`), and `file` (upload CSV/TCX/FIT via `parseWorkoutFile`) —
  plus a live `gapMeters` / `gapSeconds` readout and a second avatar in the canvas.
  Task 2 is **polish**, not a build-from-scratch.
- **Analytics library** (pure, DOM-free, in `src/lib/analytics.ts`): `linearTrend`,
  `distanceBand`, `summariseBySport`, `distancePBs`, `hrZones`,
  `distancePerStroke`, `techniqueSummary`, `efficiencyByRate`,
  `estimateCriticalPower`, `trainingLoad`, `powerCurve`, `intervalBreakdown`,
  `aggregateDailyVolume`, `buildTrainingCalendar`. **Most are already surfaced**:
  `hrZones`, `powerCurve`, `techniqueSummary`, `efficiencyByRate`,
  `intervalBreakdown` on the replay page; `trainingLoad` + `buildTrainingCalendar`
  on the dashboard. **The ONE exported analytics fn not rendered anywhere is
  `estimateCriticalPower`** — see Task 4.
- **Infra**: OAuth2 (server-side only) + token refresh (`server/concept2.ts`),
  KV sessions (`server/session.ts`), D1 cache (`server/db.ts`), full + incremental
  sync (`server/data.ts`, `POST /api/sync`), i18n (en/zh), light/dark theme,
  virtualized workout list (`WorkoutList.svelte`, TanStack Virtual), and a
  Playwright WebKit smoke suite (`tests/e2e/smoke.spec.ts`). NOTE: `static/` holds
  only `favicon.svg` — there is **no PWA manifest and no service worker yet**
  (see Task 8).

---

## Task 1 — Land the two open PRs and rebuild a clean base (do this first)

> Two PRs are open against `main`; they finish the "optional follow-ups" from the
> previous handoff. Get them merged so the rest of the backlog builds on a clean,
> performant base.
> - **PR #19** — "Push dashboard totals/PBs/per-sport aggregation into D1 SQL".
>   Moves O(n) client-side reduction into `GROUP BY` / `ROW_NUMBER` queries in D1,
>   returning pre-computed `SportSummary[]` + PBs alongside raw workouts, with a JS
>   fallback for demo mode / API cold start.
> - **PR #18** — "Add `payload_version` to `workout_detail` cache". Adds a
>   `payload_version` column + `DETAIL_PAYLOAD_VERSION` constant so stale cached
>   `WorkoutDetail` JSON is treated as a cache miss after a schema change.
>
> **Do:** Review each PR's diff. Check out each branch, run the full quality gate
> (check + build + test:e2e + `npm run preview` smoke of `/dashboard` and a
> `/replay/<id>`). Confirm PR #19's SQL path and its JS fallback agree on numbers
> (compare a sport's totals in demo mode vs. a path that forces the SQL query).
> Confirm PR #18's migration (`migrations/000x_*.sql`) applies cleanly with
> `npm run db:migrate:local` and that a version bump correctly re-fetches detail.
> If both are green, merge them (squash). If either fails the gate, push the fix to
> its branch and report what was wrong. **Acceptance:** both PRs merged (or
> blocked with a written reason), `main` green on the full gate.

---

## Task 2 — Polish ghost racing into THE headline feature (it's 80% built)

> **Reality check first:** ghost racing already works. `src/routes/replay/[id]/`
> has a "compare against" control with three modes (`session` / `pace` / `file`),
> resolves each to a ghost stroke array, renders a second avatar, and shows a live
> `gapMeters` / `gapSeconds` readout. Read that code before touching anything.
> Your job is to make it **obvious, smart, and finished** — not to rebuild it.
>
> **Do (each is a small, shippable increment):**
> 1. **Smart default opponent**: when the user opens the compare panel in `session`
>    mode, default the picker to a *meaningful* rival — same sport + closest
>    distance (e.g. their PB or most-recent comparable piece) — instead of an empty
>    select. Make the picker searchable if the list is long.
> 2. **Finish result card**: when both lanes reach the end, show a clear verdict —
>    e.g. "You beat your 2025-03-01 2k by 4.2s (+38 m)" with win/lose color. Right
>    now there's a live gap but no satisfying finish moment.
> 3. **Visual polish**: verify the ghost avatar + its label have strong contrast in
>    BOTH light and dark themes; make the gap readout glanceable (big, colored).
> 4. **Coherence**: confirm scrub + speed (0.5×–8×) sample BOTH lanes at the same
>    engine time `t` (they should already; add a test that proves it).
>
> **Rules:** all new strings i18n (en/zh). Keep `sampleAt` pure — ghost math stays
> in the page/derived, not the engine. Works in demo mode (two mock workouts).
> **Acceptance:** opening compare → `session` pre-selects a sensible rival; finishing
> a race shows a verdict card; ghost is legible in both themes. Add an e2e step that
> loads a replay, adds a pace-boat rival, and asserts the gap readout renders. Gate
> passes.

---

## Task 3 — Shareable + exportable replays (the viral loop)

> Replays are only fun if you can show them off. Add sharing/export. This is both a
> parity feature (Strava shares) and a unique one (nobody shares an *erg replay*).
>
> **Build:**
> 1. **Shareable replay link**: a public, read-only replay route (e.g.
>    `/r/<token>`) that renders a specific workout's replay from the **D1 cache**
>    without requiring the viewer to be logged in. Generate an unguessable token;
>    store a `share_token` (new migration) on the cached detail; add a "Share"
>    button on the replay page that creates/copies the link. Respect privacy: only
>    workouts the owner explicitly shares are public. Set proper OpenGraph/Twitter
>    meta tags so the link unfurls.
> 2. **Race-card image**: a "Download image" button that renders a summary card
>    (sport icon, distance, time, pace, avg power/HR, date, small course/pace
>    sparkline) to a PNG via canvas — shareable to socials. Reuse the canvas
>    renderer where sensible.
> 3. **(Stretch) video/GIF export** of the replay: record the canvas with
>    `MediaRecorder` (`canvas.captureStream()`) to a short WebM the user can
>    download. Time-box this; ship the link + image first.
>
> **Rules:** the share route must work in demo mode (share a mock workout). i18n
> all UI. Security: tokens are capability URLs — no enumeration, no PII leak, the
> share page must NOT expose the viewer's session or other workouts.
> **Acceptance:** I can copy a share link, open it in a private window, and watch
> the replay; I can download a race-card PNG. Gate passes.

---

## Task 4 — Critical-power model + a "what can I hold?" pace predictor

> **Reality check first:** most of `analytics.ts` is already on screen — `hrZones`,
> `powerCurve`, `techniqueSummary`, `efficiencyByRate`, `intervalBreakdown` on the
> replay page; `trainingLoad` + `buildTrainingCalendar` on the dashboard. The ONE
> exported analytics function rendered nowhere is **`estimateCriticalPower`**
> (CP / W′ from the workout history). Surface it and build the predictor on top.
>
> **Build (on the dashboard, or a small `/insights` page):**
> 1. Render the CP / W′ estimate from `estimateCriticalPower(workouts)` with a
>    short plain-language explanation of what CP means for an erg athlete.
> 2. A **pace/time predictor**: "what pace can I hold for N minutes / what time for
>    D metres" derived from the CP model — the genuinely useful, mainstream-missing
>    feature (e.g. predict a 2k from CP/W′, or a 30-min distance). Add the pure math
>    as a new exported helper in `analytics.ts` next to `estimateCriticalPower` so
>    it's unit-testable (Task 10 will cover it).
> 3. Show the modelled power-duration curve vs. the athlete's actual bests so they
>    can see where they over/under-perform the model.
>
> **Do first:** grep `estimateCriticalPower` to confirm it's still unused; reuse
> `UPlotChart.svelte` + `chartTheme.ts` for charts. **Rules:** pure math in
> `analytics.ts` (no DOM); i18n all labels; works in demo mode (the mock history
> must yield a non-null CP — verify). **Acceptance:** CP/W′ + a working "hold for
> N min" predictor are visible and explained; the one remaining unsurfaced
> analytics fn is now used. Gate passes.

---

## Task 5 — Goals, streaks & Concept2-style challenges

> Parity feature with a retention hook. Concept2 athletes live for the Million
> Meter club, holiday/marathon challenges, and yearly meter goals.
>
> **Build:**
> 1. **Season/annual goals**: let the user set a target (e.g. 1,000,000 m or X
>    hours this year), show progress bars + on-pace/behind projection on the
>    dashboard. Compute from full D1 history (pure helper in `analytics.ts`).
> 2. **Streaks**: current + longest training streak, "days since last session",
>    weekly consistency — derive from `aggregateDailyVolume` (already exists).
> 3. **Challenges / badges**: lifetime-meters milestones (100k / 500k / 1M / …),
>    distance-club PBs, "every-sport week". Pure, testable badge logic.
> 4. **PB celebration**: when a sync produces a new PB (`distancePBs`), surface a
>    toast (`svelte-sonner` is already a dep) + a "new PB" marker in the list.
>
> **Rules:** goals persist per user — store in D1 (new migration) keyed by the
> session's logbook user; in demo mode use a sensible default/local value. i18n
> all strings, including pluralization (en/zh). Works in demo mode.
> **Acceptance:** I can set a yearly-meters goal and see progress; streak + a
> couple of badges show on the dashboard; a new PB triggers a celebration. Gate
> passes.

---

## Task 6 — Power-user workout list: search, filter, sort, date range, tags

> The list (`WorkoutList.svelte`) is virtualized but you can't really *find*
> anything in a multi-thousand-workout logbook. Add real querying.
>
> **Build:**
> - **Filter**: by sport, workout type (`workoutType`), date range, distance band,
>   "has stroke data", and free-text in `comments`.
> - **Sort**: by date / distance / time / pace / power, asc+desc.
> - **Saved/again**: a "PBs only" toggle; quick chips for common distances
>   (500/2k/5k/10k/marathon) and common durations.
> - Push filtering/sorting into the **D1 query** (or the `/api/workouts` endpoint)
>   where possible so it scales — don't pull all rows into JS first (PR #19's SQL
>   approach is the model). Keep the JS path for demo mode.
> - Reflect active filters in the URL (querystring) so views are shareable/bookmarkable.
>
> **Rules:** i18n all labels. Keep the virtualized list smooth at thousands of
> rows. Works in demo mode. **Acceptance:** I can find "all my 2k rows in 2025
> sorted by pace" in a few clicks; the URL captures the filter; list stays smooth.
> Gate passes.

---

## Task 7 — Compare any two workouts head-to-head (analytics, not racing)

> Distinct from Task 2's live ghost race: a **static side-by-side analysis** of two
> pieces — the view you use to ask "is my 2k actually improving?".
>
> **Build a `/compare?a=<id>&b=<id>` view** (or a "Compare" action from the list):
> overlay both workouts' pace / HR / power **vs. distance** (normalize x to
> distance so different-duration pieces align) on shared uPlot charts; a stat table
> of deltas (time, avg/peak power, avg HR, DPS, split consistency); and
> per-interval deltas when both are intervals (`intervalBreakdown`).
>
> **Rules:** reuse `analytics.ts` + `UPlotChart.svelte`. i18n. Works in demo mode
> (compare two mock workouts). **Acceptance:** picking two workouts shows aligned
> overlay charts + a delta table; clearly indicates which piece was better and by
> how much. Gate passes.

---

## Task 8 — Real PWA: offline + installable + mobile polish

> There is **no PWA manifest and no service worker** today (`static/` only has
> `favicon.svg`). Build the whole PWA story from scratch.
>
> **Build:**
> 1. A **service worker** (SvelteKit `src/service-worker.ts`) that precaches the
>    app shell + static assets and serves the dashboard/replay offline for
>    already-viewed workouts (cache the cached-detail JSON responses). Pick a sane
>    strategy (network-first for data, cache-first for shell). Handle updates
>    (skipWaiting + a "new version" toast).
> 2. **Installability**: create `static/manifest.webmanifest` (name, theme/bg color
>    matching the RACE BOARD tokens, display `standalone`, start_url) and link it
>    from `src/app.html`. Add maskable PNG icons at 192 + 512. Verify it passes
>    Lighthouse PWA install criteria.
> 3. **Mobile polish pass** at 390px (phone) + 768px (tablet): screenshot `/`,
>    `/dashboard`, a `/replay/<id>` against `npm run preview`; fix any
>    overflow/cramping, especially the replay transport controls and any new
>    Task 2–7 UI. Re-screenshot to confirm.
>
> **Rules:** must not break SSR or the Workers asset server (test on
> `npm run preview`, not just `vite dev`). i18n the update toast. **Acceptance:**
> app is installable, dashboard + a previously-viewed replay work offline (airplane
> mode), no layout overflow on phone/tablet. Gate passes.

---

## Task 10 — Unit test the pure core + wire CI (lock in correctness before scaling)

> The only tests today are one Playwright smoke suite. `analytics.ts`,
> `format.ts`, and `replay/engine.ts` are full of **pure functions** that are
> trivially unit-testable and are exactly where a subtle bug (wrong pace unit,
> off-by-one interval, NaN power) would silently corrupt every view above.
>
> **Build:**
> 1. Add **Vitest** (`npm run test`) and write unit tests for the pure libs:
>    `analytics.ts` (every exported fn — feed known stroke/workout fixtures, assert
>    PBs, HR zones, power curve, interval breakdown, training load, calendar),
>    `format.ts` (pace/time/distance formatting incl. the bike per-1000m and
>    interval-reset edge cases called out in `AGENTS.md`), and `replay/engine.ts`
>    (`sampleAt` interpolation at boundaries + mid-stroke). Use the mock data as
>    fixtures where possible.
> 2. Add a **GitHub Actions CI** workflow (`.github/workflows/ci.yml`) running
>    `npm ci`, `npm run check`, `npm run build`, `npm run test`, and
>    `npm run test:e2e` (install WebKit deps) on PRs to `main`. Make the gate
>    actually enforced.
>
> **Rules:** tests run in plain Node (no Workers runtime needed for pure libs).
> Don't test `state_referenced_locally` false positives. **Acceptance:**
> `npm run test` runs a meaningful suite that's green; CI runs the full gate on
> every PR. Gate passes.

---

## Parking lot (real, but below the top 10)

- **Live/near-live mode**: poll the logbook (or ErgData webhook if/when available)
  so a just-finished piece shows up without a manual sync.
- **Leaderboards / multiplayer race**: race ghosts of *other* rowplay users on the
  same workout (extends Task 2 + Task 3's share infra).
- **Coaching annotations**: let a coach leave timestamped notes on a shared replay.
- **Heart-rate device import** for workouts logged without HR.
- **More languages** beyond en/zh (the i18n infra already supports it).
- **Detail-cache TTL / re-hydration** policy beyond PR #18's version bump.

When you finish a task, **delete it from this file** (or move it to a "Done" note)
and open the PR — keep this backlog the single source of truth for what's left.
