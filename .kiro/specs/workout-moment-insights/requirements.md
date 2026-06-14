# Requirements — Workout moment insights

## Goal

Add a post-workout “Workout moments” panel to the replay page that turns already-loaded replay/detail data into clear, clickable coaching moments.

## In scope

- Identify best sustained push from rolling work windows.
- Identify slower work patches while excluding rests.
- Identify efficient rhythm windows where pace is strong without requiring the highest cadence.
- Identify finish trend across first and final thirds.
- Identify best and slowest interval reps from existing split/interval data.
- Let each moment seek the replay to its start time.
- Degrade gracefully for split-derived, low-resolution detail.

## Out of scope

- No active PM5 capture.
- No new live polling.
- No changes to `src/lib/liveMode.ts`, `src/lib/liveMode.svelte.ts`, or `src/routes/api/live/*`.
- No new Concept2 endpoints or write calls.
- No auth, token, session, or BYOT redesign.
- No D1 migration or new Cloudflare binding.
- No leaderboard, share, or privacy behavior changes.
- No new comparison-with-PM5 UI.

## Acceptance criteria

- Demo replay shows moment cards when enough data exists.
- Interval workouts show best/slowest rep cards when split data supports them.
- Clicking a moment seeks the replay.
- Rest intervals are not labeled as poor performance.
- Missing HR does not suppress non-HR insights.
- Low-resolution/split-derived workouts render safely and are labeled as split-based.
- Locale validation and unit tests pass.
