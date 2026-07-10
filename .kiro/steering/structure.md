# Project Structure & Conventions

## Root layout

```
.github/workflows/  CI, locale validation, and Playwright workflows
.kiro/              steering, skills, and implementation specs
docs/               repository-backed English user-guide reference
scripts/            build helpers
src/                SvelteKit application
static/             static assets
tests/e2e/          Playwright smoke and full-browser specs
wrangler.jsonc      Cloudflare Worker configuration (no KV/D1 bindings)
```

## Source boundaries

```
src/
  components/       focused reusable Svelte UI
  lib/
    analytics.ts    pure dashboard analysis
    goals.ts        annual-goal cookie payload helpers
    locales/        all user-visible copy, one dictionary per language
    replay/         browser-side engine, renderers, source parsers, ghost helpers
    server/         Worker-only Concept2, session, export, data, and logging code
    types.ts        shared domain types
    workoutQuery.ts query parsing/filtering/sorting
  routes/
    auth/           BYOT entry and optional OAuth callbacks
    api/            live reads, export, goals, timezone, live poll, retired routes
    dashboard/      live-history analytics and workout list
    replay/[id]/    workout detail replay
    settings/       export and authenticated home timezone
    docs/           localized user guide
```

`src/lib/server/` must not be imported into browser components. Keep new logic
in the narrowest existing boundary: pure calculations in `lib/`, Worker-only
network/cookie behavior in `lib/server/`, and route orchestration in `routes/`.
Do not recreate a database/cache abstraction: persistent Worker storage is an
explicit non-goal.

## Svelte and styling

- Use Svelte 5 runes, keyed `{#each}` blocks, snippets for composition, and
  `onclick` rather than legacy event directives.
- Prefer daisyUI components (`btn`, `card`, `input`, `select`, `toggle`) before
  bespoke controls. Retain rowplay layout hooks only where daisyUI has no
  equivalent.
- Use the established card shell:
  `card card-border bg-base-100 shadow-md p-5`.
- Chart colours come from `chartTheme()`/CSS tokens; do not hardcode hex colours
  in chart code.

## I18n, accessibility, and preferences

- Every visible string uses `i18n.t()` and every locale matches the English key
  shape. Run locale validation after changing keys or locale documentation.
- Preserve keyboard focus, semantic controls, labels, and clear toast/error
  feedback when changing a user flow.
- Theme and language are cookies. Session-only settings (timezone) are stored
  in the encrypted `rp_session` cookie; annual goals use an httpOnly cookie.

## Data, privacy, and testing

- Demo mode has deterministic mock data with no credentials. Authenticated data
  is read live from Concept2; full-history views page through results while
  near-live polling asks only for the newest page.
- Never add KV/D1 bindings, migrations, or server-persisted user features
  without an explicit product decision and new specification.
- Use `createLogger` for server logs and never emit tokens, cookie values, or
  full workout payloads.
- Co-locate Vitest tests with server/library files and route handlers. Use the
  `vp` quality gate plus Workers-preview Playwright smoke coverage for changed
  user flows.
