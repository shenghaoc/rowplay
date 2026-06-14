# Design — Workout moment insights

## Data source

Use the existing `WorkoutDetail` object loaded by `src/routes/replay/[id]/+page.svelte`. The feature does not fetch, sync, or persist anything.

## Pure analysis module

`src/lib/workoutMoments.ts` exposes `analyzeWorkoutMoments(detail)`. It reads `detail.strokes` and `detail.splits`, filters to valid work samples, and returns display-ready moment objects with stable IDs, timestamps, distances, averages, and i18n reason keys.

For per-stroke workouts it builds 30s and 60s rolling windows. For low-resolution detail (`hasStrokeData === false`) it still uses the synthesized timeline, sets `lowResolution`, and keeps copy honest in the UI.

## Moment selection

- **Best sustained push:** fastest 60s window, falling back to 30s for short pieces.
- **Slower patch:** slowest work window only when meaningfully slower than the workout baseline.
- **Efficient rhythm:** fastest window at or below approximately average cadence.
- **Finish trend:** final third compared with first third.
- **Best/slowest rep:** fastest and slowest non-rest splits for interval workouts.

## UI

`WorkoutMomentCards.svelte` renders a daisyUI card panel with neutral, coaching-oriented labels. Each card has a “jump to moment” button calling the existing replay seek function.

## I18n and docs

All strings live under the existing `replay` dictionary in every locale. User-facing docs describe the panel as post-workout analysis from synced Logbook data.
