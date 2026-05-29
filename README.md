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

## Stack

| Concern        | Choice                                                              |
| -------------- | ------------------------------------------------------------------ |
| App framework  | SvelteKit (Svelte 5) + Vite                                        |
| Hosting        | Cloudflare **Workers** + static assets (`@sveltejs/adapter-cloudflare`) |
| Server / OAuth | SvelteKit endpoints running on the Workers runtime                |
| Sessions       | Cloudflare **KV** (`SESSIONS`)                                     |
| Cache          | Cloudflare **D1** (`DB`) — caches hydrated workouts + strokes      |
| Charts         | [uPlot](https://github.com/leeoniya/uPlot)                        |
| Replay engine  | rAF clock + linear interpolation (`src/lib/replay/`), Canvas course |

The Concept2 **client secret never reaches the browser**: the OAuth code
exchange and all logbook API calls happen server-side on the Worker.

## Quick start (demo mode)

No Concept2 account needed — leave the client id blank and rowplay serves
realistic sample data.

```bash
npm install
npm run dev        # http://localhost:5173
```

Open `/dashboard` and click any workout to watch the replay.

## Connecting your real logbook

1. Register an app at <https://log.concept2.com/developers/keys>.
   Set the redirect URI to `<your-app-url>/auth/callback`
   (e.g. `http://localhost:5173/auth/callback` for local dev).
2. Copy `.dev.vars.example` → `.dev.vars` and fill in:

   ```ini
   CONCEPT2_CLIENT_ID="..."
   CONCEPT2_CLIENT_SECRET="..."
   CONCEPT2_BASE_URL="https://log.concept2.com"   # or https://log-dev.concept2.com
   PUBLIC_APP_URL="http://localhost:5173"
   SESSION_SECRET="<random string>"
   ```

3. For local KV/D1, `wrangler` provides them automatically via the
   Cloudflare Vite integration. Apply the D1 schema once:

   ```bash
   npm run db:migrate:local
   ```

4. `npm run dev`, then click **Connect Concept2**.

## Deploying to Cloudflare

```bash
# one-time resource creation
wrangler kv namespace create SESSIONS      # paste id into wrangler.toml
wrangler d1 create rowplay                 # paste database_id into wrangler.toml
npm run db:migrate                         # apply migrations to remote D1

# secrets (never commit these)
wrangler secret put CONCEPT2_CLIENT_SECRET
wrangler secret put SESSION_SECRET

# build + deploy the Worker
npm run deploy
```

Set `CONCEPT2_CLIENT_ID` and `PUBLIC_APP_URL` (your production origin) in the
`[vars]` block of `wrangler.toml`, and add the production
`<origin>/auth/callback` to your Concept2 app's allowed redirect URIs.

## Scripts

| Script                     | Does                                          |
| -------------------------- | --------------------------------------------- |
| `npm run dev`              | Local dev server                              |
| `npm run build`            | Production build (`.svelte-kit/cloudflare`)   |
| `npm run preview`          | Build + serve the Worker via `wrangler dev`   |
| `npm run check`            | `svelte-check` type checking                  |
| `npm run deploy`           | Build + deploy the Worker (`wrangler deploy`) |
| `npm run db:migrate[:local]` | Apply D1 migrations                         |

## Project layout

```
src/
  lib/
    replay/        engine.ts (clock + interpolation), renderer.ts (canvas course), sports.ts
    server/        concept2.ts (OAuth + API client), session.ts (KV), db.ts (D1 cache), data.ts
    types.ts       Workout / Stroke / Split model
    mockData.ts    demo-mode sample workouts
  routes/
    auth/          OAuth login / callback / logout
    api/           JSON endpoints for workouts + detail
    dashboard/     summary + workout list
    replay/[id]/   the real-time replay
  components/       UPlotChart, MetricGauge
```

### Ghost racing

The replay engine's sampling (`sampleAt`) is a pure function, and the course
renderer's geometry is a pure function of distance fraction — so racing a past
session as a "ghost" later means sampling a second stroke array and drawing a
second avatar, without reworking the engine.

---

Not affiliated with Concept2. "Concept2", "RowErg", "SkiErg" and "BikeErg" are
trademarks of Concept2.
