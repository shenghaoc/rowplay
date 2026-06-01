# Technology Stack

## Runtime & Build

- **Node.js** toolchain with **npm** as the package manager (lockfile: `package-lock.json`)
- **TypeScript** in strict mode (`tsconfig.json` extends SvelteKit's generated config)
- **Vite** for dev server and build
- **Cloudflare Workers** as the production runtime via `@sveltejs/adapter-cloudflare`

## Frontend

- **SvelteKit** (Svelte 5, runes mode) — the app framework for both SSR and client-side routing
- **Tailwind CSS v4** via `@tailwindcss/vite` — utility-first styling
- **uPlot** — lightweight charting for telemetry (pace, stroke-rate, power, heart-rate)
- **bits-ui** — headless Svelte UI primitives
- **@lucide/svelte** — icon library
- **@tanstack/svelte-virtual** — virtualized lists for the workout list
- **svelte-sonner** — toast notifications
- **clsx** + **tailwind-merge** — conditional class composition
- **temporal-polyfill** — Temporal API polyfill for date/time handling

## I18n & Theming

- Hand-rolled i18n — no library. Pure dictionaries and helpers in `i18n.ts`; reactive `I18n` class (Svelte 5 `$state`) in `i18n.svelte.ts`; plural helpers in `i18nPlural.ts`
- Languages: English (`en`) and Chinese Simplified (`zh`), with `{param}` interpolation
- Light/dark theme via `Theme` class in `theme.svelte.ts`; CSS custom properties in `app.css`
- Both are SSR-safe: state seeded from cookies (`lang`, `theme`) so server and client agree; shared via `createContext`, not module singletons

## Backend (SvelteKit Endpoints on Workers)

- **Cloudflare KV** (`SESSIONS` binding) — short-lived session storage for OAuth tokens and login state
- **Cloudflare D1** (`DB` binding) — SQLite database caching hydrated workouts and per-stroke detail so replays are instant
- **Concept2 Logbook API** — OAuth2 server-side flow for authentication and workout data retrieval

## Testing

- **Vitest** — unit tests for pure functions (`npm run test` / `npm run test:watch`)
- **Playwright** — E2E smoke tests run against the production build on the real Workers runtime (`wrangler dev`), not `vite dev`
- **svelte-check** — TypeScript type checking for `.svelte` and `.ts` files

## Configuration

- `wrangler.jsonc` (JSONC, not TOML) — Cloudflare Worker configuration including KV/D1 bindings and environment vars
- `.dev.vars` (git-ignored) — local development secrets
- `wrangler secret put` — production secrets (`CONCEPT2_CLIENT_SECRET`, `SESSION_SECRET`)

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
