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

## daisyUI (Tailwind CSS v4 plugin)

rowplay follows the official **SvelteKit + Tailwind v4** install path. Do not add `tailwind.config.js` or `plugins: [require('daisyui')]` — that is the old Tailwind 3 setup.

### Baseline (matches upstream docs)

| Piece | Location |
| ----- | -------- |
| Packages | `tailwindcss`, `@tailwindcss/vite`, `daisyui` in `package.json` |
| Vite | `tailwindcss()` then `sveltekit()` in `vite.config.ts` |
| Plugin | `@import 'tailwindcss';` and `@plugin "daisyui";` in `src/app.css` |
| Global CSS | `import '../app.css'` in `src/routes/+layout.svelte` |

### rowplay extensions (intentional)

Configured in `src/app.css`:

- **`themes: rowplay --default, dark`** plus `@plugin "daisyui/theme"` blocks for Jet Set Blue palettes.
- **Brand polish** — global rules on `.btn`, `.badge`, `.card` in `app.css` (fonts, shadows, soft badges).
- **Custom tokens** — `--paper`, `--ink`, `--live`, etc. alongside daisyUI semantic colors (`primary`, `base-100`, …).

### Markup conventions

- Use **prefixed** daisyUI component + modifier classes: `btn btn-primary`, `input input-bordered`, `stat-title`, `toggle toggle-primary`.
- Use **rowplay-specific layout hooks** only where daisyUI has no equivalent: `dash-stats` (not `stats`), replay canvas, charts, sport metric colors (`--pace`, `--hr`).
- Avoid the daisyUI **`stats` container** on the dashboard summary grid — it forces `inline-grid` columns. Use a custom `dash-stats` CSS grid with `stat` cells and `stat-title` / `stat-value` parts instead.
- Do not put `toggle` on a `<label>`; put `toggle` on the `<input type="checkbox">`. Use `label` on the label wrapper when following daisyUI’s toggle pattern.

### Tooling and tests

- - `src/lib/daisyui-collision.ts` + `daisyui-collision-guard.test.ts` — CI fails if markup uses the daisyUI **`stats` container** as a custom layout hook (`btn`, `card`, `badge`, …).
- `src/lib/mobile-stats-spacing.test.ts` — dashboard stat grid spacing regression tests (uses `stat-*` parts).

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

- **Vitest** — unit tests (`npm run test` / `npm run test:watch`); 692 tests across 69 files
- **@vitest/coverage-v8** — coverage reporter; `provider: 'v8'`, `reporter: ['text', 'lcov']`, scoped to `src/**/*.ts` (excludes `*.test.ts`, `*.svelte.ts`, generated `*.d.ts`)
- **Playwright** — E2E smoke tests run against the production build on the real Workers runtime (`wrangler dev`), not `vite dev`
- **svelte-check** — TypeScript type checking for `.svelte` and `.ts` files

### Test scope

| Layer | Files tested | Pattern |
| ----- | ------------ | ------- |
| Pure library | `datetime.ts`, `goals.ts`, `workoutQuery.ts`, `i18n.ts`, `i18nPlural.ts`, `mockData.ts`, `analytics-newpbs.ts`, `replay/sports.ts`, `replay/sources.ts` | Direct import, minimal mocking |
| Server data/DB | `server/db.ts`, `server/data.ts`, `server/session.ts`, `server/export.ts`, `server/concept2-strokes.ts`, `server/share.ts`, `server/config.ts`, `server/leaderboard.ts`, `server/hrImport.ts`, `server/rivalGhost.ts` | Fake D1/KV (see below) |
| Route handlers | All 18 `+server.ts` + 7 `+page.server.ts` files | Fake `RequestEvent`; service layer mocked via `vi.mock` |
| Svelte reactive classes | `i18n.svelte.ts`, `theme.svelte.ts`, `liveMode.svelte.ts` | Node-only stubs; no jsdom required |
| Three.js renderer | `replay/renderer3d.ts` | Partial mock — only `THREE.WebGLRenderer`; all other Three.js classes run as real headless Node implementations |

### Fake D1 pattern

```ts
function fakeDb(opts: { firstRow?: unknown; allRows?: unknown[] } = {}) {
  const executed: { sql: string; args: unknown[] }[] = [];
  const make = (sql: string) => {
    let bound: unknown[] = [];
    const stmt = {
      bind: (...args) => { bound = args; return stmt; },
      run:  async () => { executed.push({ sql, args: bound }); return { meta: { changes: 1, last_row_id: 99 } }; },
      first: async <T>() => { executed.push({ sql, args: bound }); return (opts.firstRow ?? null) as T; },
      all:  async <T>() => { executed.push({ sql, args: bound }); return { results: (opts.allRows ?? []) as T[] }; }
    };
    return stmt;
  };
  return { executed, db: { prepare: make, batch: async (stmts) => Promise.all(stmts.map(s => s.run())) } };
}
```

### Fake KV pattern

```ts
function fakeKv() {
  const store = new Map<string, string>();
  return {
    get:    async (key: string) => store.get(key) ?? null,
    put:    async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); }
  };
}
```

### What is NOT covered by unit tests

- **Svelte components (`.svelte`)** — require jsdom or a real browser; covered by Playwright E2E.
- **`liveMode.svelte.ts` poll/fetch loop** — `fetch`, `AudioContext`, and tab-visibility wiring require a real browser event model.
- **`renderer3d.ts` rendering fidelity** — actual WebGL pixel output cannot be verified in Node; unit tests validate construction, state transitions, and invocation only.
- **`hooks.server.ts`** — SvelteKit hook wiring requires a real SvelteKit request cycle; covered by E2E.

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
