# AGENTS.md

## Project

**rowplay** is a SvelteKit / Svelte 5 app: Concept2 logbook analytics plus a
real-time workout replay, deployed to **Cloudflare Workers** (static assets +
Worker via `@sveltejs/adapter-cloudflare`).

All server logic runs in SvelteKit endpoints on the Workers runtime. There is no
separate backend: the app talks to the Concept2 Logbook API over OAuth2
(server-side only) and caches hydrated workouts in Cloudflare D1.

## Key commands

All commands use **npm** (lockfile: `package-lock.json`). See `package.json`
`"scripts"` for the full list.

| Task         | Command                                                      |
| ------------ | ------------------------------------------------------------ |
| Install deps | `npm install`                                                |
| Dev server   | `npm run dev` (serves at `http://localhost:5173`)            |
| Type check   | `npm run check` (`svelte-kit sync` + `svelte-check`)         |
| Unit tests   | `npm run test` (Vitest; pure `analytics` / `format` / replay `engine`) |
| Build        | `npm run build` (outputs `.svelte-kit/cloudflare`)           |
| Preview      | `npm run preview` (build + `wrangler dev`, the real runtime) |
| Deploy       | `npm run deploy` (build + `wrangler deploy`)                 |
| D1 migrate   | `npm run db:migrate` (remote) / `db:migrate:local`           |

## Architecture

- `src/lib/server/` — server-only code: `concept2.ts` (OAuth + API client with
  token refresh), `session.ts` (KV-backed sessions), `db.ts` (D1 cache),
  `data.ts` (the demo/auth-aware data loader), `config.ts`.
- `src/lib/replay/` — `engine.ts` (pure rAF clock + `sampleAt` interpolation),
  `renderer.ts` (canvas course + ghost lane), `sports.ts` (per-sport theming).
- `src/lib/analytics.ts` — pure analysis functions (DPS, efficiency, HR zones,
  power curve, distance bands, linear trend). No DOM; safe on server or client.
- `src/routes/` — `auth/` (OAuth login/callback/logout), `api/` (JSON
  endpoints), `dashboard/`, `replay/[id]/`.
- `src/lib/i18n.ts` + `src/lib/i18n.svelte.ts` + `src/lib/locales/` — hand-rolled
  i18n (`en`, `zh`, `de`, `es`, `fr`, `ja`); pure dictionaries + reactive `I18n`
  class shared via Svelte context. Run `npm run validate:locales` after adding keys.
- `src/lib/theme.svelte.ts` — light/dark theme toggle, also via context.
- Charts use **uPlot**; styling uses **Tailwind CSS v4** plus CSS custom
  properties for theming in `src/app.css` and scoped component `<style>` blocks.

## Non-obvious caveats

- **Config is `wrangler.jsonc`**, not TOML. Bindings: `ASSETS` (static assets),
  `SESSIONS` (KV), `DB` (D1). KV/D1 ids are placeholders — fill them before any
  non-demo deploy or the Worker errors on the missing bindings at startup.
- **Demo mode**: when `CONCEPT2_CLIENT_ID` is unset, the app serves deterministic
  mock data (`src/lib/mockData.ts`) and skips auth — so `npm run dev` works with
  zero configuration. Real data needs the OAuth env vars + KV/D1.
- **Secrets** (`CONCEPT2_CLIENT_SECRET`, `SESSION_SECRET`) are set via
  `wrangler secret put`, never committed. Local dev reads them from `.dev.vars`.
- **Verify on the real runtime**: `vite dev` does not provide the Workers asset
  server or KV/D1 bindings. Use `wrangler dev` (via `npm run preview`) to test
  routing, bindings, and that `_worker.js` / sourcemaps are not served publicly.
- **Stroke-data units** (handled in `concept2.ts > mapStrokes`): stroke pace `p`
  is per-500m for rower/skierg but **per-1000m for the bike**; and for interval
  workouts `t`/`d` **restart at 0 each interval**. Both are normalised on read —
  keep that in mind before changing the parser.
- `npm run build` runs `scripts/postbuild.mjs`, which appends `_worker.js.map`
  to the adapter's `.assetsignore` (defensive; adapter 7 no longer emits it).
- A `tsconfig.json` warning about `.svelte-kit/tsconfig.json` before the first
  `svelte-kit sync` is harmless — it resolves after `npm run check` or dev runs.

## Svelte conventions

This is a runes-mode Svelte 5 project. Follow the bundled Svelte skills
(`svelte-core-bestpractices`, `svelte-code-writer`): prefer
`$state`/`$derived` over effects, keyed `{#each}`, `onclick={...}` handlers, and
snippets over slots.

## I18n & theming

- All user-visible strings go through `i18n.t('key.path')`, never hardcoded.
  Add keys to **every** locale under `src/lib/locales/` (start from `en.ts`).
- Language and theme state are `$state`-based classes (`I18n`, `Theme`) shared
  via `createContext` in the root layout — SSR-safe, no shared singletons.
- Preferences persist via cookies (`lang`, `theme`) so SSR matches the client.
- Sport names (RowErg, SkiErg, BikeErg) are Concept2 trademarks and left
  untranslated in both languages.

## Cursor Cloud specific instructions

- **No ESLint/Prettier scripts** — quality gate is `npm run check` (0 errors;
  a few `state_referenced_locally` warnings are expected).
- **Demo mode is the default** in this repo (`CONCEPT2_CLIENT_ID` empty in
  `wrangler.jsonc`). No `.dev.vars` or Concept2 credentials are required for
  dashboard/replay development or `npm run test:e2e`.
- **Two local URLs**: `npm run dev` → `http://localhost:5173` (fast UI iteration;
  no KV/D1). Workers-faithful runtime → `npm run preview` or Playwright’s
  `wrangler dev` on **`http://127.0.0.1:8787`** (see `playwright.config.ts`).
- **E2E** (`npm run test:e2e`): builds and starts `wrangler dev` automatically.
  - First run on a fresh VM needs WebKit system libs:
    `npx playwright install --with-deps webkit`.
  - Reuse an already-running preview with `npm run test:e2e:reuse`.
- **OAuth / sync / token auth** need `wrangler dev` (preview), local KV, and
  usually `npm run db:migrate:local` once; copy `.dev.vars.example` → `.dev.vars`
  for secrets. These flows are not testable on `vite dev` alone.
- **Hello-world check**: open `/dashboard`, follow a `/replay/<id>` link, press
  Play — canvas course and live pace/rate/power/HR should update.
