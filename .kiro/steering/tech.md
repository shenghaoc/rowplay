# Technology Stack

## Runtime & Build

- **Node.js** toolchain with **npm** as the package manager (lockfile: `package-lock.json`)
- **TypeScript** in strict mode (`tsconfig.json` extends SvelteKit's generated config)
- **Vite** for dev server and build
- **Cloudflare Workers** as the production runtime via `@sveltejs/adapter-cloudflare`

## Frontend

- **SvelteKit** (Svelte 5, runes mode) — the app framework for both SSR and client-side routing
- **Tailwind CSS v4** via `@tailwindcss/vite` — utility-first styling
- **daisyUI 5** (`daisyui` devDependency) — component classes via the Tailwind CSS v4 CSS plugin (no `tailwind.config.js`). Official install: [SvelteKit](https://daisyui.com/docs/install/sveltekit/), [general](https://daisyui.com/docs/install/). Agent skill: [`.kiro/skills/daisyui/SKILL.md`](../skills/daisyui/SKILL.md)
- **uPlot** — lightweight charting for telemetry (pace, stroke-rate, power, heart-rate)
- **@lucide/svelte** — icon library
- **@tanstack/svelte-virtual** — virtualized lists for the workout list
- **svelte-sonner** — toast notifications
- **temporal-polyfill** — Temporal API polyfill when `globalThis.Temporal` is missing (WebKit, Workers SSR); skipped on Node 26+ / Chromium when native

> **Stack audit (June 2026):** See `.kiro/specs/platform-modernization-audit/` for the full dependency, HTML/CSS/JS, and PR #223 modernization review. `bits-ui`, `clsx`, and `tailwind-merge` are listed in `package.json` but unused in `src/` — remove or wire up per audit `tasks.md`.

## I18n & Theming

- Hand-rolled i18n — no library. Pure dictionaries and helpers in `i18n.ts`; reactive `I18n` class (Svelte 5 `$state`) in `i18n.svelte.ts`; plural helpers in `i18nPlural.ts`
- Languages: `en`, `zh`, `de`, `es`, `fr`, `ja` (bundled under `src/lib/locales/`), with `{param}` interpolation
- Light/dark theme via `Theme` class in `theme.svelte.ts`; CSS custom properties in `app.css`
- Both are SSR-safe: state seeded from cookies (`lang`, `theme`) so server and client agree; shared via `createContext`, not module singletons

## Backend (SvelteKit Endpoints on Workers)

- **Cloudflare KV** (`SESSIONS` binding) — session storage (personal API token or optional OAuth tokens)
- **Cloudflare D1** (`DB` binding) — SQLite database caching hydrated workouts and per-stroke detail so replays are instant
- **Concept2 Logbook API** — read server-side only. **Primary auth:** user pastes a read-only personal API token at `/auth/token`. **Optional:** OAuth2 if `CONCEPT2_CLIENT_ID` is configured

## Testing

- **Vitest** — unit tests for pure functions (`npm run test` / `npm run test:watch`)
- **Playwright** — E2E smoke tests run against the production build on the real Workers runtime (`wrangler dev`), not `vite dev`
- **svelte-check** — TypeScript type checking for `.svelte` and `.ts` files

## Configuration

- `wrangler.jsonc` (JSONC, not TOML) — Cloudflare Worker configuration including KV/D1 bindings and environment vars
- `.dev.vars` (git-ignored) — local development secrets
- `wrangler secret put SESSION_SECRET` — required for production sessions. `CONCEPT2_CLIENT_SECRET` only if OAuth is enabled

## Development Commands

| Task              | Command                    |
| ----------------- | -------------------------- |
| Install deps      | `npm install`              |
| Dev server        | `npm run dev`              |
| Type check        | `npm run check`            |
| Unit tests        | `npm run test`             |
| Unit tests watch  | `npm run test:watch`       |
| Build             | `npm run build`            |
| Preview (Workers) | `npm run preview`          |
| Deploy            | `npm run deploy`           |
| D1 migrate local  | `npm run db:migrate:local` |
| D1 migrate remote | `npm run db:migrate`       |
| E2E tests         | `npm run test:e2e`         |

## CI

- GitHub Actions (`.github/workflows/ci.yml`)
- Dependabot for automated dependency updates
