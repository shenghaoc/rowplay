# AGENTS.md — rowplay agent entry point

Use this file as a **thin router**. Read the steering docs before coding; specs
live under `.kiro/specs/`.

## Critical Quality Gates

Before proposing or making changes, consult the steering docs under `.kiro/steering/` to preserve architecture invariants.

**Every session must pass all five gates before closing:**

1. `npm run check` → 0 errors (`state_referenced_locally` warnings are known/allowed).
2. `npm run build` → succeeds.
3. `npm run test` → green, and the test count must **not decrease**.
4. Feature work: verify in demo mode (`/dashboard` → `/replay/1001`); token auth on `npm run preview` if auth/session code was touched.
5. **New production files** (`+server.ts`, `+page.server.ts`, `src/lib/**/*.ts`) must have a co-located `*.test.ts`. The co-location convention is: `foo.ts` → `foo.test.ts` in the same directory.

**Architecture boundaries:**
- Server-only code lives in `src/lib/server/` — never imported by client bundles.
- Route tests use fake `RequestEvent` objects; service dependencies are always mocked with `vi.mock('$lib/server/...')`.
- D1 and KV are never touched in unit tests — use the fake D1/KV patterns documented in `.kiro/steering/tech.md`.
- Demo mode must always work without credentials; never break the unauthenticated path.

## Read steering first

- [Product vision](.kiro/steering/product.md) — replay-first; BYOT auth; demo mode.
- [Technical constraints](.kiro/steering/tech.md) — SvelteKit on Cloudflare Workers, KV + D1.
- [Repository structure](.kiro/steering/structure.md) — layout, naming, conventions.

## Skills

Reusable packs in [`.kiro/skills/`](.kiro/skills/):

- **svelte-core-bestpractices** / **svelte-code-writer** — Svelte 5 runes mode.
- **daisyui** — daisyUI 5 component classes, themes, and component class rules ([`.kiro/skills/daisyui/SKILL.md`](.kiro/skills/daisyui/SKILL.md)).
- **web-design-guidelines** — accessibility and UI review checklist.

## Specs (`.kiro/specs/`)

Each spec has `design.md`, `requirements.md`, and `tasks.md`.

**Completed (do not rebuild):**

- [Leaderboards](.kiro/specs/leaderboards/tasks.md)
- [Live / near-live mode](.kiro/specs/live-near-live-mode/tasks.md)
- [Heart-rate import](.kiro/specs/heart-rate-import/tasks.md)
- [Detail cache TTL](.kiro/specs/detail-cache-ttl/tasks.md)
- [3D replay view](.kiro/specs/3d-replay-view/tasks.md)
- [Sport-aware 3D replay](.kiro/specs/3d-replay-sports/tasks.md)
- [Concept2 token privacy](.kiro/specs/concept2-token-privacy/tasks.md) — BYOT token sealed in an httpOnly cookie (never in KV); session-scoped D1 cache purged on disconnect; reversible leaderboard opt-in.
- [Mobile nav backdrop dismiss](.kiro/specs/mobile-nav-backdrop-dismiss/tasks.md) — cross-browser backdrop tap to close the hamburger menu; bounding-rect `onclick` fallback for WebKit (iOS Safari).
- [Snappy connect & dashboard cache warm-up](.kiro/specs/connect-cache-warmup/tasks.md) — connect pending-state; background warm-cache sync on connect (`waitUntil`); D1 read as the full history only after a sync completes (no partial cache); per-request load de-dup.
- [Test coverage](.kiro/specs/test-coverage/tasks.md) — 692 Vitest tests across pure helpers, server/DB layer, all route handlers, Svelte reactive classes, and the Three.js 3D renderer; `@vitest/coverage-v8` with `text` + `lcov` reporters.

**Platform audit (read before new features or modernization work):**

- [Platform modernization audit](.kiro/specs/platform-modernization-audit/design.md) — dependency, HTML/CSS/JS, WHATWG, Temporal, and PR #223 gap analysis (June 2026)

## Project summary

**rowplay** is a SvelteKit / Svelte 5 app: Concept2 logbook analytics plus a
real-time workout replay, deployed to **Cloudflare Workers** (static assets +
Worker via `@sveltejs/adapter-cloudflare`).

All server logic runs in SvelteKit endpoints on the Workers runtime. There is no
separate backend: the app reads the Concept2 Logbook API **server-side** and
caches hydrated workouts in Cloudflare D1.

### Authentication (BYOT-first)

Production uses **bring-your-own-token**: the athlete pastes a **read-only
personal API token** from their Concept2 profile (`/auth/token`). The token is
submitted once over HTTPS, validated on the Worker, stored in KV for the session,
and used only for server-side logbook reads. After connect, the browser holds an
**httpOnly session cookie** — not the token in client JS or `localStorage`.

**Demo mode** (default): with no session, the app serves deterministic mock data
(`src/lib/mockData.ts`). No Concept2 credentials required for dev or e2e.

**Optional OAuth** (legacy): if `CONCEPT2_CLIENT_ID` is set in `wrangler.jsonc`,
the OAuth login/callback routes are enabled. This requires a registered Concept2
developer app and is not needed for the public BYOT deployment.

## Key commands

All commands use **npm** (lockfile: `package-lock.json`).

| Task         | Command                                                      |
| ------------ | ------------------------------------------------------------ |
| Install deps | `npm install`                                                |
| Dev server   | `npm run dev` (serves at `http://localhost:5173`)            |
| Type check   | `npm run check` (`svelte-kit sync` + `svelte-check`)         |
| Unit tests   | `npm run test` (Vitest)                                      |
| Build        | `npm run build` (outputs `.svelte-kit/cloudflare`)           |
| Preview      | `npm run preview` (build + `wrangler dev`, real runtime)     |
| Deploy       | `npm run deploy` (build + `wrangler deploy`)                 |
| D1 migrate   | `npm run db:migrate` (remote) / `db:migrate:local`           |
| Locales      | `npm run validate:locales` (after adding i18n keys)          |
| E2E          | `npm run test:e2e` (WebKit; needs `wrangler dev` runtime)    |

## Architecture (short)

- `src/lib/server/` — `concept2.ts`, `session.ts` (KV), `db.ts` (D1), `data.ts`.
- `src/lib/replay/` — `engine.ts`, `renderer.ts`, `sports.ts`.
- `src/lib/analytics.ts` — pure analysis; no DOM.
- `src/routes/` — `auth/token/` (BYOT), `dashboard/`, `replay/[id]/`, `api/`.
- i18n: `src/lib/locales/` (`en`, `zh`, `de`, `es`, `fr`, `ja`); all user strings via `i18n.t()`.

## Non-obvious caveats

- **Config is `wrangler.jsonc`**. Bindings: `ASSETS`, `SESSIONS` (KV), `DB` (D1).
  Production deploy at `https://rowplay.shenghaoc.workers.dev` uses real KV/D1 ids.
- **`CONCEPT2_CLIENT_ID` empty is intentional** for BYOT production. Set
  `SESSION_SECRET` via `wrangler secret put` (and `CONCEPT2_CLIENT_SECRET` only
  if OAuth is enabled).
- **`vite dev` is not the Workers runtime** — no KV/D1/asset bindings. Use
  `npm run preview` (`wrangler dev` on `http://127.0.0.1:8787`) for auth, sync,
  and binding tests.
- **Stroke-data units** (`concept2.ts > mapStrokes`): bike pace is per-1000m;
  interval `t`/`d` restart per rep — both normalised on read.
- `npm run build` runs `scripts/postbuild.mjs` (patches `.assetsignore`).
- **daisyUI** uses the Tailwind v4 CSS plugin in `src/app.css` (not `tailwind.config.js`). Use idiomatic daisyUI classes (`btn`, `card`, `input`, `join`, `toggle`, …). Details: [tech.md → daisyUI](.kiro/steering/tech.md#daisyui-tailwind-css-v4-plugin). Install docs: [SvelteKit](https://daisyui.com/docs/install/sveltekit/), [general](https://daisyui.com/docs/install/).

## Svelte, daisyUI and i18n

- Svelte 5 runes: `$state` / `$derived`, keyed `{#each}`, `onclick={...}`.
- daisyUI: prefer built-in components (`btn`, `join`, `filter`, `input input-bordered`, `stat` parts, `alert`, `toggle`) over custom chip/form CSS; keep `dash-stats` and sport tokens custom. See [tech.md → daisyUI](.kiro/steering/tech.md#daisyui-tailwind-css-v4-plugin).
- Every user-visible string through `i18n.t()` in **all** locale files.
- Sport names (RowErg, SkiErg, BikeErg) stay untranslated.

## Cursor Cloud specific instructions

- **Demo mode is the default** — no `.dev.vars` needed for dashboard/replay/e2e.
- **Two local URLs**: `npm run dev` → `http://localhost:5173` (fast UI);
  `npm run preview` → `http://127.0.0.1:8787` (Workers-faithful).
- **E2E**: `npm run test:e2e`; first run needs `npx playwright install --with-deps webkit`.
- **Token auth / sync / KV / D1**: test on `npm run preview`, not `vite dev` alone.
- **Hello-world**: `/dashboard` → `/replay/1001` → Play — canvas and gauges update.
