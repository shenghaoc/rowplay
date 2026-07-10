# Technology Stack

## Runtime and build

- TypeScript in strict mode, SvelteKit/Svelte 5 runes mode, Vite, and pnpm 11.
- Cloudflare Workers through `@sveltejs/adapter-cloudflare`; `wrangler.jsonc`
  declares only `ASSETS` plus observability configuration.
- Use the repository `vp` wrapper for install, lint, test, build, and preview.

## Frontend

- Tailwind CSS v4 and daisyUI 5 via the Vite CSS plugin; do not add a legacy
  `tailwind.config.js`.
- uPlot for charts, `@tanstack/svelte-virtual` for long workout lists,
  `@lucide/svelte` for icons, and `svelte-sonner` for feedback.
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`), keyed each blocks, and
  `onclick` handlers. All visible copy belongs in `src/lib/locales/`.
- `src/lib/datetime.ts` uses strict UTC parsing and `Intl.DateTimeFormat` for
  timezone projection; do not add a Temporal polyfill without a product need.

## Stateless server model

- The Worker has **no KV or D1 binding** and no server-side workout database.
- `src/lib/server/concept2.ts` is the server-only Concept2 API client.
  Dashboard/replay/export reads are live; full-history views follow API
  pagination, while near-live polling asks only for the newest page.
- `src/lib/server/session.ts` AES-GCM seals `rp_session` with `SESSION_SECRET`.
  It holds the identity, optional OAuth tokens, and home timezone. BYOT raw
  tokens use the separate sealed httpOnly `rp_tok` cookie.
- Cookie preferences are server-readable only: goals use `annual_goal` and the
  timezone stays within `rp_session`. Scope an authenticated goal to its user.
- Optional OAuth is enabled only when `CONCEPT2_CLIENT_ID` is configured.

## Server observability and privacy

- Use `createLogger(console)` from `src/lib/server/logger.ts`, never bare
  server-side `console.error`.
- Do not log cookies, personal tokens, full workouts, or sensitive profile data.
- Authenticated page/API responses must use `private, no-store` when they
  contain personal data.

## Testing and verification

- Vitest covers pure helpers, server data/session behavior, endpoints, Svelte
  reactive classes, and replay renderers. New server routes or library modules
  require a co-located test.
- Playwright smoke tests run against the built Workers preview runtime using
  Chromium. Run full E2E only when the task requires it.
- The normal gate is `vp run check` (format, lint, typecheck, Vitest, build).
  Run `vp run validate:locales` after changing i18n keys and
  `vp run test:e2e:smoke` for changed user flows.

## Configuration and commands

- Set `SESSION_SECRET` with `wrangler secret put`; set
  `CONCEPT2_CLIENT_SECRET` only for optional OAuth. `.dev.vars` is ignored.
- `vp dev` is quick UI development only. Use `vp run preview` for Workers
  runtime, authenticated cookies, and live-mode behavior.
- Common commands: `vp install`, `vp lint`, `vp run typecheck`, `vp test`,
  `vp build`, `vp run check`, `vp run validate:locales`, and
  `vp run test:e2e:smoke`.

## CI

- CI runs the `vp run check` equivalent on pull requests.
- Locale validation and the Chromium smoke suite run as dedicated checks.
- Full E2E runs on manual dispatch and nightly scheduling.
