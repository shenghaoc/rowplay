# Timezone-correct Calendar — Requirements

## Introduction

rowplay's training calendar (heatmap, streaks, "today" bucketing) places each
workout on a calendar day by slicing the raw `date` string (`YYYY-MM-DD
HH:MM:SS`) at the UTC midnight boundary. For an athlete who rows at 11 pm in
Tokyo, Auckland, or Chicago, that piece lands on the **wrong calendar day**
from the athlete's perspective, silently breaking a streak that is actually
intact and distorting heatmap density.

The root is architectural: logbook `date` strings are wall-clock times with no
offset, and the project has long treated them as UTC. The Concept2 result model
carries a per-workout `timezone` IANA field (e.g. `"America/Chicago"`) which
the full-fidelity-data spec (PR #61 dependency) captures. This spec makes the
calendar use that field — and a user-settable home timezone as a fallback —
so every workout lands on the day it actually happened.

The guiding tenet: **never accept wrong, meaningless representations.** A
streak shown as broken when it is intact is worse than no streak at all.

It obeys every project rule in `AGENTS.md`: works in **demo mode**, every
new string through **i18n** in all six locales, pure calendar math is DOM-free
and unit-tested with deterministic fixtures (including a cross-timezone
late-night case that would bucket wrong under UTC), and it passes the full
quality gate (`check` + `build` + `test` + `validate:locales`).

## Glossary

- **Day key** — a `YYYY-MM-DD` string identifying a calendar day; the atomic
  unit of the heatmap, streak, and goal-progress logic.
- **Workout timezone** — the IANA timezone identifier on the Concept2 result
  (`workout.timezone`); the most authoritative source of *where* the piece was
  rowed.
- **Home timezone** — a user-configurable IANA timezone stored in user
  preferences (settings page); the fallback when a workout carries no
  per-workout timezone.
- **UTC fallback** — silent last resort when neither workout timezone nor home
  timezone is available (legacy data, demo mode where no preference is set).
- **Resolution chain** — the ordered lookup: workout timezone → home timezone
  → UTC.
- **Cross-timezone boundary piece** — a workout whose wall-clock `date` sliced
  at UTC midnight falls on a different day than it does in the workout's actual
  timezone (e.g. rowed at 23:30 UTC−2 lands on `date` UTC day+1).

## Dependency

**PR #61 (full-fidelity-data)** — captures `timezone` from the Concept2
result onto `Workout.timezone`. This spec's implementation task for the
day-key function depends on that field being present on `Workout`. The spec
is written to degrade gracefully (UTC fallback) when `timezone` is absent, so
the two specs can ship independently, but the per-workout timezone path only
becomes meaningful after #61 lands.

## Requirements

### Requirement 1 — Timezone-aware day-key resolution

**User story:** As an athlete in a non-UTC timezone, I want each workout placed
on the calendar day it actually happened in my location, so that heatmap and
streak data reflect my real training pattern.

#### Acceptance criteria

1. THE system SHALL resolve the calendar day key for a workout by applying the
   **resolution chain**: if `workout.timezone` is a non-empty IANA identifier
   then interpret `workout.date` in that timezone; else if a user home timezone
   is set then interpret in that timezone; else interpret as UTC.
2. THE day-key function SHALL be a pure, DOM-free helper in `src/lib/datetime.ts`
   with the signature `workoutLocalDayKey(date: string, workoutTz?: string,
   homeTz?: string): string`, returning a `YYYY-MM-DD` day key.
3. THE function SHALL use the Temporal polyfill already present in the project
   (`Temporal.ZonedDateTime` / `Temporal.PlainDateTime.toZonedDateTime`) for
   all timezone conversions; no `Date`-object arithmetic or manual offset math
   is permitted.
4. THE function SHALL be unit-tested with Vitest, including: a piece at
   `"2024-01-14 23:30:00"` with `workoutTz: "America/New_York"` (UTC−5 in
   January) which resolves to `"2024-01-14"` where a naive UTC slice would give
   `"2024-01-15"`; a piece where workout timezone differs from home timezone; and
   a piece where both timezone fields are absent (UTC fallback, same output as
   the existing `workoutDayKey`).
5. WHERE a `workout.timezone` string is present but not recognised as a valid
   IANA identifier THE function SHALL silently fall through to the home timezone
   (or UTC) rather than throwing, so a corrupt field cannot break the calendar.

### Requirement 2 — Calendar and analytics bucketing use the resolved day key

**User story:** As an athlete, I want the heatmap, streak count, and
year-to-date goal progress all agree on which day a workout belongs to, so
that no surface contradicts another.

#### Acceptance criteria

1. THE `workoutDayKey` helper in `src/lib/analytics.ts` SHALL be updated (or
   replaced at all call sites) to delegate to `workoutLocalDayKey` from
   `datetime.ts`, forwarding the per-workout `timezone` field and the resolved
   home timezone from the calling context.
2. THE functions `aggregateDailyVolume`, `buildTrainingCalendar`,
   `weeklyConsistency`, `trainingStreakStats`, `annualGoalProgress`, and
   `hasEverySportWeek` SHALL all accept an optional `homeTz?: string` parameter
   and pass it through to `workoutLocalDayKey`, so all bucketing is consistent.
   (`trainingStreaks` itself operates on already-resolved day keys and needs no
   `homeTz` — see design.md.)
3. THE "today" key used for calendar grid end and streak end-day SHALL respect
   the same timezone: a `todayKeyForTz(tz?: string): string` helper SHALL be
   added to `datetime.ts`, returning today's date in the given IANA timezone
   (defaulting to UTC when `tz` is absent or invalid), and used in place of bare
   `todayKeyUtc()` calls in streak and goal functions when a home timezone is
   available.
4. WHEN all workouts carry no `timezone` field AND no home timezone is set THEN
   the calendar SHALL produce byte-identical output to the pre-feature UTC
   behaviour, preserving backward compatibility.

### Requirement 3 — User-settable home timezone

**User story:** As an athlete who travels or whose per-workout timezone field
is absent on older data, I want to set a default home timezone in settings so
that my historical workouts are bucketed correctly.

#### Acceptance criteria

1. THE settings page SHALL expose a **Home timezone** section with a labeled
   `<select>` control listing a practical set of IANA timezone identifiers
   grouped by UTC offset, so the athlete can choose their local timezone once.
2. THE selected home timezone SHALL be persisted server-side in the user's
   session KV entry (key `homeTimezone`), loaded by the settings page server
   load function, and propagated to the dashboard and calendar endpoints via the
   session.
3. IN demo mode THE home timezone preference SHALL be stored client-side only
   (key `rowplay:homeTimezone` in `localStorage`) because there is no session KV;
   on page load it SHALL be read back and used for bucketing without any server
   round-trip.
4. THE selector SHALL default to `"UTC"` when no preference has been set, and
   SHALL display a hint explaining that choosing the athlete's own timezone
   improves streak and heatmap accuracy.
5. EVERY label, hint, and option-group heading SHALL be i18n'd in all six
   locales; IANA timezone identifiers and UTC offset strings are not translated.
6. THE selector SHALL be keyboard-navigable and have a visible label associated
   via `for`/`id` so screen readers announce it correctly.

### Requirement 4 — Demo mode and mock data coverage

**User story:** As a developer testing in demo mode, I want the timezone
feature to exercise its full resolution chain without needing a real Concept2
account, so that I can verify correctness locally.

#### Acceptance criteria

1. THE mock workouts in `src/lib/mockData.ts` SHALL include at least one workout
   with a `timezone` value that would land on a different UTC calendar day —
   specifically a workout at `"2024-01-14 23:30:00"` with
   `timezone: "America/New_York"` (UTC−5 in January), which is still Jan 14
   locally but would be Jan 15 under a naive UTC-midnight slice.
2. THE demo-mode server load response for the dashboard SHALL expose a
   `homeTimezone` value (defaulting to `undefined`, i.e. UTC fallback) so the
   existing demo snapshot behaviour is unaffected until the user changes the
   setting.
3. WHEN the demo home timezone is explicitly set to `"America/New_York"` the
   cross-timezone mock workout SHALL appear on `2024-01-14`, confirming the
   resolution chain works end-to-end in demo mode.

### Requirement 5 — Quality gate and i18n

#### Acceptance criteria

1. `workoutLocalDayKey` and `todayKeyForTz` SHALL be pure, DOM-free, and covered
   by Vitest unit tests; the cross-timezone late-night fixture (Req 1.4) MUST be
   present and passing.
2. EVERY user-visible string introduced by this feature SHALL appear in all six
   locale files (`en`, `zh`, `de`, `es`, `fr`, `ja`) and pass
   `pnpm run validate:locales`.
3. THE feature SHALL pass the full quality gate: `pnpm run check` (0 errors),
   `pnpm run build`, `pnpm run test`, `pnpm run validate:locales`.
4. THE dashboard and calendar views SHALL produce correct output in both
   `pnpm run dev` (vite, demo mode) and `pnpm run preview` (Workers runtime,
   real session KV).
