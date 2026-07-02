# Milestone Tracking — Tasks

Implementation plan. Requirement references point at `requirements.md`.

- [x] **1. Pure milestones core** — `src/lib/milestones.ts`
  - Types: `Milestone`.
  - Milestone definitions: lifetime distance (per sport + combined, 7
    thresholds), session count (8 thresholds), streak (5 thresholds), 2k
    speed gates (4 thresholds).
  - `computeMilestones(workouts, personalBests): Milestone[]`
    - Lifetime distance: sum metres per sport from `workouts`; compare each
      threshold.
    - Session count: count workouts total.
    - Streak: sort workouts by date; walk the list using `datetime.ts` day keys to
      count the current/longest streak; mark the relevant threshold milestones.
    - 2k speed gates: compare `personalBests` for distance=2000, sport='rower'
      against each time threshold.
    - Progress: `Math.min(currentValue / threshold, 1)`.
    - `achievedAt`: date of the workout that crossed the threshold (or PB date
      for speed gates); requires a scan to find the exact crossing point.
  - `nextMilestones(all, limit): Milestone[]`
    - Filter unachieved; sort by `progress` desc; take `limit`.
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] **2. Unit tests** — `src/lib/milestones.test.ts`
  - Lifetime distance: workouts summing to exactly a threshold → `achieved`;
    one metre below → not achieved; progress formula.
  - Session count: same boundary test.
  - Streak: consecutive days → correct count; gap of 1 or more skipped days
    resets (difference of >= 2 days between workout dates); consecutive days
    (difference of 1 day) does not reset; single workout → streak of 1.
  - Speed gate: PB of exactly 7:00 → `pb_2k_sub7` NOT achieved (strictly <);
    6:59.9 → achieved.
  - `nextMilestones` returns highest-progress unachieved first.
  - _Requirements: 3.1_

- [x] **3. Dashboard milestones panel** — `src/routes/dashboard/+page.svelte`
  - Call `computeMilestones(workouts, personalBests)`.
  - Hide panel when 0 achieved and < 3 workouts.
  - Achieved milestones: horizontally scrollable row of `card card-compact`
    elements, each with a Lucide icon, i18n label, and `achievedAt` date.
  - "Up next" card: last in the row, greyed, with daisyUI `progress` element
    and current/threshold values.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] **4. Live-mode toast integration** — `src/lib/liveMode.svelte.ts`
  - After each successful sync: snapshot milestone state before and after;
    call `toast.success` for each newly achieved milestone, using the `.toast`
    i18n key variant.
  - _Requirements: 2.1, 2.2_

- [x] **5. i18n keys** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
  - Add `milestone.title`, `milestone.next`, and one base + `.toast` pair per
    defined milestone to all six locale files.
  - `pnpm run validate:locales` passes.
  - _Requirements: 3.2_

- [x] **6. Quality gate**
  - `pnpm run check` → 0 errors.
  - `pnpm run build` → succeeds.
  - `pnpm run test` → green; count ≥ previous.
  - _Requirements: 3.3, 3.4_
