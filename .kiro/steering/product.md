# Product Context

## Overview

**rowplay** is a Concept2 logbook analytics app with a real-time workout replay, deployed on Cloudflare. It connects to a user's Concept2 Logbook and turns every RowErg, SkiErg, and BikeErg result into interactive visualizations and telemetry.

## Target Users

Indoor rowing, skiing, and cycling athletes who log workouts on Concept2 ergometers and want deeper insight into their training data than the stock Concept2 logbook provides.

## Key Features

- **Dashboard** — totals, pace trend chart, and per-sport (row / ski / bike) filtering across all logged workouts. Includes a Performance Management Chart (PMC) showing Fitness/Fatigue/Form.
- **Real-time replay** — an avatar racing a virtual course with synchronized pace, stroke-rate, power, and heart-rate gauges plus telemetry charts. Supports play / pause / scrub / speed (0.5x–8x) controls.
- **Ghost racing** — race a past session as a ghost alongside the current replay. The replay engine's `sampleAt` is a pure function and the renderer supports a second avatar lane; ghost selection logic lives in `ghostPick.ts`.
- **Workout comparison** — side-by-side comparison of two workouts.
- **Per-stroke resolution** — when per-stroke data is available the replay uses it; workouts without it fall back to a lower-resolution replay synthesized from splits.
- **Analytics** — critical power (CP/W′) model, power-duration curve, interval breakdown, training calendar heatmap, HR zones, technique metrics (DPS, pace consistency, fade).
- **Annual goal tracking** — set a distance or time goal for the year; progress shown on the dashboard.
- **Settings** — language, theme, annual goal, and account management (including data deletion).
- **Demo mode** — serves deterministic mock data when no Concept2 client ID is configured, so the app works out of the box with zero setup.
- **Bring-your-own-token auth** — users can paste their own Concept2 API token directly instead of going through the OAuth flow, so a single deployment serves anyone without a shared client secret.
- **Shareable replays** — generate a public share link (`/r/[token]`) for a replay.
- **Workout export** — export workout data for external use.
- **Internationalization** — full English and Chinese (Simplified) UI via a hand-rolled i18n system; language toggles instantly with no page reload.
- **Light / dark theme** — defaults to dark; the user can toggle and the preference persists across sessions.

## Non-Affiliation

Not affiliated with Concept2. "Concept2", "RowErg", "SkiErg", and "BikeErg" are trademarks of Concept2.
