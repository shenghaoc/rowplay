# AGENTS.md — rowplay agent entry point

Use this file as a **thin router**. Read the steering docs before coding; specs
live under `.kiro/specs/`.

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
- [Replay animation upgrade](.kiro/specs/replay-animation-upgrade/tasks.md) — wall-clock motion (`motion.ts`), stroke-synced hull surge, splash/ripples/waves, corrected oar/pole mechanics, instanced spray & buoys, chase camera with speed-aware FOV, `PerfGovernor` adaptive degradation; both renderers, all 3 sports, reduced-motion compliant.
- [WebGPU-first replay graphics upgrade](.kiro/specs/webgpu-first-replay-graphics-upgrade/tasks.md) — WebGPU-first 3D factory with WebGL fallback; Concept2-derived stroke poses for live and ghost rows; segmented human-scale 3D athletes; Ultra quality tier; larger 3D stage; backend diagnostics; docs/tests/visual QA.
- [GLTF avatar upgrade](.kiro/specs/gltf-avatar-upgrade/tasks.md) — Rigged GLTF humanoid models (Mixamo) replace ball-and-stick avatar; bone mapper with two-bone IK drives skeleton from existing IK targets; quality-gated model variants; sport-specific procedural equipment retained; model cache with cloning.
- [Concept2 token privacy](.kiro/specs/concept2-token-privacy/tasks.md) — BYOT token sealed in an httpOnly cookie (never in KV); session-scoped D1 cache purged on disconnect; reversible leaderboard opt-in.
- [Mobile nav backdrop dismiss](.kiro/specs/mobile-nav-backdrop-dismiss/tasks.md) — cross-browser backdrop tap to close the hamburger menu; bounding-rect `onclick` fallback for iOS Safari.
- [Snappy connect & dashboard cache warm-up](.kiro/specs/connect-cache-warmup/tasks.md) — connect pending-state; background warm-cache sync on connect (`waitUntil`); D1 read as the full history only after a sync completes (no partial cache); per-request load de-dup.
- [Test coverage](.kiro/specs/test-coverage/tasks.md) — broad Vitest coverage across pure helpers, server/DB layer, route handlers, Svelte reactive classes, and the Three.js 3D renderer; `@vitest/coverage-v8` with `text` + `lcov` reporters. The spec records its landing snapshot; use `vp test` for current health.

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

Production uses **bring-your-own-token**: the athlete pastes a **personal
Concept2 API token** from their Concept2 profile (`/auth/token`). The token is
submitted once over HTTPS, validated on the Worker, and sealed into the
**httpOnly `rp_tok` cookie** using `SESSION_SECRET`. KV stores session
identity/state, not the personal token; D1 stores cached workout/replay data,
not the token. Disconnect/delete clears cached user data and session state.

**Demo mode** (default): with no session, the app serves deterministic mock data
(`src/lib/mockData.ts`). No Concept2 credentials required for dev or e2e.

**Optional OAuth** (legacy): if `CONCEPT2_CLIENT_ID` is set in `wrangler.jsonc`,
the OAuth login/callback routes are enabled. This requires a registered Concept2
developer app and is not needed for the public BYOT deployment.

## Key commands

All commands use **vp** (Vite+ CLI). `vp install` for clean CI installs.

| Task               | Command                                                            |
| ------------------ | ------------------------------------------------------------------ |
| Install deps       | `vp install`                                                       |
| Dev server         | `vp dev` (serves at `http://localhost:5173`)                       |
| Format             | `vp run format` (write) / `vp run format:check` (check only)       |
| Lint               | `vp lint` (fails on findings)                                      |
| Type check         | `vp run typecheck` (`svelte-kit sync` + `svelte-check`)            |
| Unit tests         | `vp test` (Vitest)                                                 |
| Build              | `vp build` (outputs `.svelte-kit/cloudflare`)                      |
| Full quality gate  | `vp check` (format:check + lint + typecheck + test + build)        |
| Preview            | `vp run preview` (build + `wrangler dev`, real runtime)            |
| Preview (wrangler) | `vp run preview:wrangler` (`wrangler dev` only, needs prior build) |
| Deploy             | `vp run deploy` (build + `wrangler deploy`)                        |
| D1 migrate         | `vp run db:migrate` (remote) / `vp run db:migrate:local`           |
| Locales            | `vp run validate:locales` (after adding i18n keys)                 |
| E2E (full)         | `vp run test:e2e` (all specs, Chromium desktop + mobile)           |
| E2E (smoke)        | `vp run test:e2e:smoke` (smoke.spec.ts, Chromium desktop only)     |

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
  `vp run preview` (`wrangler dev` on `http://127.0.0.1:8787`) for auth, sync,
  and binding tests.
- **Stroke-data units** (`concept2.ts > mapStrokes`): bike pace is per-1000m;
  interval `t`/`d` restart per rep — both normalised on read.
- `vp build` runs `scripts/postbuild.mjs` (patches `.assetsignore`).
- **UPlotChart** (`src/components/UPlotChart.svelte`): `plot` is `$state.raw`
  so the `setData` effect re-fires after each build; the build effect must
  `untrack` the old-plot destroy to avoid a circular dependency.
- **daisyUI** uses the Tailwind v4 CSS plugin in `src/app.css` (not `tailwind.config.js`). Use idiomatic daisyUI classes (`btn`, `card`, `input`, `join`, `toggle`, …). Details: [tech.md → daisyUI](.kiro/steering/tech.md#daisyui-tailwind-css-v4-plugin). Install docs: [SvelteKit](https://daisyui.com/docs/install/sveltekit/), [general](https://daisyui.com/docs/install/).

## Server logging

- Use `{ createLogger }` from `src/lib/server/logger.ts`, not bare `console.error`.
- All server-originated `console.error` calls must go through the logger so
  personal tokens, cookie values, and full workout payloads are redacted before
  emission to Workers logs. See `.kiro/steering/tech.md#server-observability`.

## Quality gate

1. `vp check` → passes. It runs `format:check`, `lint`, `typecheck`
   (`state_referenced_locally` warnings are known), `test`, and `build` —
   the same gate base CI runs after `vp install`.
2. `vp test` → green, and the test count must not decrease.
3. Feature work: verify in demo mode; token auth on `vp run preview` if touched.
4. New `+server.ts`, `+page.server.ts`, or `src/lib/**/*.ts` files must have a co-located `*.test.ts`.

## Svelte, daisyUI and i18n

- Svelte 5 runes: `$state` / `$derived`, keyed `{#each}`, `onclick={...}`.
- daisyUI: prefer built-in components (`btn`, `join`, `filter`, `input input-bordered`, `stat` parts, `alert`, `toggle`) over custom chip/form CSS; keep `dash-stats` and sport tokens custom. See [tech.md → daisyUI](.kiro/steering/tech.md#daisyui-tailwind-css-v4-plugin).
- Every user-visible string through `i18n.t()` in **all** locale files.
- Sport names (RowErg, SkiErg, BikeErg) stay untranslated.

## Review priorities

P1 (must fix before merge):

- Missing or outdated user-facing documentation in `docs/` for user-visible changes.

## Cursor Cloud specific instructions

- **Demo mode is the default** — no `.dev.vars` needed for dashboard/replay/e2e.
- **Two local URLs**: `vp dev` → `http://localhost:5173` (fast UI);
  `vp run preview` → `http://127.0.0.1:8787` (Workers-faithful).
- **E2E smoke** (PR gate): `vp run test:e2e:smoke`; first run needs `vpx playwright install --with-deps chromium`.
- **E2E full** (all specs): `vp run test:e2e` — runs on `workflow_dispatch` and nightly in CI.
- **Token auth / sync / KV / D1**: test on `vp run preview`, not `vite dev` alone.
- **Hello-world**: `/dashboard` → `/replay/1001` → Play — canvas and gauges update.
