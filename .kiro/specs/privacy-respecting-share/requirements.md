# Privacy-respecting share — requirements

## Problem

rowplay mints a public `/r/{token}` link for any workout the signed-in athlete
owns. Concept2 workouts carry a `privacy` level (`everyone`, `logged_in`,
`partners`, `private`); rowplay currently ignores it, so a `private` workout can
be exposed to the whole internet — silently overriding the athlete's stated
preference. This violates the project tenet **"never accept wrong, meaningless
representations"**: a public link for a non-public workout misrepresents the
athlete's intent.

## Requirements

### R1 — Block non-public shares

Creating a public share link MUST be refused unless the workout's Concept2
`privacy` is exactly `everyone`. `logged_in`, `partners`, `private`, and any
absent or unrecognised value MUST be blocked (fail closed).

### R2 — Central enforcement

The block MUST live in `createWorkoutShare` so every caller — the
`/api/workouts/[id]/share` endpoint and `publishWorkout` (leaderboard) —
inherits it automatically, with no per-caller duplication.

### R3 — Clear, localized feedback

A blocked share MUST return HTTP 403, and the UI MUST surface a localized
message (`share.privacyBlocked`) explaining that the athlete can set their
Concept2 privacy to "Everyone" first. Available in all six locales.

### R4 — Pure, tested predicate

The public/non-public decision MUST be a pure, DOM-free predicate
(`isPubliclyShareable`) with unit tests, following the `analytics.ts` /
`workoutQuery.ts` convention.

### R5 — Demo coverage

Demo mock workouts MUST carry explicit `privacy` values so both the allow path
(`everyone`) and the block path (a non-public level) are exercisable without
Concept2 credentials.
