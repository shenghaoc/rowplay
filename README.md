> **Note for AI Agents:** Please read `AGENTS.md` before proposing or making any changes to this repository to ensure architecture and quality invariants are strictly preserved.

# rowplay

Concept2 logbook analytics **and a real-time workout replay**, deployed on Cloudflare.

rowplay connects to your [Concept2 Logbook](https://log.concept2.com) and turns
every RowErg / SkiErg / BikeErg result into:

- a **dashboard** with totals, a pace trend, and per-sport filtering, and
- a **real-time replay** of any workout — an avatar racing a virtual course with
  synchronized **pace / stroke-rate / power / heart-rate** gauges and telemetry
  charts, complete with play / pause / scrub / speed (0.5×–8×) controls.

Per-stroke data is used when available; workouts without it fall back to a
lower-resolution replay synthesised from splits.

## User guide

The canonical user guide lives in **[docs/usage.md](docs/usage.md)** and is
rendered directly on the website at `/docs` from the same markdown source.

Keep end-user workflow details there instead of copying them into Svelte route
files. CI runs `npm run check:docs` on pull requests and fails non-doc changes
that do not update repository documentation.

## Stack

| Concern        | Choice                                                              |
| -------------- | ------------------------------------------------------------------ |
| App framework  | SvelteKit (Svelte 5) + Vite                                        |
| Hosting        | Cloudflare **Workers** + static assets (`@sveltejs/adapter-cloudflare`) |
| Server         | SvelteKit endpoints on the Workers runtime                         |
| Auth           | **Bring-your-own-token** (personal Concept2 API token)             |
| Sessions       | Cloudflare **KV** (`SESSIONS`)                                     |
| Cache          | Cloudflare **D1** (`DB`) — cached workouts + strokes               |
| Charts         | [uPlot](https://github.com/leeoniya/uPlot)                        |
| Replay engine  | rAF clock + linear interpolation (`src/lib/replay/`), Canvas course |

You paste a **personal Concept2 API token** from your Concept2 profile once.
It is sent to the Worker over HTTPS, validated, and sealed into the httpOnly
`rp_tok` cookie with `SESSION_SECRET`. KV stores session identity/state, not the
token; D1 stores cached workout/replay data, not the token. Disconnecting or
deleting account data clears the cached user data and session state.

## Quick start (demo mode)

No Concept2 account needed — open the app without a session and rowplay serves
realistic sample data.

```bash
npm install
npm run dev        # http://localhost:5173
```

Open `/dashboard` and click any workout to watch the replay.

## Connecting your real logbook (BYOT)

1. In the Concept2 logbook, open **Edit Profile → Applications** and copy your
   personal API token (works for your account only).
2. In rowplay, click **Use a token** (`/auth/token`) and paste it.
3. For local KV/D1 (token auth, sync, cache), use the Workers runtime:

   ```bash
   cp .dev.vars.example .dev.vars
   # set SESSION_SECRET (random string)
   npm run db:migrate:local
   npm run preview    # http://127.0.0.1:8787 — not plain vite dev
   ```

4. Paste your token at `/auth/token` on the preview URL.

`CONCEPT2_CLIENT_ID` / `CONCEPT2_CLIENT_SECRET` are **optional** — only needed
if you register a Concept2 developer app and enable the OAuth login flow.

## Deploying to Cloudflare

Production: **`https://rowplay.shenghaoc.workers.dev`**

```bash
# secrets (never commit)
wrangler secret put SESSION_SECRET

# build + deploy
npm run deploy
```

KV/D1 bindings and `PUBLIC_APP_URL` are already set in `wrangler.jsonc`. Apply
remote migrations once: `npm run db:migrate`.

## Scripts

| Script                     | Does                                          |
| -------------------------- | --------------------------------------------- |
| `npm run dev`              | Local dev server (demo mode; fast UI)         |
| `npm run build`            | Production build (`.svelte-kit/cloudflare`)   |
| `npm run preview`          | Build + serve via `wrangler dev` (real runtime) |
| `npm run check`            | `svelte-check` type checking                  |
| `npm run check:docs`       | Require docs updates for non-doc PR changes   |
| `npm run test`             | Vitest unit tests                             |
| `npm run test:e2e`         | Playwright smoke (WebKit + wrangler dev)      |
| `npm run validate:locales` | Verify locale dictionary key parity           |
| `npm run deploy`           | Build + deploy (`wrangler deploy`)            |
| `npm run db:migrate[:local]` | Apply D1 migrations                         |

## Agent / contributor docs

See **[AGENTS.md](AGENTS.md)** (entry point for Cursor, Copilot, Claude, etc.)
and **[`.kiro/steering/`](.kiro/steering/)** for product and architecture detail.

## Project layout

```
src/
  lib/
    replay/        engine, renderer, sports
    server/        concept2 API client, session (KV), db (D1), data loader
    analytics.ts   pure analysis functions
    mockData.ts    demo-mode sample workouts
  routes/
    auth/token/    bring-your-own-token connect
    dashboard/     summary + workout list
    replay/[id]/   real-time replay
  components/    charts, gauges, panels
```

---

Not affiliated with Concept2. "Concept2", "RowErg", "SkiErg" and "BikeErg" are
trademarks of Concept2.
