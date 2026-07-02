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
    AnnotationPanel.svelte     Coaching-note CRUD panel (replay page)
    ChipButton.svelte          Pill/chip toggle button
    ChipGroup.svelte           Group of chip buttons for filter UIs
    CriticalPowerPanel.svelte  Critical power / FTP analysis panel
    EngagementPanel.svelte     Training engagement / PMC panel
    InspectorPanel.svelte      Raw-field inspector overlay (replay page)
    LanguagePicker.svelte      Language selector dropdown
    LiveModePanel.svelte       Live / near-live polling panel (dashboard)
    MetricGauge.svelte         Radial gauge for pace / stroke-rate / power / HR
    SportIcon.svelte           Ergometer sport icon
    TrainingHeatmap.svelte     Calendar heatmap of training volume
    UPlotChart.svelte          uPlot wrapper with reactive data binding
    WorkoutList.svelte         Virtualized workout list for the dashboard
    WorkoutListFilters.svelte  Filter controls for the workout list

  lib/
    analytics.ts              Pure analysis functions — no DOM, safe on server or client:
                              DPS, efficiency, HR zones, power curve, distance bands,
                              linear trend, critical power (CP/W′), training load (PMC/CTL/ATL/TSB),
                              interval breakdown, calendar heatmap, personal bests, sport summaries
    analytics.test.ts         Vitest unit tests for analytics
    analytics-newpbs.ts       New-PB detection helpers (detectNewPBs, distancePBs)
    analytics-newpbs.test.ts  Vitest unit tests for analytics-newpbs
    chartTheme.ts             uPlot chart theming — reads live CSS custom properties so
                              light/dark palette changes flow through automatically;
                              includes baseOptions() builder and withAlpha() helper
    chartTheme.test.ts        Vitest unit tests for chartTheme
    daisyui-collision.ts      daisyUI v5 class collision guard (token validator + layout-hook set)
    datetime.ts               Date/Intl helpers for logbook date parsing and formatting
    datetime.test.ts          Vitest unit tests for datetime
    exrSource.ts              EXR (third-party rowing app) source-flag detection
    exrSource.test.ts         Vitest unit tests for exrSource
    format.ts                 Display formatting helpers (pace, distance, time, watts)
    format.test.ts            Vitest unit tests for format
    goals.ts                  Annual goal helpers (cookie serialization, defaults)
    goals.test.ts             Vitest unit tests for goals
    hrImport.ts               Heart-rate import/merge helpers (client-side CSV/TCX/FIT parsing)
    hrImport.test.ts          Vitest unit tests for hrImport
    i18n.ts                   Pure i18n types/helpers (language list, interpolation, persistence)
    i18n.test.ts              Vitest unit tests for i18n helpers
    i18n.svelte.ts            Reactive I18n class ($state) + Svelte context
    i18n.svelte.test.ts       Vitest unit tests for I18n reactive class (Node-only, no jsdom)
    i18nPlural.ts             Plural-form helpers for i18n
    i18nPlural.test.ts        Vitest unit tests for i18nPlural
    leaderboard.ts            Leaderboard domain logic (standard distances, board keys, entry types)
    leaderboard.test.ts       Vitest unit tests for leaderboard
    liveMode.ts               Pure live-mode helpers (poll interval, failure tracking)
    liveMode.test.ts          Vitest unit tests for liveMode
    liveMode.svelte.ts        Reactive LiveMode class ($state) — live/near-live polling
    liveMode.svelte.test.ts   Vitest unit tests for LiveMode reactive class (fake timers, no DOM)
    mockData.ts               Deterministic sample workouts for demo mode
    mockData.test.ts          Vitest unit tests for mockData
    mockLeaderboard.ts        Demo-mode leaderboard data
    pwa-update.ts             PWA service worker update helper
    theme.svelte.ts           Reactive Theme class ($state, light/dark) + Svelte context
    theme.svelte.test.ts      Vitest unit tests for Theme reactive class (Node-only, no jsdom)
    types.ts                  Core domain types: Sport, Workout, Stroke, Split, WorkoutDetail
    workoutQuery.ts           Workout list query parsing, serialization, filtering, sorting;
                              distance/duration chips; PB detection helpers
    workoutQuery.test.ts      Vitest unit tests for workoutQuery

    locales/                  i18n locale dictionaries (en, zh, de, es, fr, ja)
      locales.test.ts           Key-completeness test: all non-English locales must match `en`

    replay/                Replay engine (client-side)
      engine.ts              rAF clock + sampleAt interpolation
      engine.test.ts         Vitest unit tests for engine
      ghostPick.ts           Ghost selection logic for race comparisons
      ghostPick.test.ts      Vitest unit tests for ghostPick
      inspector.ts           Raw-field inspector (split index, stroke lookup)
      inspector.test.ts      Vitest unit tests for inspector
      raceCard.ts            Race card PNG export via OffscreenCanvas
      renderer.ts            2D canvas course + ghost lane rendering
      renderer.test.ts       Vitest unit tests for renderer
      renderer3d.ts          Three.js 3D course renderer (shared WebGL/WebGPU scene graph)
      renderer3d.test.ts     Vitest unit tests for renderer3d (partial THREE mock — WebGLRenderer only)
      renderer3dLoader.ts    WebGPU-first/WebGL-fallback dynamic import factory
      renderer3dWebGPU.ts    Lazy WebGPURenderer entry point
      renderer3dLoader.test.ts  Vitest unit tests for renderer3dLoader
      replayRenderer.ts      Renderer preference persistence (2D/3D, quality)
      replayRenderer.test.ts Vitest unit tests for replayRenderer
      rivalGhost.ts          Rival ghost trace types + share-token helpers
      rivalGhost.test.ts     Vitest unit tests for rivalGhost
      sources.ts             Data source abstraction for replay inputs
      sources.test.ts        Vitest unit tests for sources (parsePaceInput, parseWorkoutFile)
      sports.ts              Per-sport theming (colors, icons, unit labels)
      sports.test.ts         Vitest unit tests for sports

    server/                Server-only code (never shipped to the browser)
      concept2.ts            Concept2 API client (+ optional OAuth2 when configured)
      concept2-strokes.test.ts  Vitest unit tests for mapStrokes, redirectUri, buildAuthorizeUrl
      config.ts              Environment / binding configuration
      config.test.ts         Vitest unit tests for getConfig
      data.ts                Demo/auth-aware data loader (routes data from mock or API/D1)
      data.test.ts           Vitest unit tests for data layer (demo mode + auth guards)
      db.ts                  D1 cache layer for workouts, strokes, PBs, goals, sync state
      db.test.ts             Vitest unit tests for all D1 CRUD functions (fake D1 pattern)
      export.ts              Workout data export helpers
      export.test.ts         Vitest unit tests for export (CSV, JSON, TCX, filenames)
      hrImport.ts            Heart-rate data import helpers
      hrImport.test.ts       Vitest unit tests for hrImport (auth guards)
      leaderboard.ts         Leaderboard publish/withdraw helpers
      leaderboard-publish.test.ts  Vitest unit tests for leaderboard (demo + auth guards)
      rivalGhost.ts          Rival ghost trace loader
      rivalGhost.test.ts     Vitest unit tests for rivalGhost (GHOST_TRACE_CACHE, loadRivalGhostTrace)
      session.ts             KV-backed session management
      session.test.ts        Vitest unit tests for session lifecycle (fake KV pattern)
      share.ts               Shareable replay link helpers
      share.test.ts          Vitest unit tests for share helpers
      share-extended.test.ts Vitest unit tests for generateShareToken, shareMeta
      tokenCrypto.ts         Sealed-token encryption for httpOnly BYOT cookie
      tokenCrypto.test.ts    Vitest unit tests for tokenCrypto
      detailCache.ts         Workout-detail D1 cache with TTL management
      detailCache.test.ts    Vitest unit tests for detailCache

  routes/
    +layout.server.ts      Root layout server load (session / auth state, lang, theme)
    +layout.svelte         Root layout (nav, global UI shell)
    +page.svelte           Landing page (/)

    auth/
      login/+server.ts         Optional OAuth2 redirect (when CONCEPT2_CLIENT_ID set)
      login/server.test.ts     Vitest unit tests for login handler
      callback/+server.ts      Optional OAuth2 callback
      callback/server.test.ts  Vitest unit tests for callback handler
      logout/+server.ts        Destroys session
      logout/server.test.ts    Vitest unit tests for logout handler
      token/                   Primary auth: paste personal API token (+page.server.ts, +page.svelte)
      token/page.server.test.ts  Vitest unit tests for token load + actions

    api/
      account/delete/+server.ts        POST /api/account/delete — purge user data
      account/delete/server.test.ts    Vitest unit tests
      export/+server.ts                GET /api/export — bulk workout export
      export/server.test.ts            Vitest unit tests
      export/[id]/+server.ts           GET /api/export/:id — single workout export
      export/[id]/server.test.ts       Vitest unit tests
      ghost/[token]/+server.ts         GET /api/ghost/:token — rival ghost trace
      ghost/[token]/server.test.ts     Vitest unit tests
      goals/+server.ts                 GET/PUT /api/goals — annual goal persistence
      goals/server.test.ts             Vitest unit tests
      leaderboard/publish/+server.ts   POST/DELETE /api/leaderboard/publish
      leaderboard/publish/server.test.ts  Vitest unit tests
      live/mock/+server.ts             GET /api/live/mock — demo live workout generator
      live/mock/server.test.ts         Vitest unit tests
      live/poll/+server.ts             GET /api/live/poll — near-live polling
      live/poll/server.test.ts         Vitest unit tests
      sync/+server.ts                  POST /api/sync — triggers a full logbook sync
      sync/server.test.ts              Vitest unit tests
      webhooks/ergdata/+server.ts      POST /api/webhooks/ergdata — ErgData webhook (HMAC)
      webhooks/ergdata/server.test.ts  Vitest unit tests
      workouts/+server.ts              GET /api/workouts — paginated workout list
      workouts/server.test.ts          Vitest unit tests
      workouts/[id]/+server.ts         GET /api/workouts/:id — single workout with strokes
      workouts/[id]/server.test.ts     Vitest unit tests
      workouts/[id]/annotations/+server.ts      GET/POST/DELETE annotations
      workouts/[id]/annotations/server.test.ts  Vitest unit tests
      workouts/[id]/hr-import/+server.ts        POST/DELETE heart-rate import
      workouts/[id]/hr-import/server.test.ts    Vitest unit tests
      workouts/[id]/share/+server.ts            GET share token/URL
      workouts/[id]/share/server.test.ts        Vitest unit tests

    compare/
      +page.server.ts          Loads workouts for side-by-side comparison
      page.server.test.ts      Vitest unit tests
      +page.svelte             Workout comparison view

    dashboard/
      +page.server.ts          Loads workout summary data, aggregates, annual goal
      page.server.test.ts      Vitest unit tests
      +page.svelte             Dashboard view (totals, pace trend, workout list, PMC)

    leaderboard/
      +page.server.ts          Loads leaderboard entries
      page.server.test.ts      Vitest unit tests

    r/[token]/
      +page.server.ts          Loads shared replay via token
      page.server.test.ts      Vitest unit tests
      +page.svelte             Public shared replay view

    replay/[id]/
      +page.server.ts          Loads full workout detail + stroke data
      page.server.test.ts      Vitest unit tests
      +page.svelte             Real-time replay view (canvas + gauges + charts)

    settings/
      +page.server.ts          Loads user settings
      page.server.test.ts      Vitest unit tests
      +page.svelte             Settings page (language, theme, annual goal, account)
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
- **daisyUI v5** component classes (`btn`, `card`, `badge`, `toggle`, `join`, `tabs`, …) — prefer idiomatic daisyUI over custom CSS
- Card containers: `class="card card-border bg-base-100 shadow-md p-5"` — use this consistently across all pages
- Badge modifiers: always include a variant (`badge-soft`, `badge-outline`) and a semantic color (`badge-primary`, `badge-info`, `badge-warning`, …)
- CSS custom properties in `app.css` for design tokens (colors, chart palette, theme variants)
- Scoped `<style>` blocks in components for component-specific styles
- Chart colors are resolved from live CSS custom properties via `chartTheme()` — never hardcode hex values for charts

### File Naming

- camelCase for non-component TypeScript files (`mockData.ts`, `concept2.ts`, `chartTheme.ts`)
- PascalCase for Svelte components (`MetricGauge.svelte`, `UPlotChart.svelte`)
- SvelteKit routing conventions for `+page.svelte`, `+server.ts`, `+page.server.ts`, `+layout.svelte`
- Test files co-located with source: `engine.test.ts` next to `engine.ts`; route tests use `server.test.ts` / `page.server.test.ts` in the same directory as the handler

### I18n & Theming

- All user-visible strings use `i18n.t('key.path')` — never hardcode English text in templates
- Dictionaries live in `src/lib/locales/` (en, zh, de, es, fr, ja); the reactive class in `i18n.svelte.ts`
- Language and theme state are `$state`-based classes shared via `createContext` in the root layout — SSR-safe, no module-level singletons
- Preferences persist via cookies (`lang`, `theme`) so SSR renders correctly with no hydration flash
- Sport names (RowErg, SkiErg, BikeErg) are Concept2 trademarks — left untranslated in all locales

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
