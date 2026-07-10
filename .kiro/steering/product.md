# Product Context

## Overview

rowplay is a Concept2 logbook analytics app with an interactive workout replay,
deployed on Cloudflare Workers. It turns RowErg, SkiErg, and BikeErg results
into dashboards, training analysis, and stroke-synchronised replays.

## Target Users

Indoor rowing, skiing, and cycling athletes who record workouts in the
Concept2 Logbook and want deeper insight than the stock logbook provides.

## Product Model

- **Demo first** — visitors without a session can explore deterministic sample
  workouts without credentials.
- **Bring your own token** — an athlete can paste a personal Concept2 API token;
  it is sealed in an httpOnly cookie and used only for server-side reads.
- **Stateless Worker** — authenticated history and replay detail are fetched
  live from Concept2. rowplay does not keep workout data, public links, or
  leaderboard data on its servers.
- **Private by default** — sharing and publishing are not product features.

## Key Features

- **Dashboard** — totals, trends, personal bests, per-sport filters, calendar,
  training load, critical-power, and annual-goal progress from the live history.
- **Replay** — a 2D/3D stroke-synchronised course with play/pause/scrub/speed,
  telemetry charts, workout moments, and a target-pace reference.
- **Personal ghost racing** — race a comparable prior workout, a pace target, or
  an imported local workout file beside the current replay.
- **Exports and timezone** — `/settings` provides CSV/JSON/TCX export and an
  authenticated home-timezone preference.
- **Live mode** — optionally polls the newest Concept2 result page and surfaces
  newly logged workouts without storing a server-side cache.
- **Internationalization and theming** — English, Deutsch, Español, Français,
  日本語, and 中文; light/dark theme is stored in a preference cookie.

## Non-goals

- Public replay sharing, leaderboards, coaching annotations, manual persistent
  workout tags, server-persisted heart-rate imports, D1 sync/backfill, and
  account-data deletion are unavailable because they require server storage.
- rowplay never writes back to the Concept2 Logbook.

## Non-Affiliation

Not affiliated with Concept2. "Concept2", "RowErg", "SkiErg", and "BikeErg"
are trademarks of Concept2.
