# Product Context

## Overview

**rowplay** is a Concept2 logbook analytics app with a real-time workout replay, deployed on Cloudflare. It connects to a user's Concept2 Logbook and turns every RowErg, SkiErg, and BikeErg result into interactive visualizations and telemetry.

## Target Users

Indoor rowing, skiing, and cycling athletes who log workouts on Concept2 ergometers and want deeper insight into their training data than the stock Concept2 logbook provides.

## Key Features

- **Dashboard** — totals, pace trend chart, and per-sport (row / ski / bike) filtering across all logged workouts.
- **Real-time replay** — an avatar racing a virtual course with synchronized pace, stroke-rate, power, and heart-rate gauges plus telemetry charts. Supports play / pause / scrub / speed (0.5x–8x) controls.
- **Per-stroke resolution** — when per-stroke data is available the replay uses it; workouts without it fall back to a lower-resolution replay synthesized from splits.
- **Demo mode** — serves deterministic mock data when no Concept2 client ID is configured, so the app works out of the box with zero setup.
- **Bring-your-own-token auth** — users can paste their own Concept2 API token directly instead of going through the OAuth flow, so a single deployment serves anyone without a shared client secret.
- **Internationalization** — full English and Chinese (Simplified) UI via a hand-rolled i18n system; language toggles instantly with no page reload.
- **Light / dark theme** — defaults to dark; the user can toggle and the preference persists across sessions.

## Future Direction

- **Ghost racing** — the replay engine's `sampleAt` is a pure function and the course renderer's geometry is a pure function of distance fraction, so racing a past session as a "ghost" means sampling a second stroke array and drawing a second avatar with no engine rework.

## Non-Affiliation

Not affiliated with Concept2. "Concept2", "RowErg", "SkiErg", and "BikeErg" are trademarks of Concept2.
