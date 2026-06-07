> **Note for AI Agents:** Please read `AGENTS.md` before proposing or making any changes to this repository to ensure architecture and quality invariants are strictly preserved.

# rowplay

Concept2 logbook analytics **and a real-time workout replay**, deployed on Cloudflare.

[![CI](https://github.com/shenghaoc/rowplay/actions/workflows/ci.yml/badge.svg)](https://github.com/shenghaoc/rowplay/actions/workflows/ci.yml)

rowplay connects to your [Concept2 Logbook](https://log.concept2.com) and turns
every RowErg / SkiErg / BikeErg result into interactive visualizations.

---

## User guide

The canonical user guide lives in **[docs/usage.md](docs/usage.md)** and is
rendered directly on the website at `/docs` from the same markdown source.

---

## Screenshots

<!--
  TODO: replace these placeholders with real screenshots or animated GIFs.
  Suggested capture:
    dashboard.png  — dark theme, full dashboard with pace chart + workout list
    replay.png     — mid-race replay with avatar, gauges, and telemetry charts
    leaderboard.png — leaderboard page with a few entries
  Place images in static/ or a top-level assets/ folder, then link:
    ![Dashboard](assets/dashboard.png)
-->

| Dashboard | Replay | Leaderboard |
|:---:|:---:|:---:|
| ![Dashboard placeholder](https://placehold.co/600x340/1e293b/94a3b8?text=Dashboard+screenshot) | ![Replay placeholder](https://placehold.co/600x340/1e293b/94a3b8?text=Replay+screenshot) | ![Leaderboard placeholder](https://placehold.co/600x340/1e293b/94a3b8?text=Leaderboard+screenshot) |

---

## Try it now — no account needed

**Demo mode is on by default.** Open the app without signing in and rowplay
serves realistic sample data so you can explore every feature immediately.

👉 **[Launch demo](https://rowplay.shenghaoc.workers.dev/dashboard)**

Or run locally in under a minute:

```bash
git clone https://github.com/shenghaoc/rowplay.git && cd rowplay
npm install
npm run dev          # → http://localhost:5173/dashboard
```

Click any workout in the list to watch the replay — canvas, gauges, charts, and
all controls work in demo mode with zero configuration.

---

## Features

### Dashboard
- **Totals & aggregates** — lifetime meters, workout count, time-in-motion across all three erg types.
- **Pace trend chart** — uPlot-powered line chart showing pace progression over time.
- **Per-sport filtering** — toggle between RowErg, SkiErg, BikeErg, or view all.
- **Performance Management Chart (PMC)** — Fitness / Fatigue / Form (CTL / ATL / TSB) over a configurable window.
- **Training calendar heatmap** — year-at-a-glance volume visualization.
- **Annual goal tracking** — set a distance or time goal and see progress on the dashboard.
- **Personal-best detection** — new PBs surfaced automatically in the workout list.

### Replay
- **Real-time race replay** — an avatar races a virtual course with synchronized pace, stroke-rate, power, and heart-rate gauges.
- **Per-stroke resolution** — when per-stroke data is available the replay uses it; workouts without it fall back to a lower-resolution replay synthesized from splits.
- **Play / pause / scrub / speed** — drag the timeline, jump to any point, adjust speed from 0.5× to 8×.
- **2D & 3D views** — Canvas-based 2D course and an optional Three.js 3D renderer (WebGL required).
- **Telemetry charts** — uPlot charts for pace, stroke rate, power, and heart rate synchronized to the replay clock.
- **Ghost racing** — race a past session as a ghost alongside the current replay for side-by-side comparison.

### Workout tools
- **Side-by-side comparison** — compare any two workouts across all metrics.
- **Workout export** — download individual or bulk workouts as CSV, JSON, or TCX.
- **Shareable replays** — generate a public share link (`/r/[token]`) for any workout replay.
- **Heart-rate import** — merge external HR data (CSV, TCX, FIT) into a workout.
- **Coaching annotations** — add private notes to workouts.

### Leaderboards
- **Standard-distance boards** — publish verified workouts to public leaderboards for standard Concept2 distances.
- **Opt-in model** — nothing is published without explicit user action.
- **Demo leaderboard** — sample data available without authentication.

### Live / near-live mode
- **Live polling** — poll for in-progress ErgData workouts (requires connected Concept2 account).
- **Demo live generator** — simulated live workout feed for testing.

### Platform
- **Bring-your-own-token auth** — paste your personal Concept2 API token once; it's sealed in an httpOnly cookie. No shared client secret needed.
- **Internationalization** — English, 中文, Deutsch, Español, Français, 日本語. Language toggles instantly with no page reload.
- **Light / dark theme** — defaults to dark; preference persists across sessions.
- **PWA** — installable on mobile and desktop with offline-ready service worker.
- **Responsive** — works on mobile, tablet, and desktop.

---

## Privacy model

rowplay is designed so that **your personal Concept2 token never leaves your
control in plaintext** and cached data stays scoped to your session.

```
┌──────────────────────────────────────────────────┐
│                    Browser                        │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │ concept2.com │    │        rowplay           │ │
│  │  (you copy  │    │                            │ │
│  │   token)    │    │  token → /auth/token       │ │
│  └─────────────┘    │    (HTTPS POST, once)      │ │
│                      │                            │ │
│                      │  ← httpOnly rp_tok cookie  │ │
│                      │    (sealed, not readable   │ │
│                      │     by JavaScript)         │ │
│                      └──────────────────────────┘ │
└──────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────┐
│              Cloudflare Worker                    │
│                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │   KV     │   │    D1    │   │  rp_tok       │ │
│  │ session  │   │  cached  │   │  (httpOnly    │ │
│  │ identity │   │ workouts │   │   cookie,     │ │
│  │ & state  │   │ + strokes│   │   sealed with │ │
│  │          │   │          │   │   SESSION_    │ │
│  │ NO token │   │ NO token │   │   SECRET)     │ │
│  └──────────┘   └──────────┘   └──────────────┘ │
│                                                   │
│  Server logs: personal tokens, cookie values,     │
│  and full workout payloads are redacted before    │
│  emission to Workers logs.                        │
└──────────────────────────────────────────────────┘
```

- **Token** — submitted once over HTTPS, sealed into the httpOnly `rp_tok`
  cookie with `SESSION_SECRET`. Never stored in KV, D1, or localStorage.
- **KV** — holds session identity and state (e.g. leaderboard opt-in). No
  personal token, no workout data.
- **D1** — holds cached workout metadata and per-stroke detail for instant
  replays. No personal token.
- **Disconnect** — clearing your account data removes all cached workouts and
  session state from KV and D1.
- **Leaderboard opt-in** — publishing to leaderboards is an explicit,
  reversible action per workout.

---

## Local development

### Which server to use?

| | `npm run dev` | `npm run preview` |
|---|---|---|
| **URL** | `http://localhost:5173` | `http://127.0.0.1:8787` |
| **Runtime** | Vite dev server | `wrangler dev` (Workers) |
| **KV / D1** | ❌ not available | ✅ local bindings |
| **Token auth / sync** | ❌ | ✅ |
| **Demo mode** | ✅ | ✅ |
| **Hot reload** | ✅ instant | ⚠️ rebuild on change |
| **Use for** | UI, styling, component work | Auth, sync, KV/D1, full-stack |

**Rule of thumb:** use `npm run dev` for UI and component work; switch to
`npm run preview` when touching auth, API routes, KV/D1, or anything that
hits the Concept2 API server-side.

### Demo mode (zero config)

```bash
npm install
npm run dev          # → http://localhost:5173/dashboard
```

Open `/dashboard`, click any workout, watch the replay. No `.dev.vars`,
no Concept2 account, no Cloudflare account needed.

### Full local stack (BYOT + D1 cache)

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars — set SESSION_SECRET to a random string
npm run db:migrate:local
npm run preview      # → http://127.0.0.1:8787
```

Then visit `/auth/token` on the preview URL and paste your Concept2 API token.

---

## Deploying your own instance

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works).
- [Node.js](https://nodejs.org/) (see `.nvmrc` for the pinned version; currently 26).
- A Concept2 Logbook account (only needed to *use* token auth; deployment works without one).

### Setup checklist

1. **Fork the repo** and clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/rowplay.git && cd rowplay
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create Cloudflare resources** (one-time):

   ```bash
   # KV namespace for sessions
   wrangler kv namespace create SESSIONS
   # → copy the id into wrangler.jsonc → kv_namespaces[0].id

   # D1 database for workout cache
   wrangler d1 create rowplay
   # → copy the database_id into wrangler.jsonc → d1_databases[0].database_id
   ```

4. **Set secrets:**

   ```bash
   # Required for BYOT token sessions
   wrangler secret put SESSION_SECRET
   # (generate a random string, e.g.: openssl rand -hex 32)

   # Only if enabling OAuth (optional — BYOT works without it):
   wrangler secret put CONCEPT2_CLIENT_SECRET
   ```

5. **Update `wrangler.jsonc`:**
   - Set `vars.PUBLIC_APP_URL` to your deployment URL (e.g. `https://rowplay.YOUR_SUBDOMAIN.workers.dev`).
   - If enabling OAuth, set `vars.CONCEPT2_CLIENT_ID` to your Concept2 developer app client ID.
   - Leave `CONCEPT2_CLIENT_ID` empty for BYOT-only mode (recommended).

6. **Apply database migrations:**

   ```bash
   npm run db:migrate        # remote D1 (production)
   # or: npm run db:migrate:local   (local wrangler dev)
   ```

7. **Verify the build:**

   ```bash
   npm run check             # type checking
   npm run test              # unit tests
   npm run build             # production build
   ```

8. **Deploy:**

   ```bash
   npm run deploy            # build + wrangler deploy
   ```

9. **Optional — configure a custom domain** in the Cloudflare dashboard
   (Workers & Pages → rowplay → Custom Domains).

---

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Local dev server (Vite; fast UI iteration, no KV/D1) |
| `npm run build` | Production build → `.svelte-kit/cloudflare` |
| `npm run preview` | Build + `wrangler dev` (Workers runtime with local KV/D1) |
| `npm run check` | `svelte-check` type checking |
| `npm run check:docs` | Require docs updates for non-doc PR changes |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke tests (WebKit; requires `wrangler dev`) |
| `npm run validate:locales` | Verify locale dictionary key parity across all languages |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm run db:migrate` | Apply D1 migrations (remote) |
| `npm run db:migrate:local` | Apply D1 migrations (local preview) |

---

## Project layout

```
src/
  lib/
    replay/          engine, renderer, 2D/3D course, sports theming
    server/          concept2 API client, session (KV), db (D1), data loader
    analytics.ts     pure analysis functions (CP/W′, PMC, HR zones, …)
    mockData.ts      demo-mode sample workouts
  routes/
    auth/token/      bring-your-own-token connect
    dashboard/       summary, pace trend, workout list, PMC
    replay/[id]/     real-time replay (canvas + gauges + charts)
    compare/         side-by-side workout comparison
    leaderboard/     standard-distance leaderboards
    settings/        language, theme, annual goal, account management
    r/[token]/       shared replay (public link)
  components/        charts, gauges, panels, heatmap, workout list
```

---

## Known limitations

- **OAuth requires a Concept2 developer app.** If you want OAuth login (instead
  of BYOT token paste), you must register an app with Concept2 and configure
  `CONCEPT2_CLIENT_ID` / `CONCEPT2_CLIENT_SECRET`. The public deployment at
  `rowplay.shenghaoc.workers.dev` is BYOT-only.
- **Per-stroke data depends on Concept2.** Not all workouts include per-stroke
  data (e.g. older logbook entries or workouts recorded without ErgData). These
  fall back to split-level replay.
- **3D replay requires WebGL.** The 3D view uses Three.js; devices without
  WebGL support fall back to the 2D canvas renderer automatically.
- **Live mode polls.** There is no real-time push from Concept2 — live/near-live
  mode uses periodic polling at a configurable interval (60s default, 30s minimum)
  and only reflects workouts recorded with ErgData.
- **Single account per session.** BYOT tokens are personal read-only tokens tied
  to one Concept2 profile. Multi-account dashboards are not supported.
- **Workers free tier limits.** Cloudflare's free tier includes 100k requests/day
  and 10ms CPU-time per request. Large logbook syncs (thousands of workouts with
  per-stroke data) may hit these limits. Upgrading to the paid Workers plan
  resolves this.
- **KV is eventually consistent.** Session reads may briefly return stale data
  after a write. This is inherent to Cloudflare KV's global distribution model.
- **D1 storage.** Very large logbooks (10k+ workouts with full stroke data) may
  approach D1's per-database storage limits. Most users will never hit this.
- **No Concept2 PM5 direct connection.** rowplay reads from the Concept2 Logbook
  API, not directly from the Performance Monitor. Workouts appear after they sync
  to the Concept2 cloud.

---

## Stack

| Concern | Choice |
|---|---|
| App framework | SvelteKit (Svelte 5, runes mode) + Vite |
| Hosting | Cloudflare **Workers** + static assets (`@sveltejs/adapter-cloudflare`) |
| Server | SvelteKit endpoints on the Workers runtime |
| Auth | **Bring-your-own-token** (personal Concept2 API token) |
| Sessions | Cloudflare **KV** (`SESSIONS`) |
| Cache | Cloudflare **D1** (`DB`) — cached workouts + strokes |
| Charts | [uPlot](https://github.com/leeoniya/uPlot) |
| 3D | [Three.js](https://threejs.org/) |
| UI | [daisyUI 5](https://daisyui.com/) + Tailwind CSS v4 |
| Icons | [Lucide](https://lucide.dev/) |
| I18n | Hand-rolled; 6 languages |
| CI | GitHub Actions (type-check, unit tests, build, locale validation, E2E smoke) |

---

## Contributing

See **[AGENTS.md](AGENTS.md)** for the contributor entry point — it routes to
steering docs, skills, and specs.

For bugs, features, and security disclosures, see:
- [Bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
- [Security policy](SECURITY.md)

---

Not affiliated with Concept2. "Concept2", "RowErg", "SkiErg", and "BikeErg" are
trademarks of Concept2.
