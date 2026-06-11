# rowplay user guide

rowplay turns Concept2 logbook results into a dashboard, replay, comparison, and
leaderboard experience for RowErg, SkiErg, and BikeErg workouts. This file is
the source of truth for the in-app guide at `/docs`.

## Start in demo mode

Demo mode is the default. Open rowplay without signing in and the app loads
deterministic sample workouts, so you can try the dashboard and replay without a
Concept2 account.

1. Open `/dashboard`.
2. Pick a workout from the list.
3. Press **Replay** and use play, pause, scrub, and speed controls.
4. Open `/leaderboard` to try a ghost race from sample data.

## Connect your Concept2 logbook

Production authentication is bring-your-own-token. The personal Concept2 API
token is sent once over HTTPS, validated by the Worker, and sealed into the
httpOnly `rp_tok` cookie. KV stores session identity, and D1 stores cached
workouts and replay data. The token is not stored in KV or D1.

1. In the Concept2 logbook, open **Edit Profile -> Applications**.
2. Copy your personal API token.
3. In rowplay, open `/auth/token`.
4. Paste the token and submit it.
5. Open `/dashboard` and use **Sync** to load the full logbook history.

Use `/settings` to disconnect or delete cached account data.

## Read the dashboard

The dashboard is the home base for workout review.

- Use sport and distance filters to narrow the workout list.
- Watch totals, pace trends, personal bests, annual goals, and training load.
- Open the latest workout directly, or compare two efforts from the list.
- Use tags and filters to keep specific sessions easy to find later.

When rowplay only has recent history, the dashboard will say so. Run **Sync** to
load the full history before relying on long-range personal bests or trends.

## Replay a workout

The replay view synchronizes the course, gauges, and telemetry charts.

- Press play or pause to control playback.
- Scrub the timeline to inspect a specific point.
- Change speed from 0.5x to 8x.
- Switch between 2D and 3D renderers when the browser supports WebGL.
- Add coaching notes at a point in the workout.
- Export the workout when you need CSV, JSON, or replay data elsewhere.

Per-stroke data is used when Concept2 provides it. Workouts without stroke data
fall back to a split-based replay, so the course still plays back.

## Race ghosts and compare workouts

Ghost racing lets you chase another trace on the same replay timeline.

- Use `/leaderboard` to find standard-distance results and start a rival ghost.
- Use replay controls to compare your pacing against the ghost.
- Use `/compare` when you want a side-by-side summary of two workouts.
- Share a public replay link when you want someone else to inspect a workout.

Publishing to the leaderboard is opt-in and reversible. It does not change the
source Concept2 logbook entry.

## Live mode and imports

Live mode can poll for new workouts after a session and notify you when fresh
data appears. Heart-rate import can merge external HR data into a workout when
the logbook entry does not already include it.

Use the Workers preview runtime for local auth, sync, live mode, and KV/D1
testing:

```bash
pnpm preview
```

Plain `pnpm dev` is faster for UI work, but it is not the Workers runtime and
does not provide the production KV/D1 bindings.

## Contributor documentation policy

This guide is intentionally stored in the repository as the English reference
for contributors. The in-app `/docs` page renders guide content through the
locale dictionaries so every bundled language uses the same i18n path.

When a change alters user-visible behavior, workflows, routes, auth, data
handling, setup, or deployment expectations, update this file in the same pull
request.
