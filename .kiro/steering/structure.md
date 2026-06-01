# Project Structure & Conventions

## Root Layout

```
.github/workflows/       CI (ci.yml) and Claude automation (claude.yml)
migrations/              D1 SQL migration files (sequential: 0001_init.sql, 0002_workouts.sql, ...)
scripts/                 Build helpers (postbuild.mjs — patches .assetsignore)
src/                     Application source
static/                  Static assets served as-is (favicon.svg)
tests/e2e/               Playwright E2E specs
tests/unit/              Vitest unit test fixtures and setup
```

## Source Structure (`src/`)

```
src/
  app.css                Global styles (Tailwind imports + CSS custom properties for theming)
  app.d.ts               SvelteKit ambient type declarations (App.Locals, App.Platform)
  app.html               HTML shell
  hooks.server.ts        SvelteKit server hooks (runs on every request)

  components/            Reusable Svelte components
    CriticalPowerPanel.svelte  Critical power / FTP analysis panel
    EngagementPanel.svelte     Training engagement / PMC panel
    MetricGauge.svelte         Radial gauge for pace / stroke-rate / power / HR
    SportIcon.svelte           Ergometer sport icon
    TrainingHeatmap.svelte     Calendar heatmap of training volume
    UPlotChart.svelte          uPlot wrapper with reactive data binding
    WorkoutList.svelte         Virtualized workout list for the dashboard
    WorkoutListFilters.svelte  Filter controls for the workout list

  lib/
    analytics.ts           Pure analysis functions — no DOM, safe on server or client:
                           DPS, efficiency, HR zones, power curve, distance bands,
                           linear trend, critical power (CP/W′), training load (PMC/CTL/ATL/TSB),
                           interval breakdown, calendar heatmap, personal bests, sport summaries
    analytics.test.ts      Vitest unit tests for analytics
    chartTheme.ts          uPlot chart theming — reads live CSS custom properties so
                           light/dark palette changes flow through automatically;
                           includes baseOptions() builder and withAlpha() helper
    chartTheme.test.ts     Vitest unit tests for chartTheme
    datetime.ts            Temporal API helpers for logbook date parsing and formatting
    ensure-temporal.ts     Temporal polyfill bootstrap (call before SSR or client render)
    format.ts              Display formatting helpers (pace, distance, time, watts)
    format.test.ts         Vitest unit tests for format
    goals.ts               Annual goal helpers (cookie serialization, defaults)
    i18n.ts                Pure i18n dictionaries (en/zh) + helpers (interpolation, persistence)
    i18n.svelte.ts         Reactive I18n class ($state) + Svelte context
    i18nPlural.ts          Plural-form helpers for i18n
    mockData.ts            Deterministic sample workouts for demo mode
    pwa-update.ts          PWA service worker update helper
    theme.svelte.ts        Reactive Theme class ($state, light/dark) + Svelte context
    types.ts               Core domain types: Sport, Workout, Stroke, Split, WorkoutDetail
    workoutQuery.ts        Workout list query parsing, serialization, filtering, sorting;
                           distance/duration chips; PB detection helpers

    replay/                Replay engine (client-side)
      engine.ts              rAF clock + sampleAt interpolation
      engine.test.ts         Vitest unit tests for engine
      ghostPick.ts           Ghost selection logic for race comparisons
      ghostPick.test.ts      Vitest unit tests for ghostPick
      raceCard.ts            Race card data model for ghost racing
      renderer.ts            Canvas course + ghost lane rendering
      renderer.test.ts       Vitest unit tests for renderer
      sources.ts             Data source abstraction for replay inputs
      sports.ts              Per-sport theming (colors, icons, unit labels)

    server/                Server-only code (never shipped to the browser)
      concept2.ts            Concept2 API client (+ optional OAuth2 when configured)
      config.ts              Environment / binding configuration
      data.ts                Demo/auth-aware data loader (routes data from mock or API/D1)
      db.ts                  D1 cache layer for workouts, strokes, PBs, goals, sync state
      export.ts              Workout data export helpers
      session.ts             KV-backed session management
      share.ts               Shareable replay link helpers

  routes/
    +layout.server.ts      Root layout server load (session / auth state, lang, theme)
    +layout.svelte         Root layout (nav, global UI shell)
    +page.svelte           Landing page (/)

    auth/
      login/+server.ts       Optional OAuth2 redirect (when CONCEPT2_CLIENT_ID set)
      callback/+server.ts    Optional OAuth2 callback
      logout/+server.ts      Destroys session
      token/                 Primary auth: paste personal API token (+page.server.ts, +page.svelte)

    api/
      account/delete/+server.ts  POST /api/account/delete — purge user data
      export/+server.ts          GET /api/export — bulk workout export
      export/[id]/+server.ts     GET /api/export/:id — single workout export
      goals/+server.ts           GET/PUT /api/goals — annual goal persistence
      sync/+server.ts            POST /api/sync — triggers a full logbook sync
      workouts/+server.ts        GET /api/workouts — paginated workout list
      workouts/[id]/+server.ts   GET /api/workouts/:id — single workout with strokes

    compare/
      +page.server.ts        Loads workouts for side-by-side comparison
      +page.svelte           Workout comparison view

    dashboard/
      +page.server.ts        Loads workout summary data, aggregates, annual goal
      +page.svelte           Dashboard view (totals, pace trend, workout list, PMC)

    r/[token]/
      +page.server.ts        Loads shared replay via token
      +page.svelte           Public shared replay view

    replay/[id]/
      +page.server.ts        Loads full workout detail + stroke data
      +page.svelte           Real-time replay view (canvas + gauges + charts)

    settings/
      +page.server.ts        Loads user settings
      +page.svelte           Settings page (language, theme, annual goal, account)
```

## Conventions

### Svelte

- **Runes mode** (Svelte 5) — use `$state` / `$derived` / `$effect` instead of stores or reactive statements
- Prefer `$state` and `$derived` over `$effect` where possible
- Use keyed `{#each}` blocks
- Use `onclick={handler}` syntax (not `on:click`)
- Use snippets over slots for component composition
- Follow the bundled Svelte skills in `.kiro/skills/` (`svelte-core-bestpractices`, `svelte-code-writer`)

### Styling

- **Tailwind CSS v4** for utility classes
- CSS custom properties in `app.css` for design tokens (colors, chart palette, theme variants)
- Scoped `<style>` blocks in components for component-specific styles
- Chart colors are resolved from live CSS custom properties via `chartTheme()` — never hardcode hex values for charts

### File Naming

- kebab-case for non-component files (`mock-data.ts`, `concept2.ts`)
- PascalCase for Svelte components (`MetricGauge.svelte`, `UPlotChart.svelte`)
- SvelteKit routing conventions for `+page.svelte`, `+server.ts`, `+page.server.ts`, `+layout.svelte`
- Test files co-located with source: `engine.test.ts` next to `engine.ts`

### I18n & Theming

- All user-visible strings use `i18n.t('key.path')` — never hardcode English text in templates
- Dictionaries live in `src/lib/i18n.ts`; the reactive class in `i18n.svelte.ts`
- Language and theme state are `$state`-based classes shared via `createContext` in the root layout — SSR-safe, no module-level singletons
- Preferences persist via cookies (`lang`, `theme`) so SSR renders correctly with no hydration flash
- Sport names (RowErg, SkiErg, BikeErg) are Concept2 trademarks — left untranslated in both languages

### Architecture

- **No separate backend** — all server logic runs in SvelteKit endpoints on the Workers runtime
- **Server-only imports** go in `src/lib/server/` so SvelteKit tree-shakes them from client bundles
- **Pure functions** for analysis (`analytics.ts`) and replay sampling (`engine.ts > sampleAt`) — no side effects, safe to run anywhere and easy to unit test
- **Demo mode** when no session: mock data, no auth required. **BYOT** is the production auth path; OAuth is optional when `CONCEPT2_CLIENT_ID` is set

### Database

- D1 migrations are sequential SQL files in `migrations/` (prefix `NNNN_`)
- The D1 cache is an optimization layer — the source of truth is the Concept2 API
- Stroke-data units are normalized on read in `concept2.ts > mapStrokes` (bike pace is per-1000m; interval `t`/`d` restart at 0 each interval)

### Secrets

- Never committed — set via `wrangler secret put` for production, `.dev.vars` for local dev
- Required secret: `SESSION_SECRET`. `CONCEPT2_CLIENT_SECRET` only if OAuth is enabled
