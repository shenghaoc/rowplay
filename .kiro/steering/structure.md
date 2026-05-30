# Project Structure & Conventions

## Root Layout

```
.github/workflows/       CI (ci.yml) and Claude automation (claude.yml)
migrations/              D1 SQL migration files (sequential: 0001_init.sql, 0002_workouts.sql, ...)
scripts/                 Build helpers (postbuild.mjs — patches .assetsignore)
src/                     Application source
static/                  Static assets served as-is (favicon.svg)
tests/e2e/               Playwright E2E specs
```

## Source Structure (`src/`)

```
src/
  app.css                Global styles (Tailwind imports + custom CSS)
  app.d.ts               SvelteKit ambient type declarations (App.Locals, App.Platform)
  app.html               HTML shell
  hooks.server.ts        SvelteKit server hooks (runs on every request)

  components/            Reusable Svelte components
    MetricGauge.svelte     Radial gauge for pace / stroke-rate / power / HR
    SportIcon.svelte       Ergometer sport icon
    UPlotChart.svelte      uPlot wrapper with reactive data binding
    WorkoutList.svelte     Virtualized workout list for the dashboard

  lib/
    analytics.ts           Pure analysis functions (DPS, efficiency, HR zones, power curve,
                           distance bands, linear trend) — no DOM, safe on server or client
    format.ts              Display formatting helpers
    i18n.ts                Pure i18n dictionaries (en/zh) + helpers (interpolation, persistence)
    i18n.svelte.ts         Reactive I18n class ($state) + Svelte context
    mockData.ts            Deterministic sample workouts for demo mode
    theme.svelte.ts        Reactive Theme class ($state, light/dark) + Svelte context
    types.ts               Core domain types: Workout, Stroke, Split

    replay/                Replay engine (client-side)
      engine.ts              rAF clock + sampleAt interpolation
      renderer.ts            Canvas course + ghost lane rendering
      sources.ts             Data source abstraction for replay inputs
      sports.ts              Per-sport theming (colors, icons, unit labels)

    server/                Server-only code (never shipped to the browser)
      concept2.ts            OAuth2 flow + Concept2 API client with token refresh
      config.ts              Environment / binding configuration
      data.ts                Demo/auth-aware data loader (routes data from mock or API)
      db.ts                  D1 cache layer for workouts and strokes
      session.ts             KV-backed session management

  routes/
    +layout.server.ts      Root layout server load (session / auth state)
    +layout.svelte         Root layout (nav, global UI shell)
    +page.svelte           Landing page (/)

    auth/
      login/+server.ts       Initiates OAuth2 redirect to Concept2
      callback/+server.ts    Handles OAuth2 callback, creates session
      logout/+server.ts      Destroys session
      token/                 Bring-your-own-token page (+page.server.ts, +page.svelte)

    api/
      sync/+server.ts        Triggers a full logbook sync
      workouts/+server.ts    GET /api/workouts — paginated workout list
      workouts/[id]/+server.ts  GET /api/workouts/:id — single workout with strokes

    dashboard/
      +page.server.ts        Loads workout summary data
      +page.svelte           Dashboard view (totals, pace trend, workout list)

    replay/[id]/
      +page.server.ts        Loads full workout detail + stroke data
      +page.svelte           Real-time replay view (canvas + gauges + charts)
```

## Conventions

### Svelte

- **Runes mode** (Svelte 5) — use `$state` / `$derived` / `$effect` instead of stores or reactive statements
- Prefer `$state` and `$derived` over `$effect` where possible
- Use keyed `{#each}` blocks
- Use `onclick={handler}` syntax (not `on:click`)
- Use snippets over slots for component composition
- Follow the bundled Svelte skills (`svelte-core-bestpractices`, `svelte-code-writer`)

### File Naming

- kebab-case for non-component files (`mock-data.ts`, `concept2.ts`)
- PascalCase for Svelte components (`MetricGauge.svelte`, `UPlotChart.svelte`)
- SvelteKit routing conventions for `+page.svelte`, `+server.ts`, `+page.server.ts`, `+layout.svelte`

### I18n & Theming

- All user-visible strings use `i18n.t('key.path')` — never hardcode English text in templates
- Dictionaries live in `src/lib/i18n.ts`; the reactive class in `i18n.svelte.ts`
- Language and theme state are `$state`-based classes shared via `createContext` in the root layout — SSR-safe, no module-level singletons
- Preferences persist via cookies (`lang`, `theme`) so SSR renders correctly with no hydration flash
- Sport names (RowErg, SkiErg, BikeErg) are Concept2 trademarks — left untranslated in both languages

### Architecture

- **No separate backend** — all server logic runs in SvelteKit endpoints on the Workers runtime
- **Server-only imports** go in `src/lib/server/` so SvelteKit tree-shakes them from client bundles
- **Pure functions** for analysis (`analytics.ts`) and replay sampling (`engine.ts > sampleAt`) — no side effects, safe to run anywhere
- **Demo mode** activates when `CONCEPT2_CLIENT_ID` is unset; no auth or external bindings required

### Database

- D1 migrations are sequential SQL files in `migrations/` (prefix `NNNN_`)
- The D1 cache is an optimization layer — the source of truth is the Concept2 API
- Stroke-data units are normalized on read in `concept2.ts > mapStrokes` (bike pace is per-1000m; interval `t`/`d` restart at 0 each interval)

### Secrets

- Never committed — set via `wrangler secret put` for production, `.dev.vars` for local dev
- Required secrets: `CONCEPT2_CLIENT_SECRET`, `SESSION_SECRET`
