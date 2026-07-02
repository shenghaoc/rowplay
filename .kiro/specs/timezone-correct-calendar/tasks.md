# Timezone-correct Calendar — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`;
design references point at `design.md`.

**Dependency:** PR #61 (full-fidelity-data) captures `Workout.timezone` from
the Concept2 API. Tasks 1–4 below can be written and tested independently
(the field is already declared optional on `Workout`), but the per-workout
timezone path only activates in production once #61 is merged.

---

- [x] **1. `workoutLocalDayKey` + `todayKeyForTz`** — `src/lib/datetime.ts`
  - Add `workoutLocalDayKey(date, workoutTz?, homeTz?): string` implementing the
    resolution chain: workout tz → home tz → UTC; each timezone attempt wrapped
    in try/catch so an invalid IANA string falls through silently.
  - Add `todayKeyForTz(tz?): string` using `Intl.DateTimeFormat` with UTC fallback.
  - Both functions pure, DOM-free, exported.
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] **2. Unit tests — `datetime.ts`**
  - Vitest tests covering: UTC fallback (unchanged behaviour), cross-timezone
    late-night case (`"2024-01-14 23:30:00"` + `"America/New_York"` → `"2024-01-14"`),
    early-morning cross-day, home-tz-wins-when-no-workout-tz, workout-tz-wins-over-home-tz,
    invalid workout tz falls through to home tz, both-invalid falls through to UTC.
  - Tests for `todayKeyForTz` with and without a valid timezone.
  - _Requirements: 1.4, 5.1_

- [x] **3. Analytics bucketing** — `src/lib/analytics.ts`
  - Update `workoutDayKey` to delegate to `workoutLocalDayKey`, accepting the
    optional `workoutTz?` and `homeTz?` parameters.
  - Thread `homeTz?` through `aggregateDailyVolume`, `buildTrainingCalendar`,
    `trainingStreakStats`, `annualGoalProgress`, `hasEverySportWeek`, and
    `weeklyConsistency` (all as a final optional parameter; existing callers
    unchanged).
  - Replace bare `todayKeyUtc()` calls in streak/calendar end-day logic with
    `todayKeyForTz(homeTz)`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] **4. Analytics regression tests** — `src/lib/analytics.test.ts`
  - Add fixtures verifying `buildTrainingCalendar` with the cross-timezone mock
    workout (`date: "2024-01-14 23:30:00"`, `timezone: "America/New_York"`)
    places it on `2024-01-14` with `homeTz: "America/New_York"` and on
    `2024-01-15` (or `2024-01-14`, whichever UTC midnight gives) without `homeTz`.
  - Confirm no existing analytics tests regress (all default callers omit `homeTz`).
  - _Requirements: 2.4, 5.1_

- [x] **5. Timezone options list** — `src/lib/timezoneOptions.ts` (new file)
  - Static curated list of ~60 IANA identifiers covering every inhabited UTC
    offset, grouped by region (Americas, Europe/Africa, Asia/Pacific).
  - Exported as `TIMEZONE_OPTIONS: { group: string; options: { value: string; label: string }[] }[]`.
  - No runtime Intl lookups; pure compile-time constant.
  - _Requirements: 3.1_

- [x] **6. Session KV — home timezone** — `src/lib/server/session.ts`
  - Add optional `homeTimezone?: string` to the session record type.
  - Expose `getHomeTimezone(session)` and `setHomeTimezone(session, tz)` helpers
    (or inline in the settings action).
  - _Requirements: 3.2_

- [x] **7. Settings page — home timezone panel** — `src/routes/settings/`
  - `+page.server.ts`: load action reads `homeTimezone` from session KV and
    returns it; `saveTimezone` action validates and writes it back.
  - `+page.svelte`: add a new "Home timezone" panel (between data facts and
    export panels) with the grouped `<select>` bound to the current value,
    submitting on change via `fetch`. In demo mode, read/write `localStorage`
    key `rowplay:homeTimezone` instead.
  - Use daisyUI `select select-bordered` component class.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] **8. Dashboard server load — thread `homeTz`** — `src/routes/dashboard/+page.server.ts`
  - Read `homeTimezone` from the session (or `undefined` for demo).
  - Pass as `options.homeTz` to `buildTrainingCalendar` and `trainingStreakStats`.
  - Return `homeTimezone` in `data` so the client can use it for demo-mode
    `localStorage` round-trip.
  - _Requirements: 2.2, 2.3, 4.2_

- [x] **9. Demo mock data** — `src/lib/mockData.ts`
  - Add cross-timezone fixture workout:
    `{ id: 9001, date: '2024-01-14 23:30:00', timezone: 'America/New_York', sport: 'rower', distance: 5000, time: 1260, pace: 126, hasStrokeData: false }`.
  - Verify heatmap and streak in demo mode show correct bucketing for both
    UTC-fallback and `homeTz: "America/New_York"` paths.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] **10. i18n** — all six locale files
  - Add `settings.timezoneTitle`, `settings.timezoneNote`, `settings.timezoneLabel`,
    `settings.timezoneSaved`, `settings.timezoneUtcDefault`,
    `settings.timezoneGroupAmericas`, `settings.timezoneGroupEuropeAfrica`,
    `settings.timezoneGroupAsiaPacific` to `en`, `zh`, `de`, `es`, `fr`, `ja`.
  - Run `pnpm run validate:locales`.
  - _Requirements: 3.5, 5.2_

- [x] **11. Quality gate**
  - `pnpm run check` → 0 errors.
  - `pnpm run build` → succeeds.
  - `pnpm run test` → all green (including new unit tests from tasks 2 and 4).
  - `pnpm run validate:locales` → passes.
  - Manual smoke: `/dashboard` in `pnpm run dev` shows heatmap; change home
    timezone in settings and confirm calendar re-renders with correct bucketing.
  - _Requirements: 5.3, 5.4_
