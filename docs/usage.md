# rowplay user guide

rowplay turns your indoor rowing, skiing, and riding workouts into something you
can explore: a dashboard of totals and trends, a stroke-by-stroke replay,
side-by-side comparisons, and friendly leaderboards.

It works with workouts recorded on Concept2 machines — the RowErg (rowing
machine), SkiErg, and BikeErg — and reads them from the free Concept2 online
logbook.

This file is the English reference for the in-app user guide. The website
serves the guide as SvelteKit routes under `/docs`, one route per section, with
content rendered from the locale dictionaries so every bundled language uses
the same i18n path:

| Section                                     | Route                       |
| ------------------------------------------- | --------------------------- |
| [Overview](#rowplay-user-guide)             | `/docs`                     |
| [Getting started](#getting-started)         | `/docs/getting-started`     |
| [Rowing basics](#rowing-basics)             | `/docs/rowing-metrics`      |
| [Pace, splits & watts](#pace-splits--watts) | `/docs/pace-splits-watts`   |
| [Charts & progress](#charts--progress)      | `/docs/charts-and-progress` |
| [Common workflows](#common-workflows)       | `/docs/workflows`           |
| [FAQ](#faq)                                 | `/docs/faq`                 |
| [Troubleshooting](#troubleshooting)         | `/docs/troubleshooting`     |

## Getting started

### Try the demo first

rowplay starts in demo mode: with no account connected, every page is filled
with realistic sample workouts. Nothing you do in demo mode touches a real
account.

1. Open `/dashboard`.
2. Pick any workout from the list.
3. Press **Replay** and try the play, pause, scrub, and speed controls.
4. Open `/leaderboard` and try racing a ghost.

### Connect your own workouts

Your workouts live in the Concept2 logbook — the free online diary that
Concept2 machines (and the ErgData phone app) upload results to. rowplay reads
from that logbook using a personal access token. The token is sent once over
HTTPS, validated by the Worker, and sealed into the httpOnly `rp_tok` cookie.
KV stores session identity, and D1 stores cached workouts and replay data. The
token is not stored in KV or D1.

1. Sign in to your logbook at log.concept2.com.
2. Open **Edit Profile → Applications** and copy your personal API token.
3. Back in rowplay, open `/auth/token`.
4. Paste the token and submit.
5. On the dashboard, press **Sync** to load your workout history.

The first sync loads recent workouts right away and backfills older history in
the background; long-term totals and personal bests may look incomplete until
it finishes. Use `/settings` to disconnect or delete cached account data — the
Concept2 logbook is never modified.

## Rowing basics

- **RowErg / SkiErg / BikeErg** — Concept2's rowing machine, ski machine, and
  stationary bike. All three measure effort the same way.
- **Stroke** — one complete cycle of the movement.
- **Stroke rate (spm)** — strokes per minute; steady rowing is typically
  18–30 spm.
- **Distance per stroke (DPS)** — meters gained per stroke; higher usually
  means a more powerful, more efficient stroke.
- **Distance / time / intervals** — workouts are distance-based, time-based,
  or split into repeats with rest (e.g. 4 × 500m).
- **Pace / split** — time per fixed distance (500m for RowErg/SkiErg, 1000m
  for BikeErg) and the pace over one segment of a workout.
- **Heart rate (bpm)** — recorded when a belt or watch was connected to the
  machine or the ErgData app.

## Pace, splits & watts

- Pace is written like a clock time: **2:05** = 2 minutes 5 seconds per 500m.
  Lower is faster; on charts, improving pace means the line goes down.
- **BikeErg pace is per 1000m**, not 500m — rowplay normalises this on read.
- A split is the average pace over one chunk of a workout; comparing splits
  shows how the effort was spent (even, fading, or negative splits).
- Watts measure power output. Pace and watts are two views of the same effort;
  small pace gains demand disproportionately more power.
- Stroke rate is frequency, not effort: the same pace at a lower rate means
  more distance per stroke.

## Charts & progress

- **Trend over time** — follows one metric across weeks; pace trends compare
  like-for-like distance bands and need at least two sessions in a band.
- **Personal bests** — fastest results at standard distances; trust all-time
  bests only after a full sync has finished.
- **Training calendar & intensity** — daily volume shading plus the easy/hard
  distribution of training.
- **Fitness, fatigue & form** — modelled from training load; form (fitness
  minus fatigue) peaks after an easier stretch.
- **Critical power** — sustainable-output estimate from your own bests; feeds
  the pace predictor.
- **Stroke efficiency (DPS)** — meters per stroke with a pace-normalised
  toggle and 7-/28-day moving averages.

## Common workflows

- **Replay a workout** — play/pause, scrub, 0.5×–8× speed, 2D/3D course views
  (3D uses WebGPU when available, with WebGL fallback), and an optional
  target-pace reference line.

The athlete animates from Concept2 stroke rows: the figure takes one stroke
(or pole plant, or pedal revolution) per recorded stroke, with splash and spray
on each catch, and speeds up in step with the playback rate. The public
Concept2 stroke payload does not include force curves or handle position, so
the replay infers only timing, amplitude, and intensity from time, distance,
pace, rate, heart rate, and watts. In 3D, athletes use segmented human-scale
models with separate torso, head, shoulders, arms, legs, hands, feet, and
sport-specific kit so the scene reads as a coached erg replay rather than a toy
marker. The 3D chase camera stays close enough for body posture to matter and
widens its lens slightly as the boat runs faster.

The 3D course surface is sport-specific too: RowErg shows layered water lanes
with buoy and waterline detail, SkiErg shows groomed snow grooves and blue gate
markers, and BikeErg shows an asphalt/velodrome-style track with curbs, dashed
lane marks, and speed bars.

In 3D, the **Quality** selector picks low, medium, high, or ultra graphics.
Ultra is intended for WebGPU-capable devices and uses a larger stage, denser
environment geometry, stronger shadows, and richer wake/spray detail. If the
device can't hold a smooth frame rate at the selected tier, the renderer
automatically lowers resolution first and effects (water motion, spray) second
for the rest of the session.
Replay animation honours the operating system's reduced-motion setting.

Per-stroke data is used when Concept2 provides it. Workouts without stroke data
fall back to a split-based replay, so the course still plays back.

- **Coaching notes** — pin notes to moments on the replay timeline.
- **Race a ghost** — from `/leaderboard`, press **Race** next to an entry to
  pre-arm a rival on your own replay of that piece.
- **Compare two workouts** — pick two from the dashboard list for a
  split-by-split side-by-side at `/compare`.
- **Publish to a leaderboard** — standard-distance results only; opt-in,
  reversible, never changes the source logbook entry.
- **Share & export** — public read-only replay links; CSV/JSON logbook export
  plus per-workout TCX from `/settings`.
- **Keep data fresh** — **Sync** on demand, or **live mode** to poll the
  logbook and get notified about new workouts.
- **Import heart rate** — merge a CSV/TCX/FIT watch export into a workout from
  the replay page.

## FAQ

- **Do I need a Concept2 account?** Not for demo mode; yes for your own data.
- **Is my token safe?** Sent once over HTTPS, sealed in an httpOnly cookie,
  never stored server-side; disconnecting clears it.
- **Can others see my workouts?** Only if you publish to a leaderboard or
  share a public link — both reversible.
- **Does rowplay change my logbook?** Never; it only reads.
- **Why no stroke-by-stroke replay on some workouts?** Not every logbook entry
  has per-stroke data; those replay from splits.
- **Phone support?** Yes, including home-screen install (PWA).
- **Languages?** English, Deutsch, Español, Français, 日本語, 中文.

## Troubleshooting

- **Totals/PBs look wrong** — the history backfill probably has not finished;
  check sync status at `/settings`.
- **A pace looks way off** — remember BikeErg pace is per 1000m, and interval
  workouts report work-interval pace only.
- **Trend chart wants more sessions** — a distance band needs at least two
  like-for-like sessions.
- **No stroke charts** — the entry has no per-stroke data; stroke-dependent
  panels say so explicitly.
- **Missing heart rate** — use heart-rate import on the replay page.
- **Sync fails / session expired** — reconnect at `/auth/token` with a fresh
  token; brief rate limits resolve on retry.
- **New workout missing** — confirm it reached the Concept2 logbook, then Sync
  or enable live mode.
- **Display issues** — 3D needs WebGPU or WebGL (2D always works); rotate
  phones to landscape for wide charts; theme/language switches live in the header.

## Local development notes

Use the Workers preview runtime for local auth, sync, live mode, and KV/D1
testing:

```bash
pnpm preview
```

Plain `pnpm dev` is faster for UI work, but it is not the Workers runtime and
does not provide the production KV/D1 bindings.

## Contributor documentation policy

This guide is intentionally stored in the repository as the English reference
for contributors. The in-app `/docs` section renders guide content through the
locale dictionaries (`docs.sections.*` in `src/lib/locales/*.ts`), one
SvelteKit route per section, so every bundled language uses the same i18n
path. The section registry lives in `src/lib/docs.ts` (`DOCS_SECTIONS`).

When a change alters user-visible behavior, workflows, routes, auth, data
handling, setup, or deployment expectations, update this file and the locale
guide content in the same pull request.
