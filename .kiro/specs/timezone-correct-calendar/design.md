# Timezone-correct Calendar — Design

## Overview

Every workout in rowplay's calendar must land on the day it *actually happened*
for the athlete. The current code slices `workout.date` at position 10 to get a
`YYYY-MM-DD` key; because `date` is a wall-clock string with no offset, this is
implicitly UTC. A resolution chain fixes this: per-workout timezone → user home
timezone → UTC, using native Temporal timezone data so DST boundaries are
handled correctly without a bundled polyfill.

```
workout.date  +  workout.timezone?  +  homeTz?
         │
         ▼
  workoutLocalDayKey(date, workoutTz?, homeTz?)   ← datetime.ts (Temporal)
         │
         ├─ workoutTz present & valid?  → parse as monitor-local wall time in workoutTz
         ├─ homeTz present & valid?     → format converted instant in homeTz
         └─ fallback                    → date.slice(0, 10)  (same as today's workoutDayKey)
         │
         ▼
  YYYY-MM-DD  (the day key passed into all calendar/streak/goal functions)
```

## Pure helpers — `src/lib/datetime.ts`

### `workoutLocalDayKey`

```ts
/**
 * Resolve the calendar day key for a workout using the resolution chain:
 *   1. workout's own timezone (most accurate)
 *   2. user's home timezone (fallback for older/missing workout tz)
 *   3. UTC (final fallback — same as today's workoutDayKey behaviour)
 *
 * Returns a `YYYY-MM-DD` string. Never throws.
 */
export function workoutLocalDayKey(
  date: string,
  workoutTz?: string,
  homeTz?: string
): string
```

Implementation:

1. Parse `date` with `parseLogbookDateTime` into a strict Temporal plain date-time.
2. If `workoutTz` and a different `homeTz` are present, convert the monitor-local
   wall time through `Temporal.PlainDateTime.toZonedDateTime()` and
   `Temporal.ZonedDateTime.withTimeZone()`.
3. If `workoutTz` is present without a different `homeTz`, return the plain date
   slice because the monitor-local wall date is already the workout day.
4. Return `date.slice(0, 10)` when timezone conversion is absent or invalid.

Rationale for try/catch: the IANA timezone list is not exhaustive. A corrupt
`timezone` field must not crash the calendar.

### `todayKeyForTz`

```ts
/**
 * Today as YYYY-MM-DD in the given IANA timezone (defaults to UTC when `tz` is
 * absent or invalid).  Use at streak/grid end-day so "today" is consistent with
 * workout bucketing.
 */
export function todayKeyForTz(tz?: string): string
```

- `tz` present and valid → `Temporal.Now.plainDateISO(tz)`
- absent or invalid → `todayKeyUtc()` (existing helper, no regression)

## Analytics changes — `src/lib/analytics.ts`

### `workoutDayKey` (updated signature)

The existing `workoutDayKey(date: string): string` is widened to accept the two
optional timezone arguments and delegate:

```ts
export function workoutDayKey(
  date: string,
  workoutTz?: string,
  homeTz?: string
): string {
  return workoutLocalDayKey(date, workoutTz, homeTz);
}
```

All internal callers pass the workout's `.timezone` field and the `homeTz`
threaded down from the calling context. Because both new parameters are optional
and the fallback is the existing UTC slice, all callers that don't pass them
behave identically to before.

### Functions that gain `homeTz?: string`

The following functions receive a new final optional parameter and thread it to
`workoutDayKey` / `workoutLocalDayKey`:

| Function | Change |
|---|---|
| `aggregateDailyVolume(workouts, homeTz?)` | passes `w.timezone` + `homeTz` to `workoutDayKey` |
| `buildTrainingCalendar(workouts, options?)` | `options.homeTz?` → forwarded to `aggregateDailyVolume`; `todayKeyForTz(options.homeTz)` replaces bare `todayKeyUtc()` |
| `trainingStreaks(activeDayKeys, endDay)` | no change needed (operates on already-resolved keys) |
| `trainingStreakStats(workouts, endDay?, homeTz?)` | uses `todayKeyForTz(homeTz)` for default `endDay`; passes `homeTz` into `aggregateDailyVolume` |
| `annualGoalProgress(workouts, goal, endDay?, homeTz?)` | uses `todayKeyForTz(homeTz)` for default `endDay`; `workoutDayKey` call picks up `homeTz` |
| `hasEverySportWeek(workouts, homeTz?)` | passes `w.timezone` + `homeTz` to `workoutDayKey` |
| `weeklyConsistency(workouts, endDay, lookbackWeeks, homeTz?)` | passes `homeTz` into `aggregateDailyVolume` |

All changes are backward-compatible: callers that omit `homeTz` get UTC
behaviour as before.

### `trainingLoad` (no signature change)

`trainingLoad` already calls `dayKeyEpochMillis(w.date.slice(0, 10))` directly
for the PMC day accumulation. PMC data is not calendar-display data; the
date-of-workout attribution is less critical (a piece rows against a continuous
exponential, not a discrete streak), so this function is **not changed** in this
spec. A follow-up can revisit if needed.

## Settings — home timezone

### KV shape

A new optional field `homeTimezone?: string` is added to the session KV record
(alongside `lastSyncAt`, `total`, etc. in `session.ts`). The worker reads this
on each request that performs calendar operations.

### `src/routes/settings/+page.server.ts`

- `load`: read `homeTimezone` from the session KV and return it as
  `data.homeTimezone`.
- `actions.saveTimezone`: accept a `FormData` `timezone` value; validate it is
  a non-empty string (no structural IANA check — that burden is on the UI);
  write it back to the session KV.

### `src/routes/settings/+page.svelte`

A new **Home timezone** panel (between existing "What we store" and "Export"
panels):

```
<article class="panel">
  <h2><Globe size={18} /> {t('settings.timezoneTitle')}</h2>
  <p class="muted">{t('settings.timezoneNote')}</p>
  <label for="tz-select">{t('settings.timezoneLabel')}</label>
  <select id="tz-select" name="timezone" bind:value={selectedTz} onchange={saveTimezone}>
    <!-- grouped by UTC offset, populated from TIMEZONE_OPTIONS constant -->
  </select>
</article>
```

`saveTimezone` submits the new value immediately via `fetch` (no page reload).
In demo mode the handler writes to `localStorage('rowplay:homeTimezone')` instead.

### Timezone option list

A compile-time constant `TIMEZONE_OPTIONS` in a new small file
`src/lib/timezoneOptions.ts` (pure, no runtime lookups). It exports a curated
list of ~60 IANA identifiers covering every inhabited UTC offset, grouped by
region (Americas, Europe/Africa, Asia/Pacific). The list is static to keep
bundle size bounded — no `Intl.supportedValuesOf('timeZone')` at runtime.

The select uses `<optgroup label>` for grouping; option labels are
`(UTC±HH:MM) Region/City` format; the IANA identifier is the `value`.

## Dashboard / calendar server load

`src/routes/dashboard/+page.server.ts` reads `homeTimezone` from the session
(or returns `undefined` for demo mode) and passes it to `buildTrainingCalendar`
and `trainingStreakStats` as `options.homeTz`. In demo mode, `homeTimezone`
comes from whatever was saved in the page's `data` prop (propagated from
`+layout.server.ts` or a client-side read of `localStorage`).

## Demo mode

`src/lib/mockData.ts` gains one cross-timezone workout:

```ts
{
  id: 9001,
  date: '2024-01-14 23:30:00',   // 23:30 wall-clock
  timezone: 'America/New_York',   // UTC-5 in January → local time 18:30 Jan 14
  sport: 'rower',
  distance: 5000,
  time: 1260,
  pace: 126,
  hasStrokeData: false
}
```

Under naive UTC slicing this would appear on `2024-01-15`; with the resolution
chain it correctly appears on `2024-01-14`. Demo mode uses this fixture in the
heatmap and streak so both paths can be verified without a real account.

## i18n

New `settings.timezone*` keys in all six locale files:

| Key | English value |
|---|---|
| `settings.timezoneTitle` | `'Home timezone'` |
| `settings.timezoneNote` | `'Choose your local timezone so workouts rowed near midnight appear on the right calendar day.'` |
| `settings.timezoneLabel` | `'Home timezone'` |
| `settings.timezoneSaved` | `'Timezone saved'` |
| `settings.timezoneUtcDefault` | `'UTC (default)'` |
| `settings.timezoneGroupAmericas` | `'Americas'` |
| `settings.timezoneGroupEuropeAfrica` | `'Europe / Africa'` |
| `settings.timezoneGroupAsiaPacific` | `'Asia / Pacific'` |

## Testing

### Unit tests — `src/lib/datetime.test.ts` (or new `datetime.timezone.test.ts`)

| Test | Input | Expected |
|---|---|---|
| UTC fallback | `"2024-01-15 01:00:00"`, no tz | `"2024-01-15"` |
| Cross-timezone, late-night | `"2024-01-14 23:30:00"`, `workoutTz: "America/New_York"` | `"2024-01-14"` |
| Cross-timezone, early morning | `"2024-01-15 00:30:00"`, `workoutTz: "America/New_York"` | `"2024-01-14"` |
| Home timezone wins when no workout tz | `"2024-01-14 23:30:00"`, no workoutTz, `homeTz: "America/New_York"` | `"2024-01-14"` |
| Workout tz wins over home tz | `"2024-01-14 23:30:00"`, `workoutTz: "Pacific/Auckland"` (UTC+13), `homeTz: "America/New_York"` | `"2024-01-15"` (already next day in Auckland) |
| Invalid workout tz falls through to home tz | `"2024-01-14 23:30:00"`, `workoutTz: "Not/Real"`, `homeTz: "America/New_York"` | `"2024-01-14"` |
| Invalid workout tz and invalid home tz fall through to UTC | `"2024-01-14 23:30:00"`, `workoutTz: "Bad"`, `homeTz: "Also/Bad"` | `"2024-01-14"` (UTC midnight is still Jan 14) |
| `todayKeyForTz` with valid tz | deterministic Temporal clock | matches expected local date |
| `todayKeyForTz` with no tz | — | same as `todayKeyUtc()` |

### Regression — `src/lib/analytics.test.ts`

Add a fixture verifying that `buildTrainingCalendar` with the cross-timezone
mock workout and `homeTz: "America/New_York"` places it on `2024-01-14`, and
that without `homeTz` (UTC) it would place it on `2024-01-15`. This makes the
mis-bucketing explicit and prevents regression.

## Dependency on PR #61

- `Workout.timezone` is typed as `timezone?: string` in `types.ts` (already
  present from the full-fidelity-data spec).
- If #61 has not landed, `workout.timezone` is always `undefined` and the
  resolution chain always falls through to `homeTz` or UTC — which is correct
  and safe.
- Once #61 lands, the per-workout path activates automatically for workouts that
  carry a timezone value, with no further change needed.

## Out of scope

- Retroactive re-bucketing of existing D1 cached summaries — the calendar is
  re-computed from the `Workout[]` list on every dashboard load; no migration is
  needed.
- Timezone-aware streak display in the replay view (workout-detail page) — the
  replay date shown in the header uses `fmtDate`, which already respects ISO
  timestamp offsets through Temporal; no change needed there.
- The PMC (`trainingLoad`) date accumulation — intentionally deferred (see
  above).
- Automatic timezone detection from the browser's `Intl.DateTimeFormat` — the
  selector defaults to UTC; a future UX improvement could pre-fill with
  `Intl.DateTimeFormat().resolvedOptions().timeZone` but that is out of scope
  here.
